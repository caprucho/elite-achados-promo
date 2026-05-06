// Notificações operacionais ao admin (DM no Telegram) + stats diárias.
// State é em memória — reseta quando o processo reinicia (deploy do Railway).

const { sendAdminMessage } = require('../bot/telegram');

const ERROR_THROTTLE_MS = parseInt(process.env.ERROR_NOTIFY_THROTTLE_MS || String(60 * 60 * 1000), 10); // 1h
const SUMMARY_HOUR_UTC  = parseInt(process.env.SUMMARY_HOUR_UTC || '12', 10); // 12 UTC = 9h BRT (Brasil sem DST)

const stats = {
  scansRun:           0,
  productsScanned:    0,
  productsAvailable:  0,
  productsUnavailable:0,
  alertsSent:         0,
  alertsByType:       {},
  errorsCount:        0,
  errorsByCategory:   {},
  startedAt:          Date.now(),
};

const errorLastSent = new Map(); // category -> timestamp

function escapeMd(s) {
  return String(s).replace(/[_*\[\]()~`>#+\-=|{}.!]/g, (c) => '\\' + c);
}

async function notifyError(category, message, details) {
  stats.errorsCount++;
  stats.errorsByCategory[category] = (stats.errorsByCategory[category] || 0) + 1;

  const now = Date.now();
  const last = errorLastSent.get(category) || 0;
  if (now - last < ERROR_THROTTLE_MS) {
    console.warn(`[adminAlerts] ${category}: ${message} (DM throttled)`);
    return;
  }
  errorLastSent.set(category, now);

  const lines = [
    `🚨 *Erro: ${category}*`,
    ``,
    String(message).slice(0, 1000),
  ];
  if (details) {
    lines.push('', '```', String(details).slice(0, 800), '```');
  }

  try {
    await sendAdminMessage(lines.join('\n'));
  } catch (err) {
    console.error('[adminAlerts] falha ao enviar DM:', err.message);
  }
}

function recordAlert(type) {
  stats.alertsSent++;
  stats.alertsByType[type] = (stats.alertsByType[type] || 0) + 1;
}

function recordScan() {
  stats.scansRun++;
}

function recordProduct(wasAvailable) {
  stats.productsScanned++;
  if (wasAvailable) stats.productsAvailable++;
  else stats.productsUnavailable++;
}

async function sendDailySummary() {
  const hours = ((Date.now() - stats.startedAt) / 3600000).toFixed(1);

  const lines = [
    '📊 *Resumo das últimas 24h*',
    '',
    `⏱️ Período: ~${hours}h desde último resumo / boot`,
    `🔄 Scans completos: *${stats.scansRun}*`,
    `📦 Checagens de produto: *${stats.productsScanned}*`,
    `   ✅ Disponíveis: ${stats.productsAvailable}`,
    `   ❌ Indisponíveis: ${stats.productsUnavailable}`,
    '',
    `🔔 Alertas enviados: *${stats.alertsSent}*`,
  ];

  if (stats.alertsSent > 0) {
    for (const [t, n] of Object.entries(stats.alertsByType)) {
      lines.push(`   • ${t}: ${n}`);
    }
  } else {
    lines.push('   _(nenhum)_');
  }

  lines.push('', `🚨 Erros capturados: *${stats.errorsCount}*`);
  if (stats.errorsCount > 0) {
    for (const [c, n] of Object.entries(stats.errorsByCategory)) {
      lines.push(`   • ${c}: ${n}`);
    }
  } else {
    lines.push('   _(nenhum — tudo limpo)_');
  }

  try {
    await sendAdminMessage(lines.join('\n'));
  } catch (err) {
    console.error('[adminAlerts] falha ao enviar resumo:', err.message);
  }

  // Reset
  stats.scansRun = 0;
  stats.productsScanned = 0;
  stats.productsAvailable = 0;
  stats.productsUnavailable = 0;
  stats.alertsSent = 0;
  stats.errorsCount = 0;
  stats.alertsByType = {};
  stats.errorsByCategory = {};
  stats.startedAt = Date.now();
  errorLastSent.clear();
}

function scheduleDailySummary() {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(SUMMARY_HOUR_UTC, 0, 0, 0);
  if (target <= now) target.setUTCDate(target.getUTCDate() + 1);
  const delay = target.getTime() - now.getTime();

  console.log(`[adminAlerts] próximo resumo agendado para ${target.toISOString()} (em ${(delay / 3600000).toFixed(1)}h)`);

  setTimeout(async () => {
    try { await sendDailySummary(); } catch (err) { console.error('[adminAlerts] erro no resumo:', err.message); }
    scheduleDailySummary();
  }, delay);
}

module.exports = {
  notifyError,
  recordAlert,
  recordScan,
  recordProduct,
  sendDailySummary,
  scheduleDailySummary,
};
