require('dotenv').config();
const { getActiveProducts, savePrice, getLowestPrice, getLastPrice, wasAlertRecentlySent, registerAlert, getPriceHistory, saveUnavailable, getConsecutiveUnavailableCount, getLastScanAt, getUnavailableStreakStart, wasUnavailableAlertSent, markUnavailableAlertSent, clearUnavailableAlertSent } = require('./db/queries');
const { getPrice }       = require('./scrapers');
const { sendPriceAlert, sendAdminMessage } = require('./bot/telegram');
const { closeBrowser }   = require('./scrapers/browser');
const { notifyError, recordAlert, recordScan, recordProduct, scheduleDailySummary } = require('./utils/adminAlerts');

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

// Last-resort: erros que escaparam do try-catch interno
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : '';
  console.error('[FATAL] unhandledRejection:', msg);
  notifyError('unhandled_rejection', msg, stack).catch(() => {});
});

process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err.message);
  notifyError('uncaught_exception', err.message, err.stack).catch(() => {});
  // Deixa o process morrer pra Railway reiniciar (estado pode ter ficado corrompido)
  setTimeout(() => process.exit(1), 2000);
});

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

// Conta mudanças significativas — ignora flutuações de centavos (oferta-do-dia
// no ML mexe o preço em R$ 0,01 entre scans, inflando o contador).
const PRICE_CHANGE_MIN_PCT = parseFloat(process.env.PRICE_CHANGE_MIN_PCT || '0.5'); // 0.5%
const PRICE_CHANGE_MIN_ABS = parseFloat(process.env.PRICE_CHANGE_MIN_ABS || '1');   // R$ 1
function countPriceChanges(history) {
  if (!history || history.length < 2) return 0;
  let n = 0;
  for (let i = 1; i < history.length; i++) {
    const a = history[i - 1].price;
    const b = history[i].price;
    if (a === b) continue;
    const absDiff = Math.abs(b - a);
    const pctDiff = a > 0 ? (absDiff / a) * 100 : 100;
    if (absDiff >= PRICE_CHANGE_MIN_ABS || pctDiff >= PRICE_CHANGE_MIN_PCT) n++;
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

// Retorna: 'ok' (produto disponível), 'fail' (scrape retornou null),
// 'skip' (em backoff, não foi tentado).
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
      await maybeNotifyLongUnavailable(product);
      return 'skip';
    }
  }

  const result = await getPrice(url);

  if (!result) {
    await saveUnavailable(id);
    const newCount = prevUnavailableCount + 1;
    if (prevUnavailableCount === 0) {
      console.log(`[Monitor] Produto ficou indisponível — ${name}`);
    } else {
      console.log(`[Monitor] Produto continua indisponível (${newCount}x) — ${name}`);
    }
    await maybeNotifyLongUnavailable(product);
    recordProduct(false);
    return 'fail';
  }

  let { price: currentPrice, imageUrl } = result;
  const wasUnavailable = prevUnavailableCount >= UNAVAILABLE_THRESHOLD;

  const [lastPrice, lowestPrice, priceHistory] = await Promise.all([
    getLastPrice(id),
    getLowestPrice(id),
    getPriceHistory(id),
  ]);

  // Sanity check: queda >SAFETY_DROP_PCT vs último preço = reconfirmar antes
  // de aceitar. Se a 2ª leitura confirmar (±tolerância) → ofertão / bug real.
  // Se divergir ou falhar → descarta como erro de scraping (retorna 'fail'
  // pra contar no store-failure detector).
  let isPriceBug = false;
  if (lastPrice && lastPrice > 0 && currentPrice < lastPrice * (1 - SAFETY_DROP_PCT / 100)) {
    console.warn(`[Monitor] Queda suspeita (${name}: R$ ${currentPrice} vs R$ ${lastPrice}) — reconfirmando em ${RECHECK_DELAY_MS / 1000}s...`);
    await sleep(RECHECK_DELAY_MS);
    const recheck = await getPrice(url);

    if (!recheck) {
      console.warn(`[Monitor] Reconfirmação retornou null — descartado: ${name}`);
      await saveUnavailable(id);
      recordProduct(false);
      return 'fail';
    }

    const diffPct = Math.abs(recheck.price - currentPrice) / currentPrice * 100;
    if (diffPct > RECHECK_TOLERANCE_PCT) {
      console.warn(`[Monitor] Leituras inconsistentes (R$ ${currentPrice} vs R$ ${recheck.price}, diff ${diffPct.toFixed(1)}%) — descartado: ${name}`);
      await saveUnavailable(id);
      recordProduct(false);
      return 'fail';
    }

    console.log(`[Monitor] 🐛 BUG DE PREÇO confirmado — ${name}: R$ ${recheck.price} (era R$ ${lastPrice})`);
    currentPrice = recheck.price;
    imageUrl     = recheck.imageUrl || imageUrl;
    isPriceBug = true;
  }

  // === Produto confirmadamente disponível daqui pra baixo ===
  recordProduct(true);

  // === Decide alerta e envia (se aplicável). NÃO salva preço ainda. ===
  // Cada send fica em try-catch isolado: alert falhar não impede savePrice
  // (preserva histórico). Próximo scan re-tenta o alerta se a queda persistir.
  if (isPriceBug) {
    const alreadySent = await wasAlertRecentlySent(id, currentPrice);
    if (!alreadySent) {
      const dropPct = ((lastPrice - currentPrice) / lastPrice) * 100;
      console.log(`[Monitor] 🐛 Enviando alerta de BUG — ${name}: ${currentPrice}`);
      try {
        await sendPriceAlert({
          name, url, store, category,
          currentPrice, lastPrice, lowestPrice,
          discountPct: dropPct,
          imageUrl, priceHistory,
          alertType: 'price_bug',
        });
        await registerAlert(id, currentPrice, dropPct);
        recordAlert('price_bug');
      } catch (err) {
        console.error(`[Monitor] Alerta de BUG falhou — ${name}:`, err.message);
      }
    }
  } else if (wasUnavailable && lowestPrice !== null) {
    await clearUnavailableAlertSent(id);
    const alreadySent = await wasAlertRecentlySent(id, currentPrice);
    if (!alreadySent) {
      console.log(`[Monitor] Produto voltou ao estoque — ${name}: ${currentPrice}`);
      try {
        await sendPriceAlert({ name, url, store, category, currentPrice, lowestPrice, imageUrl, priceHistory, alertType: 'back_in_stock' });
        await registerAlert(id, currentPrice, 0);
        recordAlert('back_in_stock');
      } catch (err) {
        console.error(`[Monitor] Alerta back_in_stock falhou — ${name}:`, err.message);
      }
    }
  } else if (lowestPrice === null) {
    console.log(`[Monitor] Primeiro registro disponível — ${name}: ${currentPrice}`);
    if (wasUnavailable) await clearUnavailableAlertSent(id);
  } else {
    const discountFromMin = lowestPrice > 0
      ? ((lowestPrice - currentPrice) / lowestPrice) * 100
      : 0;
    const dropFromLast = lastPrice && lastPrice > 0
      ? ((lastPrice - currentPrice) / lastPrice) * 100
      : 0;

    const priceChanges = countPriceChanges(priceHistory);
    const enoughHistory = priceChanges >= MIN_CHANGES_FOR_HISTORIC;

    const alertMinBeat = enoughHistory && currentPrice < lowestPrice && discountFromMin >= MIN_BEAT_THRESHOLD;
    const alertMinHit  = !alertMinBeat && enoughHistory && currentPrice <= lowestPrice && lastPrice !== null && lastPrice > lowestPrice;
    const alertDrop    = !alertMinBeat && !alertMinHit && lastPrice !== null && currentPrice < lastPrice && dropFromLast >= DROP_THRESHOLD;

    if (alertMinBeat || alertMinHit || alertDrop) {
      const alreadySent = await wasAlertRecentlySent(id, currentPrice);
      if (alreadySent) {
        console.log(`[Monitor] Alerta já enviado recentemente — ${name}`);
      } else {
        try {
          if (alertMinBeat) {
            await sendPriceAlert({ name, url, store, category, currentPrice, lowestPrice, discountPct: discountFromMin, imageUrl, priceHistory, alertType: 'min_beat' });
            await registerAlert(id, currentPrice, discountFromMin);
            recordAlert('min_beat');
          } else if (alertMinHit) {
            await sendPriceAlert({ name, url, store, category, currentPrice, lowestPrice, discountPct: 0, imageUrl, priceHistory, alertType: 'min_hit' });
            await registerAlert(id, currentPrice, 0);
            recordAlert('min_hit');
          } else {
            await sendPriceAlert({ name, url, store, category, currentPrice, lastPrice, discountPct: dropFromLast, imageUrl, priceHistory, alertType: 'drop' });
            await registerAlert(id, currentPrice, dropFromLast);
            recordAlert('drop');
          }
        } catch (err) {
          console.error(`[Monitor] Alerta drop/min falhou — ${name}:`, err.message);
        }
      }
    }
  }

  // Salvar preço POR ÚLTIMO — depois de qualquer tentativa de alerta.
  // Se o alert falhou, ele será re-tentado no próximo scan (porque o registerAlert
  // não rodou, então wasAlertRecentlySent retorna false).
  await savePrice(id, currentPrice);
  return 'ok';
}

const STORE_FAIL_THRESHOLD_PCT = parseFloat(process.env.STORE_FAIL_THRESHOLD_PCT || '80');
const STORE_FAIL_MIN_PRODUCTS  = parseInt(process.env.STORE_FAIL_MIN_PRODUCTS  || '3', 10);

async function runScan() {
  console.log(`\n[Monitor] Iniciando varredura — ${new Date().toLocaleString('pt-BR')}`);

  let products;
  try {
    products = await getActiveProducts();
  } catch (err) {
    console.error('[Monitor] Erro ao buscar produtos:', err.message);
    await notifyError('db_get_active_products', `Falha ao buscar produtos do Supabase: ${err.message}`, err.stack);
    return;
  }

  if (!products.length) {
    console.warn('[Monitor] Nenhum produto ativo encontrado.');
    return;
  }

  console.log(`[Monitor] ${products.length} produto(s) para monitorar.`);

  // Tracking por loja pra detectar massa de falhas
  const storeStats = {};

  // Processa em série com delay para não levar ban por rate limiting.
  // Try-catch isolado: erro em um produto não derruba a varredura inteira.
  for (const product of products) {
    try {
      const outcome = await processProduct(product);
      if (outcome === 'ok' || outcome === 'fail') {
        if (!storeStats[product.store]) storeStats[product.store] = { ok: 0, fail: 0 };
        storeStats[product.store][outcome]++;
      }
    } catch (err) {
      console.error(`[Monitor] Erro processando ${product.name}:`, err.message);
      await notifyError(
        'process_product',
        `Falha ao processar *${product.name}* (${product.store})\n${err.message}`,
        err.stack
      );
    }
    await sleep(REQUEST_DELAY_MS);
  }

  // Alerta se uma loja inteira morreu nesse scan
  for (const [store, { ok, fail }] of Object.entries(storeStats)) {
    const total = ok + fail;
    if (total < STORE_FAIL_MIN_PRODUCTS) continue;
    const failPct = (fail / total) * 100;
    if (failPct >= STORE_FAIL_THRESHOLD_PCT) {
      await notifyError(
        `store_mass_failure_${store}`,
        `Loja *${store}* falhou em *${fail}/${total}* produtos (${failPct.toFixed(0)}%) nesse scan. Pode ser bloqueio novo, mudança de site, ou rede.`,
      );
    }
  }

  recordScan();
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

  // Agenda resumo diário ao admin (DM com stats das últimas 24h)
  scheduleDailySummary();

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
