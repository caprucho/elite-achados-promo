// Digest diário de "voltou ao estoque" — em vez de 1 mensagem por produto,
// acumula durante o dia e posta uma lista consolidada às 15h BRT.
// Fila em memória: se o processo reiniciar antes das 15h, a fila zera (ok,
// não é alerta crítico — produto continua ativo, no próximo scan ele já
// está disponível e não entra mais no fluxo de back_in_stock).
const { sendBackInStockDigest } = require('./bot/telegram');

const DIGEST_HOUR_BRT = parseInt(process.env.BACK_IN_STOCK_DIGEST_HOUR_BRT || '15', 10);

// productId → { name, url, store, category, price, lowestPrice, at }
const queue = new Map();

function enqueueBackInStock(item) {
  queue.set(item.id, { ...item, at: Date.now() });
  console.log(`[Digest] Enfileirado back_in_stock — ${item.name} (fila: ${queue.size})`);
}

async function runBackInStockDigest() {
  if (queue.size === 0) {
    console.log('[Digest] Fila vazia, pulando digest do dia');
    return;
  }
  const items = Array.from(queue.values());
  queue.clear();
  try {
    await sendBackInStockDigest(items);
    console.log(`[Digest] ${items.length} produto(s) postado(s) no digest`);
  } catch (err) {
    console.error('[Digest] Erro ao postar:', err.message);
    // Re-enfileira se falhou (o digest tenta de novo amanhã)
    for (const it of items) queue.set(it.id, it);
  }
}

// Agenda o próximo digest no próximo horário BRT (re-agenda a si mesmo).
function scheduleBackInStockDigest() {
  const hUtc = (DIGEST_HOUR_BRT + 3) % 24;
  const d = new Date();
  d.setUTCHours(hUtc, 0, 0, 0);
  let t = d.getTime();
  if (t <= Date.now()) t += 24 * 3600 * 1000;
  const delay = t - Date.now();
  console.log(`[Digest] Próximo digest em ${(delay / 3600000).toFixed(1)}h (${DIGEST_HOUR_BRT}h BRT)`);
  setTimeout(async () => {
    try { await runBackInStockDigest(); } catch (err) { console.error('[Digest]', err.message); }
    scheduleBackInStockDigest();
  }, delay);
}

module.exports = { enqueueBackInStock, runBackInStockDigest, scheduleBackInStockDigest };
