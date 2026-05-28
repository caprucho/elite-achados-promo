// Recomendações personalizadas — cron semanal (domingo 18h BRT) que manda DM
// pra cada watcher com top drops da semana NAS CATEGORIAS dos produtos que ele
// monitora. Exclui produtos que ele já está monitorando.
//
// "Lucas monitora 5 produtos de casa. Achei 3 outros descontos de casa
//  na semana que podem te interessar."
const { getDistinctWatcherIds, getWatchedProducts, getWeeklyTopDrops } = require('./db/queries');
const { sendPersonalRecommendation } = require('./bot/telegram');

const REC_HOUR_BRT      = parseInt(process.env.PERSONAL_REC_HOUR_BRT || '18', 10); // dom 18h BRT
const REC_MAX_ITEMS     = parseInt(process.env.PERSONAL_REC_MAX_ITEMS || '3', 10);
const REC_MIN_DROP_PCT  = parseFloat(process.env.PERSONAL_REC_MIN_DROP_PCT || '15');

async function runPersonalRecommendations() {
  const userIds = await getDistinctWatcherIds();
  if (!userIds.length) {
    console.log('[PersonalRec] Nenhum watcher — pulando');
    return;
  }
  // Pega top drops da semana 1x (pra todos os users)
  const allDrops = await getWeeklyTopDrops(50); // pega bem mais que o necessário
  const validDrops = allDrops.filter((d) => d.dropPct >= REC_MIN_DROP_PCT);
  if (!validDrops.length) {
    console.log('[PersonalRec] Sem drops relevantes na semana — pulando');
    return;
  }

  let sent = 0;
  for (const userId of userIds) {
    try {
      const watched = await getWatchedProducts(userId);
      if (!watched.length) continue;
      const watchedIds = new Set(watched.map((p) => p.id));
      // Categorias agrupadas (set único, ignora nulls)
      const categories = new Set(watched.map((p) => p.category).filter(Boolean));
      if (!categories.size) continue;

      // Filtra drops: nas categorias do user E que ele AINDA NÃO monitora
      const candidates = validDrops
        .filter((d) => d.product.category && categories.has(d.product.category))
        .filter((d) => !watchedIds.has(d.product.id))
        .slice(0, REC_MAX_ITEMS);

      if (!candidates.length) continue;

      const ok = await sendPersonalRecommendation(userId, candidates, [...categories]);
      if (ok) sent++;
    } catch (err) {
      console.warn(`[PersonalRec] erro pra user ${userId}:`, err.message);
    }
  }
  console.log(`[PersonalRec] ${sent} DM(s) enviada(s) de ${userIds.length} watcher(s)`);
}

// Agenda pro próximo domingo 18h BRT (re-agenda toda semana)
function schedulePersonalRecommendations() {
  const now = Date.now();
  const hUtc = (REC_HOUR_BRT + 3) % 24;
  const d = new Date();
  d.setUTCHours(hUtc, 0, 0, 0);
  // Avança até o próximo domingo no futuro (UTC)
  while (d.getUTCDay() !== 0 || d.getTime() <= now) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const delay = d.getTime() - now;
  console.log(`[PersonalRec] Próxima rodada em ${(delay / 3600000).toFixed(1)}h (${d.toISOString()})`);
  setTimeout(async () => {
    try { await runPersonalRecommendations(); }
    catch (err) { console.error('[PersonalRec]', err.message); }
    schedulePersonalRecommendations();
  }, delay);
}

module.exports = { runPersonalRecommendations, schedulePersonalRecommendations };
