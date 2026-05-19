// TOP 5 da semana — post fixo dominical (10h BRT) com as 5 maiores quedas
// dos últimos 7 dias. Curadoria semanal pra quem perdeu os alertas do dia.
const { getWeeklyTopDrops } = require('./db/queries');
const { sendWeeklyTop } = require('./bot/telegram');

const WEEKLY_TOP_HOUR_BRT = parseInt(process.env.WEEKLY_TOP_HOUR_BRT || '10', 10);
const WEEKLY_TOP_LIMIT    = parseInt(process.env.WEEKLY_TOP_LIMIT    || '5', 10);
const WEEKLY_TOP_MIN_PCT  = parseFloat(process.env.WEEKLY_TOP_MIN_PCT || '10'); // só se cair pelo menos 10%

async function runWeeklyTop() {
  let drops;
  try {
    drops = await getWeeklyTopDrops(WEEKLY_TOP_LIMIT * 2);
  } catch (err) {
    console.error('[WeeklyTop] Erro ao buscar drops:', err.message);
    return;
  }
  // Filtra os que caíram menos que o mínimo
  drops = drops.filter((d) => d.dropPct >= WEEKLY_TOP_MIN_PCT).slice(0, WEEKLY_TOP_LIMIT);
  if (!drops.length) {
    console.log('[WeeklyTop] Nenhuma queda relevante na semana, pulando post');
    return;
  }
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
