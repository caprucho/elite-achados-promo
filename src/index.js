require('dotenv').config();
const { getActiveProducts, savePrice, getLowestPriceRecent, getLastPrice, wasAlertRecentlySent, registerAlert, getPriceHistory, saveUnavailable, getConsecutiveUnavailableCount, getLastScanAt, getUnavailableStreakStart, wasUnavailableAlertSent, markUnavailableAlertSent, clearUnavailableAlertSent, isInAdaptiveCooldown, getPriceContext, getOfferIntelligence } = require('./db/queries');
const { getPrice }       = require('./scrapers');
const { sendPriceAlert, sendAdminMessage } = require('./bot/telegram');
const { notifyError, recordAlert, recordScan, recordProduct, scheduleDailySummary } = require('./utils/adminAlerts');
const { enqueueBackInStock, scheduleBackInStockDigest } = require('./backInStockDigest');

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

process.on('SIGINT',  () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

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

// back_in_stock só posta se preço atual estiver dentro desse limite acima
// do mínimo histórico. Se voltou caro (ex: Kindle por R$ 1399 quando mín é
// R$ 1049 = +33%), não é oferta — fica silencioso.
const BACK_IN_STOCK_MAX_ABOVE_MIN_PCT = parseFloat(process.env.BACK_IN_STOCK_MAX_ABOVE_MIN_PCT || '15');
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
  const { id, name, url, store, category, is_masc: isMasc = false, is_fem: isFem = false } = product;

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
    getLowestPriceRecent(id),
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
      const intel = await getOfferIntelligence(id, currentPrice);
      console.log(`[Monitor] 🐛 Enviando alerta de BUG — ${name}: ${currentPrice}`);
      try {
        await sendPriceAlert({
          productId: id, name, url, store, category, isMasc, isFem,
          currentPrice, lastPrice, lowestPrice,
          normalPrice: intel.median30, allTimeLow: intel.allTimeLow,
          score: intel.score, scoreLabel: intel.scoreLabel,
          rarityCount: intel.rarityCount, rarityLabel: intel.rarityLabel,
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
    const inCooldown  = await isInAdaptiveCooldown(id);
    // Só posta se o preço ao voltar estiver dentro de N% do mínimo histórico.
    // Voltar ao estoque por R$ 1399 quando mín é R$ 1049 não é oferta — é ruim.
    const aboveMinPct = ((currentPrice - lowestPrice) / lowestPrice) * 100;
    const tooExpensive = aboveMinPct > BACK_IN_STOCK_MAX_ABOVE_MIN_PCT;
    if (alreadySent) {
      console.log(`[Monitor] back_in_stock dedup — ${name}`);
    } else if (inCooldown) {
      console.log(`[Monitor] 🔇 back_in_stock em cooldown — ${name}`);
    } else if (tooExpensive) {
      console.log(`[Monitor] 🔇 back_in_stock muito caro (${aboveMinPct.toFixed(0)}% acima do mín) — ${name}`);
    } else {
      console.log(`[Monitor] Produto voltou ao estoque — ${name}: ${currentPrice} (enfileirado p/ digest)`);
      enqueueBackInStock({ id, name, url, store, category, price: currentPrice, lowestPrice });
      await registerAlert(id, currentPrice, 0);
      recordAlert('back_in_stock');
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

    // min_beat: novo mínimo histórico. Exige cair >PRICE_CHANGE_MIN_PCT abaixo
    // do mínimo (centavos não contam) + histórico de alterações suficiente.
    const alertMinBeat = enoughHistory
      && currentPrice < lowestPrice * (1 - PRICE_CHANGE_MIN_PCT / 100)
      && discountFromMin >= MIN_BEAT_THRESHOLD;

    // drop: queda >DROP_THRESHOLD vs o último preço registrado.
    const alertDrop = !alertMinBeat
      && lastPrice !== null && currentPrice < lastPrice && dropFromLast >= DROP_THRESHOLD;

    // min_hit: voltou ao mínimo histórico (não é novo recorde, mas é momento
    // bom de comprar). Exige que o último preço tenha estado >2% acima do mín
    // (pra evitar disparar enquanto o preço fica parado no mínimo).
    const hitMin = !alertMinBeat && !alertDrop
      && enoughHistory
      && lowestPrice > 0
      && currentPrice >= lowestPrice * 0.995 && currentPrice <= lowestPrice * 1.005
      && lastPrice !== null && lastPrice > lowestPrice * 1.02;

    const alertType = alertMinBeat ? 'min_beat' : alertDrop ? 'drop' : hitMin ? 'min_hit' : null;

    if (alertType) {
      const alreadySent = await wasAlertRecentlySent(id, currentPrice);
      const inCooldown  = await isInAdaptiveCooldown(id);
      if (alreadySent) {
        console.log(`[Monitor] Alerta já enviado recentemente — ${name}`);
      } else if (inCooldown) {
        console.log(`[Monitor] 🔇 Cooldown adaptativo (3+ alertas/7d) — ${name}`);
      } else {
        const discountPct = alertType === 'min_beat' ? discountFromMin
                          : alertType === 'drop'     ? dropFromLast
                          : 0;
        const intel = await getOfferIntelligence(id, currentPrice);
        try {
          await sendPriceAlert({
            productId: id, name, url, store, category, isMasc, isFem,
            currentPrice, lastPrice, lowestPrice,
            normalPrice: intel.median30, allTimeLow: intel.allTimeLow,
            score: intel.score, scoreLabel: intel.scoreLabel,
            rarityCount: intel.rarityCount, rarityLabel: intel.rarityLabel,
            discountPct, imageUrl, priceHistory, alertType,
          });
          await registerAlert(id, currentPrice, discountPct);
          recordAlert(alertType);
        } catch (err) {
          console.error(`[Monitor] Alerta ${alertType} falhou — ${name}:`, err.message);
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
    process.exit(0);
  }

  // Modo contínuo (local com pm2)
  console.log('Elite Achados & Promo iniciado.');
  console.log(`   Queda mínima  : ${DROP_THRESHOLD}% (último preço) | ${MIN_BEAT_THRESHOLD}% (mínimo histórico)`);
  console.log(`   Intervalo     : ${INTERVAL_MS / 60000} min\n`);

  // Agenda resumo diário ao admin (DM com stats das últimas 24h)
  scheduleDailySummary();

  // Agenda digest de "voltou ao estoque" (1x/dia às 15h BRT, consolidado)
  if (process.env.ENABLE_BACK_IN_STOCK_DIGEST !== 'false') {
    try { scheduleBackInStockDigest(); }
    catch (err) { console.warn('[Monitor] Digest back_in_stock não iniciado:', err.message); }
  }

  // Agenda a vitrine rotativa (achadinhos Amazon — gera tráfego de afiliado)
  if (process.env.ENABLE_SHOWCASE !== 'false') {
    try {
      require('./showcase').scheduleShowcase();
    } catch (err) {
      console.warn('[Monitor] Vitrine não iniciada:', err.message);
    }
  }

  // Agenda a rotina de cupons da KaBuM (1x/dia)
  if (process.env.ENABLE_KABUM_CUPONS !== 'false') {
    try {
      require('./kabumCupons').scheduleKabumCupons();
    } catch (err) {
      console.warn('[Monitor] Cupons KaBuM não iniciados:', err.message);
    }
  }

  // Agenda o TOP semanal (domingo 10h BRT)
  if (process.env.ENABLE_WEEKLY_TOP !== 'false') {
    try {
      require('./weeklyTop').scheduleWeeklyTop();
    } catch (err) {
      console.warn('[Monitor] TOP semanal não iniciado:', err.message);
    }
  }

  // Agenda recomendações personalizadas (domingo 18h BRT — DM por user)
  if (process.env.ENABLE_PERSONAL_REC !== 'false') {
    try {
      require('./personalRecommendations').schedulePersonalRecommendations();
    } catch (err) {
      console.warn('[Monitor] Recomendações personalizadas não iniciadas:', err.message);
    }
  }

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
