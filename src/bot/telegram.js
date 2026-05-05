require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

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

async function buildChartUrl(priceHistory) {
  if (!priceHistory || priceHistory.length < 3) return null;

  const labels = priceHistory.map((p) => {
    const d = new Date(p.created_at);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  });
  const prices = priceHistory.map((p) => p.price);
  const minVal = Math.min(...prices);
  const maxVal = Math.max(...prices);

  const chartConfig = {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: prices,
        borderColor: '#2196F3',
        backgroundColor: 'rgba(33,150,243,0.1)',
        fill: true,
        pointRadius: 2,
        tension: 0.3,
      }],
    },
    options: {
      legend: { display: false },
      scales: {
        yAxes: [{
          ticks: {
            min: Math.floor(minVal * 0.95),
            max: Math.ceil(maxVal * 1.05),
            callback: (v) => 'R$' + v,
          },
        }],
      },
    },
  };

  try {
    const { data } = await axios.post('https://quickchart.io/chart/create', {
      backgroundColor: 'white',
      width: 600,
      height: 300,
      chart: chartConfig,
    }, { timeout: 8000 });
    return data?.url || null;
  } catch (err) {
    console.warn('[Chart] Erro ao gerar gráfico:', err.message);
    return null;
  }
}

const CATEGORY_LABELS = {
  calcados:    '👟 Calçados',
  vestuario:   '👕 Vestuário',
  acessorios:  '💎 Acessórios',
  hardware:    '🖥️ Hardware',
  eletronicos: '⚡ Eletrônicos',
  casa:        '🏠 Casa',
  beleza:      '💄 Beleza',
  esporte:     '⚽ Esporte',
};

async function sendPriceAlert({ name, url, store, category, currentPrice, lowestPrice, lastPrice, discountPct, imageUrl, priceHistory = [], alertType = 'minimum' }) {
  const storeLabel    = escapeMarkdown(store.toUpperCase());
  const nameLabel     = escapeMarkdown(name);
  const pctLabel      = escapeMarkdown((discountPct || 0).toFixed(1));
  const categoryLine  = category && CATEGORY_LABELS[category]
    ? `\n🗂️ _${escapeMarkdown(CATEGORY_LABELS[category])}_`
    : '';

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
      `🛒 [Ver oferta](${url})${categoryLine}`,
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
      `🛒 [Ver oferta](${url})${categoryLine}`,
    ].join('\n');
  } else if (alertType === 'back_in_stock') {
    const lines = [
      `🟢 *PRODUTO DE VOLTA AO ESTOQUE — ${storeLabel}*`,
      ``,
      `📦 *${nameLabel}*`,
      ``,
      `💰 Preço atual: *${escapeMarkdown(formatPrice(currentPrice))}*`,
    ];
    if (lowestPrice) lines.push(`📌 Mínimo histórico: ${escapeMarkdown(formatPrice(lowestPrice))}`);
    lines.push(``, `🛒 [Ver oferta](${url})${categoryLine}`);
    caption = lines.join('\n');
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
      `🛒 [Ver oferta](${url})${categoryLine}`,
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

  // Envia gráfico de histórico de preço como mensagem separada
  const chartUrl = await buildChartUrl(priceHistory);
  if (chartUrl) {
    await bot.sendPhoto(TELEGRAM_CHANNEL_ID, chartUrl, {
      caption: `📊 *Histórico — ${escapeMarkdown(name)}*`,
      parse_mode: 'MarkdownV2',
    }).catch((err) => console.warn('[Chart] Erro ao enviar gráfico:', err.message));
  }
}

module.exports = { sendPriceAlert };
