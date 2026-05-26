// TOP da semana — post fixo dominical (16h BRT) com as maiores quedas dos
// últimos 7 dias. Antes de postar, re-verifica cada item via scraping pra
// marcar os que esgotaram (continuam na lista, mas com tag ESGOTADO — pros
// membros saberem que perderam uma oferta boa).
const { getWeeklyTopDrops } = require('./db/queries');
const { getPrice } = require('./scrapers');
const { sendWeeklyTop } = require('./bot/telegram');

const WEEKLY_TOP_HOUR_BRT       = parseInt(process.env.WEEKLY_TOP_HOUR_BRT || '16', 10);
const WEEKLY_TOP_LIMIT          = parseInt(process.env.WEEKLY_TOP_LIMIT    || '5', 10);
const WEEKLY_TOP_MIN_PCT        = parseFloat(process.env.WEEKLY_TOP_MIN_PCT || '10'); // só se cair >= X%
const WEEKLY_TOP_RECHECK_DELAY  = parseInt(process.env.WEEKLY_TOP_RECHECK_DELAY_MS || '1500', 10);

async function runWeeklyTop() {
  let drops;
  try {
    drops = await getWeeklyTopDrops(WEEKLY_TOP_LIMIT * 2);
  } catch (err) {
    console.error('[WeeklyTop] Erro ao buscar drops:', err.message);
    return;
  }
  // Pré-filtro pelo desconto histórico — pega candidatos com folga (2x o limit)
  // pra ter margem se algum re-check filtrar
  drops = drops.filter((d) => d.dropPct >= WEEKLY_TOP_MIN_PCT);
  if (!drops.length) {
    console.log('[WeeklyTop] Nenhuma queda relevante na semana, pulando post');
    return;
  }

  // Re-verifica disponibilidade (scraping ao vivo) antes de postar.
  // Atualiza currentPrice + RECALCULA dropPct com preço fresh.
  // Itens cujo preço voltou a subir ficam fora — não tem desconto AGORA.
  console.log(`[WeeklyTop] Re-verificando ${drops.length} produto(s)...`);
  for (const d of drops) {
    try {
      const r = await getPrice(d.product.url);
      if (r && typeof r.price === 'number' && r.price > 0) {
        d.available = true;
        d.currentPrice = r.price;
        // ⚠️ CRÍTICO: recalcula desconto com preço fresh, pode virar negativo
        // (preço subiu desde o pico do desconto da semana)
        d.dropPct = ((d.weekStartPrice - r.price) / d.weekStartPrice) * 100;
      } else {
        d.available = false;
        // Esgotados mantêm dropPct histórico — vai aparecer com tag ESGOTADO
      }
    } catch (err) {
      console.warn(`[WeeklyTop] Falha ao re-verificar ${d.product.name}:`, err.message);
      d.available = false;
    }
    await new Promise((r) => setTimeout(r, WEEKLY_TOP_RECHECK_DELAY));
  }

  // Filtro PÓS re-check:
  // - DISPONÍVEIS: precisam AINDA ter desconto >= MIN_PCT (preço pode ter subido)
  // - ESGOTADOS: sempre entram (querem mostrar oferta perdida)
  drops = drops.filter((d) => !d.available || d.dropPct >= WEEKLY_TOP_MIN_PCT);

  // Reordena pela queda real (pode ter mudado após re-check)
  drops.sort((a, b) => b.dropPct - a.dropPct);
  drops = drops.slice(0, WEEKLY_TOP_LIMIT);

  if (!drops.length) {
    console.log('[WeeklyTop] Após re-check, nenhum item ainda com desconto. Pulando post.');
    return;
  }

  const sold = drops.filter((d) => !d.available).length;
  console.log(`[WeeklyTop] ${drops.length - sold} disponível(eis), ${sold} esgotado(s) — postando`);

  try {
    await sendWeeklyTop(drops);
    console.log(`[WeeklyTop] TOP ${drops.length} postado`);
  } catch (err) {
    console.error('[WeeklyTop] Erro ao postar:', err.message);
  }
}

// Agenda pro próximo domingo 10h BRT (re-agenda a si mesmo a cada 7 dias).
function scheduleWeeklyTop() {
  const now = Date.now();
  const hUtc = (WEEKLY_TOP_HOUR_BRT + 3) % 24; // 10 BRT → 13 UTC
  const d = new Date();
  d.setUTCHours(hUtc, 0, 0, 0);
  // Avança até o próximo domingo no futuro (UTC)
  while (d.getUTCDay() !== 0 || d.getTime() <= now) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const delay = d.getTime() - now;
  console.log(`[WeeklyTop] Próximo TOP semanal em ${(delay / 3600000).toFixed(1)}h (${d.toISOString()})`);
  setTimeout(async () => {
    try { await runWeeklyTop(); } catch (err) { console.error('[WeeklyTop]', err.message); }
    scheduleWeeklyTop();
  }, delay);
}

module.exports = { runWeeklyTop, scheduleWeeklyTop };
