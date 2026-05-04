require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID } = process.env;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID) {
  throw new Error('TELEGRAM_BOT_TOKEN e TELEGRAM_CHANNEL_ID são obrigatórios no .env');
}

// polling: false — só enviamos mensagens, não precisamos receber
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

function formatPrice(price) {
  return price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// MarkdownV2 exige escape de caracteres especiais fora de links/bold
function escapeMarkdown(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

async function sendPriceAlert({ name, url, store, currentPrice, lowestPrice, discountPct, imageUrl }) {
  const caption = [
    `🔥 *OFERTA DETECTADA — ${escapeMarkdown(store.toUpperCase())}*`,
    ``,
    `📦 *${escapeMarkdown(name)}*`,
    ``,
    `💰 Preço atual: *${escapeMarkdown(formatPrice(currentPrice))}*`,
    `📉 Mínimo histórico: ~${escapeMarkdown(formatPrice(lowestPrice))}~`,
    `🏷️ Desconto: *${escapeMarkdown(discountPct.toFixed(1))}% abaixo do menor preço*`,
    ``,
    `🛒 [Ver oferta](${url})`,
  ].join('\n');

  try {
    if (imageUrl) {
      await bot.sendPhoto(TELEGRAM_CHANNEL_ID, imageUrl, {
        caption,
        parse_mode: 'MarkdownV2',
      });
    } else {
      await bot.sendMessage(TELEGRAM_CHANNEL_ID, caption, {
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: false,
      });
    }
    console.log(`[Telegram] Alerta enviado: ${name} — ${formatPrice(currentPrice)}`);
  } catch (err) {
    console.error('[Telegram] Erro ao enviar alerta:', err.message);
    // fallback sem foto
    if (imageUrl) {
      await bot.sendMessage(TELEGRAM_CHANNEL_ID, caption, {
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: false,
      }).catch(() => {});
    }
  }
}

module.exports = { sendPriceAlert };
