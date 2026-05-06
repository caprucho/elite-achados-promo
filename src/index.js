require('dotenv').config();
const { getActiveProducts, savePrice, getLowestPrice, getLastPrice, wasAlertRecentlySent, registerAlert, getPriceHistory, saveUnavailable, getConsecutiveUnavailableCount, getLastScanAt, getUnavailableStreakStart, wasUnavailableAlertSent, markUnavailableAlertSent, clearUnavailableAlertSent } = require('./db/queries');
const { getPrice }       = require('./scrapers');
const { sendPriceAlert, sendAdminMessage } = require('./bot/telegram');
const { closeBrowser }   = require('./scrapers/browser');

// Auto-inicia o bot interativo (polling) no mesmo processo, exceto em modo cron
// ou se explicitamente desligado. Set ENABLE_BOT_COMMANDS=false se rodar como
// serviço separado pra evitar conflito de polling (Telegram só permite 1 poller
// por token).
if (process.env.RUN_ONCE !== 'true' && process.env.ENABLE_BOT_COMMANDS !== 'false') {
  try {
    require('./commands');
  } catch (err) {
    console.warn('[Monitor] Bot interativo não iniciado:', err.message);
  }
}

process.on('SIGINT',  () => closeBrowser().then(() => process.exit(0)));
process.on('SIGTERM', () => closeBrowser().then(() => process.exit(0)));

const DROP_THRESHOLD            = parseFloat(process.env.DROP_THRESHOLD_PCT      || '20'); // queda vs último preço
const MIN_BEAT_THRESHOLD        = parseFloat(process.env.MIN_BEAT_THRESHOLD_PCT  || '5');  // % abaixo do mínimo histórico
const MIN_CHANGES_FOR_HISTORIC  = parseInt(process.env.MIN_CHANGES_FOR_HISTORIC  || '5', 10); // mín. alterações de preço pra disparar min_beat/min_hit
const UNAVAILABLE_THRESHOLD     = parseInt(process.env.UNAVAILABLE_THRESHOLD     || '3', 10); // scans consecutivos sem resposta
const UNAVAILABLE_BACKOFF_HOURS = parseFloat(process.env.UNAVAILABLE_BACKOFF_HOURS || '8');  // espera N horas entre scans de produto indisponível
const UNAVAILABLE_NOTIFY_DAYS   = parseFloat(process.env.UNAVAILABLE_NOTIFY_DAYS   || '7');  // notifica admin se ficar indisponível por N dias
const SAFETY_DROP_PCT           = parseFloat(process.env.SAFETY_DROP_PCT         || '80'); // queda > X% gatilha re-scrape de confirmação
const RECHECK_DELAY_MS          = parseInt(process.env.RECHECK_DELAY_MS          || '15000', 10);
const RECHECK_TOLERANCE_PCT     = parseFloat(process.env.RECHECK_TOLERANCE_PCT   || '5'); // diferença máx (%) entre 1ª e 2ª leitura
const INTERVAL_MS               = parseInt(process.env.SCAN_INTERVAL_MINUTES     || '30', 10) * 60 * 1000;
const REQUEST_DELAY_MS          = parseInt(process.env.REQUEST_DELAY_MS          || '3000', 10);

function countPriceChanges(history) {
  if (!history || history.length < 2) return 0;
  let n = 0;
  for (let i = 1; i < history.length; i++) {
    if (history[i].price !== history[i - 1].price) n++;
  }
  return n;
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function maybeNotifyLongUnavailable(product) {
  const { id, name, url, store } = product;
  const streakStart = await getUnavailableStreakStart(id);
  if (!streakStart) return;
  const days = (Date.now() - new Date(streakStart).getTime()) / 86400000;
  if (days < UNAVAILABLE_NOTIFY_DAYS) return;
  if (await wasUnavailableAlertSent(id)) return;

  await sendAdminMessage([
    `⚠️ *Produto indisponível há ${Math.floor(days)} dias*`,
    ``,
    `📦 *${name}*`,
    `🏪 ${store}`,
    `🔗 ${url}`,
    ``,
    `Verifique se o link quebrou ou o produto foi removido.`,
    `Pra desativar: \`/removerproduto ${id}\``,
  ].join('\n'));
  await markUnavailableAlertSent(id);
  console.log(`[Monitor] Notificação admin enviada — ${name} indisponível há ${days.toFixed(1)}d`);
}

async function processProduct(product) {
  const { id, name, url, store, category } = product;

  // Backoff: produto já indisponível espera UNAVAILABLE_BACKOFF_HOURS antes de novo scan
  const prevUnavailableCount = await getConsecutiveUnavailableCount(id);
  if (prevUnavailableCount > 0) {
    const lastScanAt = await getLastScanAt(id);
    const hoursAgo = lastScanAt
      ? (Date.now() - new Date(lastScanAt).getTime()) / 3600000
      : Infinity;
    if (hoursAgo < UNAVAILABLE_BACKOFF_HOURS) {
      // Pula esse scan — mas ainda checa se atingiu 7 dias pra notificar
      await maybeNotifyLongUnavailable(product);
      return;
    }
  }

  const result = await getPrice(url);

  if (!result) {
    // Registra indisponibilidade e loga
    await saveUnavailable(id);
    const newCount = prevUnavailableCount + 1;
    if (prevUnavailableCount === 0) {
      console.log(`[Monitor] Produto ficou indisponível — ${name}`);
    } else {
      console.log(`[Monitor] Produto continua indisponível (${newCount}x) — ${name}`);
    }
    // Pode ter atingido 7 dias agora
    await maybeNotifyLongUnavailable(product);
    return;
  }

  let { price: currentPrice, imageUrl } = result;

  // Reusa a contagem já calculada no backoff
  const wasUnavailable = prevUnavailableCount >= UNAVAILABLE_THRESHOLD;

  // Busca histórico ANTES de salvar o preço atual
  const [lastPrice, lowestPrice, priceHistory] = await Promise.all([
    getLastPrice(id),
    getLowestPrice(id),
    getPriceHistory(id),
  ]);

  // Sanity check: queda > SAFETY_DROP_PCT vs último preço = reconfirmar antes
  // de aceitar. Se a 2ª leitura confirmar o mesmo preço (±tolerância), é
  // ofertão real / bug de preço; se divergir ou falhar, descartamos como erro
  // de scraping.
  let isPriceBug = false;
  if (lastPrice && lastPrice > 0 && currentPrice < lastPrice * (1 - SAFETY_DROP_PCT / 100)) {
    console.warn(`[Monitor] Queda suspeita (${name}: R$ ${currentPrice} vs R$ ${lastPrice}) — reconfirmando em ${RECHECK_DELAY_MS / 1000}s...`);
    await sleep(RECHECK_DELAY_MS);
    const recheck = await getPrice(url);

    if (!recheck) {
      console.warn(`[Monitor] Reconfirmação retornou null — descartado: ${name}`);
      await saveUnavailable(id);
      return;
    }

    const diffPct = Math.abs(recheck.price - currentPrice) / currentPrice * 100;
    if (diffPct > RECHECK_TOLERANCE_PCT) {
      console.warn(`[Monitor] Leituras inconsistentes (R$ ${currentPrice} vs R$ ${recheck.price}, diff ${diffPct.toFixed(1)}%) — descartado: ${name}`);
      await saveUnavailable(id);
      return;
    }

    console.log(`[Monitor] 🐛 BUG DE PREÇO confirmado — ${name}: R$ ${recheck.price} (era R$ ${lastPrice})`);
    currentPrice = recheck.price;
    imageUrl     = recheck.imageUrl || imageUrl;
    isPriceBug = true;
  }

  await savePrice(id, currentPrice);

  // 🐛 BUG DE PREÇO — sobrepõe a lógica padrão (queda confirmada >SAFETY_DROP_PCT)
  if (isPriceBug) {
    const alreadySent = await wasAlertRecentlySent(id, currentPrice);
    if (!alreadySent) {
      const dropPct = ((lastPrice - currentPrice) / lastPrice) * 100;
      console.log(`[Monitor] 🐛 Enviando alerta de BUG — ${name}: ${currentPrice}`);
      await sendPriceAlert({
        name, url, store, category,
        currentPrice, lastPrice, lowestPrice,
        discountPct: dropPct,
        imageUrl, priceHistory,
        alertType: 'price_bug',
      });
      await registerAlert(id, currentPrice, dropPct);
    }
    return;
  }

  // Alerta de volta ao estoque — só se o produto JÁ ESTEVE disponível antes
  // (lowestPrice !== null significa que existe pelo menos 1 registro de preço válido)
  if (wasUnavailable && lowestPrice !== null) {
    // Produto voltou — limpa flag de notificação admin (caso 7d tivesse disparado)
    await clearUnavailableAlertSent(id);

    const alreadySent = await wasAlertRecentlySent(id, currentPrice);
    if (!alreadySent) {
      console.log(`[Monitor] Produto voltou ao estoque — ${name}: ${currentPrice}`);
      await sendPriceAlert({ name, url, store, category, currentPrice, lowestPrice, imageUrl, priceHistory, alertType: 'back_in_stock' });
      await registerAlert(id, currentPrice, 0);
    }
    return;
  }

  // Produto novo OU produto que nunca teve preço válido: registra silenciosamente
  if (lowestPrice === null) {
    console.log(`[Monitor] Primeiro registro disponível — ${name}: ${currentPrice}`);
    if (wasUnavailable) {
      // Limpa flag mesmo aqui (caso tivesse sido marcada por estar 7d sem dados)
      await clearUnavailableAlertSent(id);
    }
    return;
  }

  const discountFromMin = lowestPrice > 0
    ? ((lowestPrice - currentPrice) / lowestPrice) * 100
    : 0;
  const dropFromLast = lastPrice && lastPrice > 0
    ? ((lastPrice - currentPrice) / lastPrice) * 100
    : 0;

  // Histórico mínimo necessário pra alertas de "mínimo histórico" terem significado
  const priceChanges = countPriceChanges(priceHistory);
  const enoughHistory = priceChanges >= MIN_CHANGES_FOR_HISTORIC;

  // Condição A: 5%+ abaixo do mínimo histórico (melhor preço visto) — exige histórico
  const alertMinBeat = enoughHistory
    && currentPrice < lowestPrice
    && discountFromMin >= MIN_BEAT_THRESHOLD;

  // Condição B: atingiu o mínimo histórico vindo de um preço mais alto — exige histórico
  // lastPrice > lowestPrice garante que o preço caiu até o mínimo agora, não que já estava lá
  const alertMinHit = !alertMinBeat
    && enoughHistory
    && currentPrice <= lowestPrice
    && lastPrice !== null
    && lastPrice > lowestPrice;

  // Condição C: queda de 20%+ em relação ao último preço registrado
  const alertDrop = !alertMinBeat && !alertMinHit
    && lastPrice !== null && currentPrice < lastPrice && dropFromLast >= DROP_THRESHOLD;

  if (!alertMinBeat && !alertMinHit && !alertDrop) return;

  const alreadySent = await wasAlertRecentlySent(id, currentPrice);
  if (alreadySent) {
    console.log(`[Monitor] Alerta já enviado recentemente — ${name}`);
    return;
  }

  // Prioridade: A > B > C — envia apenas um alerta por evento
  if (alertMinBeat) {
    await sendPriceAlert({ name, url, store, category, currentPrice, lowestPrice, discountPct: discountFromMin, imageUrl, priceHistory, alertType: 'min_beat' });
    await registerAlert(id, currentPrice, discountFromMin);
  } else if (alertMinHit) {
    await sendPriceAlert({ name, url, store, category, currentPrice, lowestPrice, discountPct: 0, imageUrl, priceHistory, alertType: 'min_hit' });
    await registerAlert(id, currentPrice, 0);
  } else {
    await sendPriceAlert({ name, url, store, category, currentPrice, lastPrice, discountPct: dropFromLast, imageUrl, priceHistory, alertType: 'drop' });
    await registerAlert(id, currentPrice, dropFromLast);
  }
}

async function runScan() {
  console.log(`\n[Monitor] Iniciando varredura — ${new Date().toLocaleString('pt-BR')}`);

  const products = await getActiveProducts();
  if (!products.length) {
    console.warn('[Monitor] Nenhum produto ativo encontrado.');
    return;
  }

  console.log(`[Monitor] ${products.length} produto(s) para monitorar.`);

  // Processa em série com delay para não levar ban por rate limiting
  for (const product of products) {
    await processProduct(product);
    await sleep(REQUEST_DELAY_MS);
  }

  console.log('[Monitor] Varredura concluída.');
}

async function main() {
  // Modo cron (Railway): roda um scan e encerra o processo
  if (process.env.RUN_ONCE === 'true') {
    console.log('Elite Achados & Promo — modo cron.');
    console.log(`   Queda mínima  : ${DROP_THRESHOLD}% (último preço) | ${MIN_BEAT_THRESHOLD}% (mínimo histórico)\n`);
    await runScan();
    await closeBrowser();
    process.exit(0);
  }

  // Modo contínuo (local com pm2)
  console.log('Elite Achados & Promo iniciado.');
  console.log(`   Queda mínima  : ${DROP_THRESHOLD}% (último preço) | ${MIN_BEAT_THRESHOLD}% (mínimo histórico)`);
  console.log(`   Intervalo     : ${INTERVAL_MS / 60000} min\n`);

  await runScan();

  const schedule = () => setTimeout(async () => {
    await runScan();
    schedule();
  }, INTERVAL_MS);

  schedule();
}

main().catch((err) => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
