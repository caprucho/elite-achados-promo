require('dotenv').config();
const { getActiveProducts, savePrice, getLowestPrice, getLastPrice, wasAlertRecentlySent, registerAlert, getPriceHistory, saveUnavailable, getConsecutiveUnavailableCount } = require('./db/queries');
const { getPrice }       = require('./scrapers');
const { sendPriceAlert } = require('./bot/telegram');
const { closeBrowser }   = require('./scrapers/browser');

process.on('SIGINT',  () => closeBrowser().then(() => process.exit(0)));
process.on('SIGTERM', () => closeBrowser().then(() => process.exit(0)));

const DROP_THRESHOLD        = parseFloat(process.env.DROP_THRESHOLD_PCT    || '20'); // queda vs último preço
const MIN_BEAT_THRESHOLD    = parseFloat(process.env.MIN_BEAT_THRESHOLD_PCT || '5');  // % abaixo do mínimo histórico
const UNAVAILABLE_THRESHOLD = parseInt(process.env.UNAVAILABLE_THRESHOLD   || '3', 10); // scans consecutivos sem resposta
const SAFETY_DROP_PCT       = parseFloat(process.env.SAFETY_DROP_PCT       || '80'); // queda > X% = preço suspeito (descarta)
const INTERVAL_MS           = parseInt(process.env.SCAN_INTERVAL_MINUTES   || '30', 10) * 60 * 1000;
const REQUEST_DELAY_MS      = parseInt(process.env.REQUEST_DELAY_MS        || '3000', 10);

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function processProduct(product) {
  const { id, name, url, store, category } = product;

  const result = await getPrice(url);

  if (!result) {
    // Registra indisponibilidade e loga a contagem consecutiva
    const prevCount = await getConsecutiveUnavailableCount(id);
    await saveUnavailable(id);
    if (prevCount === 0) {
      console.log(`[Monitor] Produto ficou indisponível — ${name}`);
    } else {
      console.log(`[Monitor] Produto continua indisponível (${prevCount + 1}x) — ${name}`);
    }
    return;
  }

  const { price: currentPrice, imageUrl } = result;

  // Verifica indisponibilidade consecutiva ANTES de salvar o preço atual
  const unavailableCount = await getConsecutiveUnavailableCount(id);
  const wasUnavailable = unavailableCount >= UNAVAILABLE_THRESHOLD;

  // Busca histórico ANTES de salvar o preço atual
  const [lastPrice, lowestPrice, priceHistory] = await Promise.all([
    getLastPrice(id),
    getLowestPrice(id),
    getPriceHistory(id),
  ]);

  // Sanity check: queda > SAFETY_DROP_PCT vs último preço = scraping suspeito
  // (ex: parser concatenou parcela com preço, ou página de indisponível)
  if (lastPrice && lastPrice > 0 && currentPrice < lastPrice * (1 - SAFETY_DROP_PCT / 100)) {
    console.warn(`[Monitor] Preço suspeito descartado — ${name}: ${currentPrice} (último: ${lastPrice})`);
    await saveUnavailable(id);
    return;
  }

  await savePrice(id, currentPrice);

  // Alerta de volta ao estoque (prioridade máxima)
  if (wasUnavailable) {
    const alreadySent = await wasAlertRecentlySent(id, currentPrice);
    if (!alreadySent) {
      console.log(`[Monitor] Produto voltou ao estoque — ${name}: ${currentPrice}`);
      await sendPriceAlert({ name, url, store, category, currentPrice, lowestPrice, imageUrl, priceHistory, alertType: 'back_in_stock' });
      await registerAlert(id, currentPrice, 0);
    }
    return;
  }

  // Produto novo: sem histórico, apenas registra
  if (lowestPrice === null) {
    console.log(`[Monitor] Primeiro registro — ${name}: ${currentPrice}`);
    return;
  }

  const discountFromMin = lowestPrice > 0
    ? ((lowestPrice - currentPrice) / lowestPrice) * 100
    : 0;
  const dropFromLast = lastPrice && lastPrice > 0
    ? ((lastPrice - currentPrice) / lastPrice) * 100
    : 0;

  // Condição A: 5%+ abaixo do mínimo histórico (melhor preço visto)
  const alertMinBeat = currentPrice < lowestPrice && discountFromMin >= MIN_BEAT_THRESHOLD;

  // Condição B: atingiu o mínimo histórico vindo de um preço mais alto
  // lastPrice > lowestPrice garante que o preço caiu até o mínimo agora, não que já estava lá
  const alertMinHit = !alertMinBeat
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
