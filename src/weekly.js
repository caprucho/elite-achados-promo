require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { getWeeklyTopDrops } = require('./db/queries');

const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID } = process.env;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID) {
  throw new Error('TELEGRAM_BOT_TOKEN e TELEGRAM_CHANNEL_ID são obrigatórios no .env');
}

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

function formatPrice(price) {
  return price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escapeMarkdown(text) {
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

function fmtDate(d) {
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

async function main() {
  const drops = await getWeeklyTopDrops(5);

  if (!drops.length) {
    console.log('[Weekly] Nenhuma queda detectada na semana. Nada enviado.');
    process.exit(0);
  }

  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
  const now = new Date();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const lines = [
    `🗓️ *MELHORES QUEDAS DA SEMANA*`,
    `_De ${escapeMarkdown(fmtDate(weekAgo))} a ${escapeMarkdown(fmtDate(now))}_`,
    ``,
  ];

  drops.forEach(({ product, weekStartPrice, currentPrice, dropPct }, i) => {
    lines.push(
      `${medals[i]} *${escapeMarkdown(product.name)}*`,
      `De ${escapeMarkdown(formatPrice(weekStartPrice))} → *${escapeMarkdown(formatPrice(currentPrice))}* \\(\\-${escapeMarkdown(dropPct.toFixed(1))}%\\)`,
      `🛒 [Ver oferta](${product.url})`,
      ``,
    );
  });

  const text = lines.join('\n');

  try {
    await bot.sendMessage(TELEGRAM_CHANNEL_ID, text, {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    });
    console.log(`[Weekly] Resumo enviado com ${drops.length} queda(s).`);
  } catch (err) {
    console.error('[Weekly] Erro ao enviar resumo:', err.message);
    process.exit(1);
  }

  process.exit(0);
}

main();
