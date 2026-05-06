require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID, TELEGRAM_ADMIN_USER_ID } = process.env;
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'Elite_Achados_PromoBOT';

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

const CHART_MIN_CHANGES = parseInt(process.env.CHART_MIN_CHANGES || '15', 10);

async function buildChartUrl(priceHistory) {
  if (!priceHistory || priceHistory.length < 2) return null;

  let changes = 0;
  for (let i = 1; i < priceHistory.length; i++) {
    if (priceHistory[i].price !== priceHistory[i - 1].price) changes++;
  }
  if (changes <= CHART_MIN_CHANGES) return null;

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

function buildShareKeyboard({ name, url, currentPrice, alertType, discountPct }) {
  const tag = alertType === 'price_bug'
    ? `🐛 BUG DE PREÇO -${(discountPct || 0).toFixed(0)}%`
    : alertType === 'min_beat' || alertType === 'min_hit'
      ? '🏆 menor preço já visto'
      : alertType === 'back_in_stock'
        ? '🟢 voltou ao estoque'
        : `📉 -${(discountPct || 0).toFixed(0)}%`;

  const prefix = alertType === 'price_bug' ? '🐛 BUG! Corre!' : '🔥';
  const shareText = `${prefix} ${name}\n${formatPrice(currentPrice)} (${tag})\n\nMais ofertas e cadastre seus próprios produtos: @${BOT_USERNAME}`;
  const shareUrl  = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareText)}`;
  const botUrl    = `https://t.me/${BOT_USERNAME}`;

  return {
    inline_keyboard: [
      [
        { text: '📤 Compartilhar', url: shareUrl },
        { text: '💎 Monitorar produto', url: botUrl },
      ],
    ],
  };
}

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
  } else if (alertType === 'price_bug') {
    caption = [
      `🐛🐛🐛 *POSSÍVEL BUG DE PREÇO\\!* 🐛🐛🐛`,
      ``,
      `🚨 *${storeLabel}*`,
      `📦 *${nameLabel}*`,
      ``,
      `💸 Preço agora: *${escapeMarkdown(formatPrice(currentPrice))}*`,
      `💰 Preço normal: ~${escapeMarkdown(formatPrice(lastPrice))}~`,
      `🔥 *${pctLabel}%* abaixo do preço normal`,
      ``,
      `⚠️ _Pode ser erro do site\\. Se for real, esgota em minutos\\._`,
      `⚡ *CONFIRME ANTES DE FECHAR — corre\\!*`,
      ``,
      `🛒 [VER OFERTA AGORA](${url})${categoryLine}`,
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
      `🛒 [Ver oferta](${url})${categoryLine}`,
    ].join('\n');
  }

  const reply_markup = buildShareKeyboard({ name, url, currentPrice, alertType, discountPct });

  try {
    if (imageUrl) {
      await bot.sendPhoto(TELEGRAM_CHANNEL_ID, imageUrl, {
        caption,
        parse_mode: 'MarkdownV2',
        reply_markup,
      });
    } else {
      await bot.sendMessage(TELEGRAM_CHANNEL_ID, caption, {
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: false,
        reply_markup,
      });
    }
    console.log(`[Telegram] Alerta enviado: ${name} — ${formatPrice(currentPrice)}`);
  } catch (err) {
    console.error('[Telegram] Erro ao enviar alerta:', err.message);
    if (imageUrl) {
      await bot.sendMessage(TELEGRAM_CHANNEL_ID, caption, {
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: false,
        reply_markup,
      }).then(() => console.log(`[Telegram] Alerta enviado (sem foto): ${name} — ${formatPrice(currentPrice)}`))
        .catch(() => {});
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

async function sendAdminMessage(text, opts = {}) {
  if (!TELEGRAM_ADMIN_USER_ID) {
    console.warn('[Telegram] TELEGRAM_ADMIN_USER_ID não configurado — pulando notificação admin');
    return;
  }
  try {
    await bot.sendMessage(TELEGRAM_ADMIN_USER_ID, text, { parse_mode: 'Markdown', disable_web_page_preview: true, ...opts });
  } catch (err) {
    console.error('[Telegram] Erro ao notificar admin:', err.message);
  }
}

module.exports = { sendPriceAlert, sendAdminMessage };
