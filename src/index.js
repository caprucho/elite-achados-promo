require('dotenv').config();
const { getActiveProducts, savePrice, getLowestPrice, wasAlertRecentlySent, registerAlert } = require('./db/queries');
const { getPrice }       = require('./scrapers');
const { sendPriceAlert } = require('./bot/telegram');
const { closeBrowser }   = require('./scrapers/browser');

process.on('SIGINT',  () => closeBrowser().then(() => process.exit(0)));
process.on('SIGTERM', () => closeBrowser().then(() => process.exit(0)));

const DISCOUNT_THRESHOLD = parseFloat(process.env.DISCOUNT_THRESHOLD_PCT || '10');
const INTERVAL_MS        = parseInt(process.env.SCAN_INTERVAL_MINUTES || '30', 10) * 60 * 1000;
const REQUEST_DELAY_MS   = parseInt(process.env.REQUEST_DELAY_MS || '3000', 10);

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function processProduct(product) {
  const { id, name, url, store } = product;

  const result = await getPrice(url);
  if (!result) return;
  const { price: currentPrice, imageUrl } = result;

  await savePrice(id, currentPrice);

  const lowestPrice = await getLowestPrice(id);

  // Produto novo: sem histórico anterior, apenas registra e segue
  if (lowestPrice === null) {
    console.log(`[Monitor] Primeiro registro — ${name}: ${currentPrice}`);
    return;
  }

  if (currentPrice >= lowestPrice) return;

  const discountPct = ((lowestPrice - currentPrice) / lowestPrice) * 100;
  if (discountPct < DISCOUNT_THRESHOLD) return;

  const alreadySent = await wasAlertRecentlySent(id, currentPrice);
  if (alreadySent) {
    console.log(`[Monitor] Alerta já enviado recentemente — ${name}`);
    return;
  }

  await sendPriceAlert({ name, url, store, currentPrice, lowestPrice, discountPct, imageUrl });
  await registerAlert(id, currentPrice, discountPct);
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
    console.log(`   Desconto mínimo : ${DISCOUNT_THRESHOLD}%\n`);
    await runScan();
    await closeBrowser();
    process.exit(0);
  }

  // Modo contínuo (local com pm2)
  console.log('Elite Achados & Promo iniciado.');
  console.log(`   Desconto mínimo : ${DISCOUNT_THRESHOLD}%`);
  console.log(`   Intervalo       : ${INTERVAL_MS / 60000} min\n`);

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
