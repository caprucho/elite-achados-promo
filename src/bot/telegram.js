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

async function sendPriceAlert({ name, url, store, currentPrice, lowestPrice, lastPrice, discountPct, imageUrl, alertType = 'minimum' }) {
  const storeLabel = escapeMarkdown(store.toUpperCase());
  const nameLabel  = escapeMarkdown(name);
  const pctLabel   = escapeMarkdown(discountPct.toFixed(1));

  let caption;
  if (alertType === 'min_beat') {
    caption = [
      `🏆 *NOVO MÍNIMO HISTÓRICO — ${storeLabel}*`,
      ``,
      `📦 *${nameLabel}*`,
      ``,
      `💰 Preço atual: *${escapeMarkdown(formatPrice(currentPrice))}*`,
      `📉 Mínimo anterior: ~${escapeMarkdown(formatPrice(lowestPrice))}~`,
      `🏷️ *${pctLabel}%* abaixo do menor preço já registrado`,
      ``,
      `🛒 [Ver oferta](${url})`,
    ].join('\n');
  } else if (alertType === 'min_hit') {
    caption = [
      `🎯 *MÍNIMO HISTÓRICO ATINGIDO — ${storeLabel}*`,
      ``,
      `📦 *${nameLabel}*`,
      ``,
      `💰 Preço atual: *${escapeMarkdown(formatPrice(currentPrice))}*`,
      `📌 Igual ao menor preço já registrado`,
      ``,
      `🛒 [Ver oferta](${url})`,
    ].join('\n');
  } else {
    caption = [
      `📉 *QUEDA BRUSCA DE PREÇO — ${storeLabel}*`,
      ``,
      `📦 *${nameLabel}*`,
      ``,
      `💰 Preço atual: *${escapeMarkdown(formatPrice(currentPrice))}*`,
      `⬇️ Preço anterior: ~${escapeMarkdown(formatPrice(lastPrice))}~`,
      `🏷️ Queda de *${pctLabel}%* desde o último scan`,
      ``,
      `🛒 [Ver oferta](${url})`,
    ].join('\n');
  }

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
