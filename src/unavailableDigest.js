// Digest diário de produtos indisponíveis (1 mensagem ao admin, em vez de uma
// notificação por produto). Lista os produtos que estão sem preço há >= N dias,
// agrupados por loja, ordenados do mais antigo pro mais novo.
//
// Substitui o antigo maybeNotifyLongUnavailable (que mandava 1 DM por produto).
const { getUnavailableProducts } = require('./db/queries');
const { sendAdminMessage } = require('./bot/telegram');

const DIGEST_HOUR_UTC   = parseInt(process.env.UNAVAILABLE_DIGEST_HOUR_UTC || '12', 10); // 12 UTC = 9h BRT
const NOTIFY_MIN_DAYS   = parseFloat(process.env.UNAVAILABLE_NOTIFY_DAYS || '7'); // só lista quem está fora há >= N dias
const MAX_LIST          = parseInt(process.env.UNAVAILABLE_DIGEST_MAX || '40', 10); // teto pra não estourar a msg

// Escapa Markdown legacy (_ * [ `) — nome/URL do ML quebram o parse.
const mdEsc = (s) => String(s).replace(/[_*[\]`]/g, '\\$&');

async function sendUnavailableDigest() {
  let produtos;
  try {
    produtos = await getUnavailableProducts();
  } catch (err) {
    console.error('[UnavailDigest] erro ao buscar indisponíveis:', err.message);
    return;
  }

  const now = Date.now();
  const relevantes = produtos
    .map((p) => ({ ...p, days: p.streakStart ? (now - new Date(p.streakStart).getTime()) / 86400000 : 0 }))
    .filter((p) => p.days >= NOTIFY_MIN_DAYS);

  if (!relevantes.length) {
    console.log('[UnavailDigest] nenhum produto indisponível há mais de', NOTIFY_MIN_DAYS, 'dias — sem digest');
    return;
  }

  // Agrupa por loja
  const porLoja = {};
  for (const p of relevantes) (porLoja[p.store] = porLoja[p.store] || []).push(p);

  // Markdown legacy (padrão do sendAdminMessage). mdEsc escapa _ * [ ` nos
  // campos dinâmicos; o resto é texto literal sem caracteres especiais.
  const lines = [
    `📋 *Produtos indisponíveis (${relevantes.length})*`,
    `Sem preço há mais de ${Math.floor(NOTIFY_MIN_DAYS)} dias (link quebrado / fora de linha?)`,
    '',
  ];
  let mostrados = 0;
  for (const [loja, itens] of Object.entries(porLoja).sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`🏪 *${mdEsc(loja.toUpperCase())}* (${itens.length})`);
    for (const p of itens) {
      if (mostrados >= MAX_LIST) { lines.push(`...e mais ${relevantes.length - mostrados}`); break; }
      lines.push(`• ${mdEsc(p.name.slice(0, 48))} — ${Math.floor(p.days)}d \`/removerproduto ${p.id}\``);
      mostrados++;
    }
    lines.push('');
    if (mostrados >= MAX_LIST) break;
  }
  lines.push('Use /indisponiveis pra ver a lista completa quando quiser.');

  try {
    await sendAdminMessage(lines.join('\n')); // usa Markdown legacy (default)
    console.log(`[UnavailDigest] enviado: ${relevantes.length} produto(s) indisponível(is)`);
  } catch (err) {
    console.error('[UnavailDigest] falha ao enviar:', err.message);
  }
}

function scheduleUnavailableDigest() {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(DIGEST_HOUR_UTC, 30, 0, 0); // 30min após o resumo diário, pra não colidir
  if (target <= now) target.setUTCDate(target.getUTCDate() + 1);
  const delay = target.getTime() - now.getTime();
  console.log(`[UnavailDigest] próximo digest em ${(delay / 3600000).toFixed(1)}h (${target.toISOString()})`);
  setTimeout(async () => {
    try { await sendUnavailableDigest(); } catch (err) { console.error('[UnavailDigest]', err.message); }
    scheduleUnavailableDigest();
  }, delay);
}

module.exports = { sendUnavailableDigest, scheduleUnavailableDigest };
