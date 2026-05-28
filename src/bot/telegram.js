require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { nextTip } = require('../utils/tips');
const { getWatchers } = require('../db/queries');
const { topic, topicsForProduct } = require('../utils/topicRouter');

const { TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_USER_ID } = process.env;
// Destino das mensagens: prefere TELEGRAM_GROUP_ID (grupo com tópicos),
// cai pro TELEGRAM_CHANNEL_ID antigo se a env nova ainda não foi setada.
const TELEGRAM_DEST_ID = process.env.TELEGRAM_GROUP_ID || process.env.TELEGRAM_CHANNEL_ID;
// Strip qualquer "@" líder — link do Telegram NÃO leva "@" depois de t.me/
const BOT_USERNAME = (process.env.TELEGRAM_BOT_USERNAME || 'Elite_Achados_PromoBOT').replace(/^@/, '');
const ALERT_SEND_DELAY_MS  = parseInt(process.env.ALERT_SEND_DELAY_MS  || '1500', 10);
const ALERT_MAX_RETRIES    = parseInt(process.env.ALERT_MAX_RETRIES    || '5', 10);
const AMAZON_AFFILIATE_TAG = process.env.AMAZON_AFFILIATE_TAG || 'eliteofertas9-20';

// Reescreve URL da Amazon com a tag de afiliado (Amazon Associates).
// Toda compra a partir desse link gera comissão. Outras lojas: URL intacta.
function withAffiliateTag(rawUrl) {
  if (!AMAZON_AFFILIATE_TAG) return rawUrl;
  try {
    const u = new URL(rawUrl);
    if (u.hostname.includes('amazon.com') || u.hostname === 'amzn.to') {
      u.searchParams.set('tag', AMAZON_AFFILIATE_TAG);
      return u.toString();
    }
  } catch {}
  return rawUrl;
}

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_DEST_ID) {
  throw new Error('TELEGRAM_BOT_TOKEN e TELEGRAM_GROUP_ID (ou TELEGRAM_CHANNEL_ID) são obrigatórios no .env');
}

// polling: false — só enviamos mensagens, não precisamos receber
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

function formatPrice(price) {
  return price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// MarkdownV2 — escape pra texto FORA de links
function escapeMarkdown(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

// MarkdownV2 — escape pra URL DENTRO de [text](url)
// Apenas ')' e '\' precisam ser escapados na parte URL.
function escapeMdUrl(url) {
  return String(url).replace(/[\\)]/g, '\\$&');
}

// Wrapper que aplica delay + retry com backoff em 429 (rate limit do Telegram)
async function tgSend(method, ...args) {
  if (ALERT_SEND_DELAY_MS > 0) await sleep(ALERT_SEND_DELAY_MS);

  let lastErr;
  for (let attempt = 0; attempt <= ALERT_MAX_RETRIES; attempt++) {
    try {
      return await bot[method](...args);
    } catch (err) {
      lastErr = err;
      const code     = err?.response?.body?.error_code;
      const retryAfter = err?.response?.body?.parameters?.retry_after;
      const isRateLimit = code === 429 || /\b429\b/.test(err.message || '');

      if (!isRateLimit) throw err;

      const wait = ((retryAfter || 1) + 0.5) * 1000;
      console.warn(`[Telegram] 429 — retry em ${(wait / 1000).toFixed(1)}s (tentativa ${attempt + 1}/${ALERT_MAX_RETRIES + 1})`);
      await sleep(wait);
    }
  }
  throw lastErr;
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
  smartphones: '📱 Smartphones',
  audio:       '🎧 Áudio',
  casa:        '🏠 Casa',
  beleza:      '💄 Beleza',
  perfumaria:  '🌸 Perfumaria',
  esporte:     '⚽ Esporte',
};

// Botões padronizados pros cards de produto (alerta, showcase).
// Recebe productId pra criar callback buttons:
//   - "💎 Monitorar produto" → watch:<id>  (registra user como watcher)
//   - "📤 Compartilhar"      → share:<id>  (gera DM com link contendo ref do user)
// Se productId for null, ambos viram links genéricos pro bot.
function buildProductButtons({ productId, name, url, currentPrice, alertType, discountPct }) {
  const shareBtn = productId
    ? { text: '📤 Compartilhar', callback_data: `share:${productId}` }
    : { text: '📤 Compartilhar', url: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`🔥 ${name}\n${currentPrice ? formatPrice(currentPrice) : ''}\n\nMais ofertas: @${BOT_USERNAME}`)}` };

  const monitorBtn = productId
    ? { text: '💎 Monitorar produto', callback_data: `watch:${productId}` }
    : { text: '💎 Monitorar produto', url: `https://t.me/${BOT_USERNAME}` };

  return {
    inline_keyboard: [
      [shareBtn, monitorBtn],
    ],
  };
}

// Monta a mensagem de share pra um produto, com o ref do user incluído.
// Usado pelo callback handler share:<productId>.
function buildShareMessage({ name, url, currentPrice, alertType, discountPct, referrerId }) {
  const tag = alertType === 'price_bug'
    ? `🐛 BUG DE PREÇO -${(discountPct || 0).toFixed(0)}%`
    : alertType === 'min_beat' || alertType === 'min_hit'
      ? '🏆 menor preço já visto'
      : alertType === 'back_in_stock'
        ? '🟢 voltou ao estoque'
        : alertType === 'showcase'
          ? '🛒 achadinho'
          : `📉 -${(discountPct || 0).toFixed(0)}%`;
  const prefix = alertType === 'price_bug' ? '🐛 BUG! Corre!' : '🔥';
  const priceLabel = currentPrice ? formatPrice(currentPrice) : '';
  const refSuffix = referrerId ? `?start=ref_${referrerId}` : '';
  return `${prefix} ${name}\n${priceLabel} (${tag})\n\nMais ofertas e cadastre seus produtos: https://t.me/${BOT_USERNAME}${refSuffix}`;
}

// Alias mantido por compat (caso ainda apareça em alguma referência)
const buildShareKeyboard = buildProductButtons;

// Helper: posta uma mensagem (foto ou texto) com suporte a tópico do grupo.
// Tenta sendPhoto se tiver imagem; faz fallback pra sendMessage se a foto falhar.
async function postToDest({ threadId, caption, imageUrl, reply_markup, parse_mode = 'MarkdownV2', disable_web_page_preview = false }) {
  const opts = { parse_mode, reply_markup };
  if (threadId) opts.message_thread_id = threadId;
  try {
    if (imageUrl) {
      await tgSend('sendPhoto', TELEGRAM_DEST_ID, imageUrl, { caption, ...opts });
    } else {
      await tgSend('sendMessage', TELEGRAM_DEST_ID, caption, { disable_web_page_preview, ...opts });
    }
    return true;
  } catch (err) {
    console.error(`[Telegram] post thread=${threadId || 'main'} falhou:`, err.message);
    if (imageUrl) {
      // Fallback: tenta texto puro (foto pode estar quebrada/restrita)
      try {
        await tgSend('sendMessage', TELEGRAM_DEST_ID, caption, { disable_web_page_preview, ...opts });
        return true;
      } catch (err2) {
        console.error(`[Telegram] fallback texto thread=${threadId || 'main'} falhou:`, err2.message);
      }
    }
    return false;
  }
}

async function sendPriceAlert({ productId, name, url, store, category, currentPrice, lowestPrice, lastPrice, normalPrice, allTimeLow, score, scoreLabel, rarityCount, rarityLabel, discountPct, imageUrl, priceHistory = [], alertType = 'minimum', isMasc = false, isFem = false }) {
  url = withAffiliateTag(url); // aplica tag de afiliado Amazon (no-op nas outras lojas)
  const storeLabel    = escapeMarkdown(store.toUpperCase());
  const nameLabel     = escapeMarkdown(name);
  const pctLabel      = escapeMarkdown((discountPct || 0).toFixed(1));
  const safeUrl       = escapeMdUrl(url);
  const categoryLine  = category && CATEGORY_LABELS[category]
    ? `🗂️ _${escapeMarkdown(CATEGORY_LABELS[category])}_`
    : '';
  const fmt = (p) => escapeMarkdown(formatPrice(p));

  // Header específico por tipo de alerta
  const headers = {
    min_beat:      `🏆 *NOVO MÍNIMO HISTÓRICO — ${storeLabel}*`,
    min_hit:       `🎯 *MÍNIMO HISTÓRICO ATINGIDO — ${storeLabel}*`,
    back_in_stock: `🟢 *PRODUTO DE VOLTA AO ESTOQUE — ${storeLabel}*`,
    price_bug:     `🐛🐛🐛 *POSSÍVEL BUG DE PREÇO\\!* 🐛🐛🐛\n🚨 *${storeLabel}*`,
  };
  const header = headers[alertType] || `📉 *QUEDA BRUSCA DE PREÇO — ${storeLabel}*`;

  // Linha de preço principal
  let priceLines;
  if (alertType === 'min_beat') {
    priceLines = [
      `💰 *Preço agora: ${fmt(currentPrice)}* _\\(\\-${pctLabel}% vs mínimo\\)_`,
      `📉 Mínimo anterior: ~${fmt(lowestPrice)}~`,
    ];
  } else if (alertType === 'min_hit') {
    priceLines = [`💰 *Preço agora: ${fmt(currentPrice)}*`];
  } else if (alertType === 'back_in_stock') {
    priceLines = [`💰 *Preço agora: ${fmt(currentPrice)}*`];
  } else if (alertType === 'price_bug') {
    priceLines = [
      `💸 *Preço agora: ${fmt(currentPrice)}* _\\(\\-${pctLabel}%\\)_`,
      `⬇️ Preço anterior: ~${fmt(lastPrice)}~`,
    ];
  } else {
    priceLines = [
      `💰 *Preço agora: ${fmt(currentPrice)}* _\\(\\-${pctLabel}%\\)_`,
      `⬇️ Preço anterior: ~${fmt(lastPrice)}~`,
    ];
  }

  // Bloco de contexto (preço normal + mínimo histórico)
  // Não duplica info — se header já diz "mínimo atingido", omite "Igual ao mín"
  const ctxLines = [];
  if (normalPrice && normalPrice > currentPrice * 1.01) {
    const offFromNormal = ((normalPrice - currentPrice) / normalPrice * 100).toFixed(0);
    ctxLines.push(`📊 Preço normal: ${fmt(normalPrice)} _\\(\\-${offFromNormal}% agora\\)_`);
  }
  const headerAlreadyMin = alertType === 'min_beat' || alertType === 'min_hit';
  if (allTimeLow && allTimeLow < currentPrice * 0.99) {
    ctxLines.push(`🏆 Mínimo histórico: ${fmt(allTimeLow)}`);
  } else if (allTimeLow && Math.abs(currentPrice - allTimeLow) / allTimeLow < 0.01 && !headerAlreadyMin) {
    ctxLines.push(`🏆 _Igual ao mínimo histórico_`);
  }

  // Bloco de inteligência (score + raridade)
  const intelLines = [];
  if (typeof score === 'number' && score > 0) {
    const stars = '⭐'.repeat(Math.max(1, Math.round(score / 2)));
    intelLines.push(`${stars} *Avaliação: ${escapeMarkdown(score.toFixed(1))}/10* — ${escapeMarkdown(scoreLabel || '')}`);
  }
  if (typeof rarityCount === 'number') {
    const rarityIcon = rarityCount <= 1 ? '💎' : rarityCount <= 5 ? '🔥' : rarityCount <= 15 ? '🔁' : '📊';
    intelLines.push(`${rarityIcon} Oferta *${escapeMarkdown(rarityLabel || '')}* \\(apareceu ${rarityCount}x em 90 dias\\)`);
  }

  // Monta o caption com linhas em branco entre seções pra respirar
  const sections = [
    header,
    `📦 *${nameLabel}*`,
    priceLines.join('\n'),
  ];
  if (ctxLines.length) sections.push(ctxLines.join('\n'));
  if (intelLines.length) sections.push(intelLines.join('\n'));
  if (alertType === 'price_bug') {
    sections.push(
      `⚠️ _Pode ser erro do site\\. Se for real, esgota em minutos\\._\n` +
      `⚡ *CONFIRME ANTES DE FECHAR — corre\\!*`
    );
  }
  const footerParts = [`🛒 [Ver oferta](${safeUrl})`];
  if (categoryLine) footerParts.push(categoryLine);
  sections.push(footerParts.join('\n'));

  let caption = sections.join('\n\n');

  // Dica rotativa no final (engaja sem poluir muito)
  caption += `\n\n_${escapeMarkdown(nextTip())}_`;

  const reply_markup = buildProductButtons({ productId, name, url, currentPrice, alertType, discountPct });

  // Decide tópico(s): por categoria/gênero. Bug duplica também no tópico Bugs.
  const threads = new Set(topicsForProduct({ category, isMasc, isFem }));
  if (alertType === 'price_bug') {
    const bugsTopic = topic('bugs');
    if (bugsTopic) threads.add(bugsTopic);
  }
  // Se não há nenhum tópico configurado, posta no topo do grupo (sem thread_id)
  if (threads.size === 0) threads.add(null);

  let mainSent = false;
  for (const threadId of threads) {
    const ok = await postToDest({ threadId, caption, imageUrl, reply_markup });
    if (ok) {
      mainSent = true;
      console.log(`[Telegram] Alerta enviado (thread ${threadId || 'main'}): ${name} — ${formatPrice(currentPrice)}`);
    }
  }

  if (!mainSent) {
    throw new Error('Falha ao enviar alerta após retries');
  }

  // Envia DM individual pros watchers desse produto (best effort).
  // getWatchers respeita target_price — só recebe quem o produto bateu o alvo.
  if (productId) {
    try {
      const watchers = await getWatchers(productId, currentPrice);
      if (watchers.length) {
        const dmCaption = caption + `\n\n_⚡ você monitora esse produto — toque pra parar de receber_`;
        const dmKeyboard = {
          inline_keyboard: [[{ text: '🗑 Parar de monitorar', callback_data: `unwatch:${productId}` }]],
        };
        for (const watcherId of watchers) {
          try {
            if (imageUrl) {
              await tgSend('sendPhoto', watcherId, imageUrl, { caption: dmCaption, parse_mode: 'MarkdownV2', reply_markup: dmKeyboard });
            } else {
              await tgSend('sendMessage', watcherId, dmCaption, { parse_mode: 'MarkdownV2', disable_web_page_preview: false, reply_markup: dmKeyboard });
            }
          } catch (err) {
            // 403: user bloqueou o bot, ou nunca abriu o privado — ignora silenciosamente
            const code = err?.response?.body?.error_code;
            if (code !== 403) console.warn(`[Telegram] DM ${watcherId} falhou:`, err.message);
          }
        }
        console.log(`[Telegram] DM enviada pra ${watchers.length} watcher(s) de ${name}`);
      }
    } catch (err) {
      console.warn('[Telegram] Erro ao buscar watchers:', err.message);
    }
  }

  // Envia gráfico de histórico de preço como mensagem separada (best effort)
  // No mesmo thread do alerta principal (pega o primeiro thread postado).
  const chartUrl = await buildChartUrl(priceHistory);
  if (chartUrl) {
    const chartOpts = { caption: `📊 *Histórico — ${escapeMarkdown(name)}*`, parse_mode: 'MarkdownV2' };
    const firstThread = [...threads][0];
    if (firstThread) chartOpts.message_thread_id = firstThread;
    await tgSend('sendPhoto', TELEGRAM_DEST_ID, chartUrl, chartOpts)
      .catch((err) => console.warn('[Chart] Erro ao enviar gráfico:', err.message));
  }
}

// Card de vitrine — indicação de produto (não é alerta de queda).
// Usado pela rotação de produtos Amazon pra gerar tráfego de afiliado.
async function sendShowcase({ productId, name, url, store, category, price, imageUrl }) {
  url = withAffiliateTag(url);
  const storeLabel = escapeMarkdown(store.toUpperCase());
  const nameLabel  = escapeMarkdown(name);
  const safeUrl    = escapeMdUrl(url);
  const categoryLine = category && CATEGORY_LABELS[category]
    ? `\n🗂️ _${escapeMarkdown(CATEGORY_LABELS[category])}_`
    : '';

  const caption = [
    `🛒 *VALE A PENA — ${storeLabel}*`,
    ``,
    `📦 *${nameLabel}*`,
    ``,
    `💰 *${escapeMarkdown(formatPrice(price))}*`,
    `_Preço de referência — confira o valor atual na página\\._`,
    ``,
    `🛍️ [Ver na loja](${safeUrl})${categoryLine}`,
    ``,
    `_${escapeMarkdown(nextTip())}_`,
  ].join('\n');

  const reply_markup = buildProductButtons({ productId, name, url, currentPrice: price, alertType: 'showcase' });
  const threadId = topic('achadinhos') || topic('geral');

  const ok = await postToDest({ threadId, caption, imageUrl, reply_markup });
  if (ok) console.log(`[Telegram] Achadinho enviado (thread ${threadId || 'main'}): ${name} — ${formatPrice(price)}`);
  return ok;
}

// Card de oferta com cupom — usado pela rotina de cupons da KaBuM.
async function sendCouponDeal({ name, url, price, oldPrice, discountPct, stock, coupon, couponDiscount, image }) {
  const nameLabel = escapeMarkdown(name);
  const safeUrl   = escapeMdUrl(url);

  const lines = [
    `🎟️ *CUPOM KABUM*`,
    ``,
    `📦 *${nameLabel}*`,
    ``,
    `💰 *${escapeMarkdown(formatPrice(price))}*`,
  ];
  if (oldPrice && oldPrice > price) {
    lines.push(`📉 De ~${escapeMarkdown(formatPrice(oldPrice))}~ \\(${escapeMarkdown((discountPct || 0).toFixed(0))}% OFF\\)`);
  }
  lines.push(
    ``,
    `🎟️ Cupom: \`${escapeMarkdown(coupon)}\``,
    `💸 ${escapeMarkdown(couponDiscount || 'desconto extra no checkout')}`,
    ``,
    `🛒 [Ver produto](${safeUrl})`,
    `_Use o cupom no carrinho antes de fechar a compra\\._`,
    ``,
    `_${escapeMarkdown(nextTip())}_`,
  );
  const caption = lines.join('\n');

  const reply_markup = {
    inline_keyboard: [[
      { text: '🛒 Ver oferta', url },
      { text: '📤 Compartilhar', url: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`🎟️ ${name} — cupom ${coupon} no @${BOT_USERNAME}`)}` },
    ]],
  };

  const threadId = topic('cupons_kabum') || topic('cupons_geral') || topic('geral');
  const ok = await postToDest({ threadId, caption, imageUrl: image, reply_markup });
  if (ok) console.log(`[Telegram] Cupom enviado (thread ${threadId || 'main'}): ${name} — ${coupon}`);
  return ok;
}

// Digest consolidado de produtos que voltaram ao estoque (postado 1x/dia).
// Recebe uma lista [{ name, url, store, price, lowestPrice }] e monta uma
// única mensagem com tudo. Sem foto (telegram caption tem limite de 1024 chars).
async function sendBackInStockDigest(items) {
  if (!items || !items.length) return false;
  const header = items.length === 1
    ? '🟢 *1 PRODUTO VOLTOU AO ESTOQUE*'
    : `🟢 *${items.length} PRODUTOS VOLTARAM AO ESTOQUE*`;
  const lines = [header, ''];

  for (const it of items) {
    const url = withAffiliateTag(it.url);
    const nameLabel  = escapeMarkdown(it.name);
    const storeLabel = escapeMarkdown((it.store || '').toUpperCase());
    const priceLabel = escapeMarkdown(formatPrice(it.price));
    const safeUrl    = escapeMdUrl(url);
    lines.push(`📦 [${nameLabel}](${safeUrl})`);
    lines.push(`   _${storeLabel}_ — *${priceLabel}*`);
    if (it.lowestPrice && it.lowestPrice > 0) {
      lines.push(`   📌 mín\\. histórico: ${escapeMarkdown(formatPrice(it.lowestPrice))}`);
    }
    lines.push('');
  }

  lines.push(`_${escapeMarkdown(nextTip())}_`);

  const reply_markup = {
    inline_keyboard: [[
      { text: '💎 Monitorar meus produtos', url: `https://t.me/${BOT_USERNAME}` },
    ]],
  };

  const threadId = topic('geral');
  const opts = { parse_mode: 'MarkdownV2', disable_web_page_preview: true, reply_markup };
  if (threadId) opts.message_thread_id = threadId;
  try {
    await tgSend('sendMessage', TELEGRAM_DEST_ID, lines.join('\n'), opts);
    console.log(`[Telegram] Digest back_in_stock enviado (thread ${threadId || 'main'}): ${items.length} produto(s)`);
    return true;
  } catch (err) {
    console.error('[Telegram] Erro ao enviar digest:', err.message);
    return false;
  }
}

// TOP da semana — post fixo dominical com as maiores quedas dos últimos 7d.
// Recebe [{ product: {name, url, store}, currentPrice, weekStartPrice, dropPct,
// available }]. Itens com available=false aparecem na lista com tag ESGOTADO
// (sem link, sem destaque) — assim os membros veem o que perderam.
async function sendWeeklyTop(items) {
  if (!items || !items.length) return false;
  const lines = ['🏆 *TOP OFERTAS DA SEMANA*', '_As maiores quedas dos últimos 7 dias_', ''];

  let i = 1;
  for (const it of items) {
    const url      = withAffiliateTag(it.product.url);
    const name     = escapeMarkdown(it.product.name);
    const store    = escapeMarkdown((it.product.store || '').toUpperCase());
    const safeUrl  = escapeMdUrl(url);
    const current  = escapeMarkdown(formatPrice(it.currentPrice));
    const before   = escapeMarkdown(formatPrice(it.weekStartPrice));
    const pct      = escapeMarkdown(it.dropPct.toFixed(0));

    if (it.available === false) {
      lines.push(`*${i}\\.* ~${name}~  ❌ *ESGOTADO*`);
      lines.push(`   _${store}_ — chegou a *${current}* \\(de ~${before}~, *\\-${pct}%*\\)`);
    } else {
      lines.push(`*${i}\\.* [${name}](${safeUrl})`);
      lines.push(`   _${store}_ — *${current}* \\(de ~${before}~, *\\-${pct}%*\\)`);
    }
    lines.push('');
    i++;
  }

  const soldCount = items.filter((it) => it.available === false).length;
  if (soldCount > 0) {
    lines.push(`⚠️ _${soldCount === 1 ? '1 item esgotou' : soldCount + ' itens esgotaram'} — ative os alertas pra não perder a próxima\\._`);
    lines.push('');
  }

  lines.push(`💎 *Quer alerta no SEU produto?*`);
  lines.push(`Chama o @${BOT_USERNAME} e use \`/addproduto <link>\``);

  const reply_markup = {
    inline_keyboard: [[
      { text: '💎 Cadastrar meus produtos', url: `https://t.me/${BOT_USERNAME}` },
    ]],
  };

  const threadId = topic('top_semana') || topic('geral');
  const opts = { parse_mode: 'MarkdownV2', disable_web_page_preview: true, reply_markup };
  if (threadId) opts.message_thread_id = threadId;
  try {
    await tgSend('sendMessage', TELEGRAM_DEST_ID, lines.join('\n'), opts);
    console.log(`[Telegram] TOP semanal enviado (thread ${threadId || 'main'}): ${items.length} item(s)`);
    return true;
  } catch (err) {
    console.error('[Telegram] Erro ao enviar TOP semanal:', err.message);
    return false;
  }
}

// Recomendação personalizada — DM individual semanal pro user com top drops
// das suas categorias favoritas.
async function sendPersonalRecommendation(userId, items, categories) {
  if (!items || !items.length) return false;
  const catLabels = categories.map((c) => CATEGORY_LABELS[c] || c).join(', ');
  const lines = [
    `💡 *Recomendações pra você*`,
    ``,
    `_Achei ${items.length} oferta\\(s\\) da semana nas suas categorias_ \\(${escapeMarkdown(catLabels)}\\)\\:`,
    ``,
  ];
  let i = 1;
  for (const it of items) {
    const url = withAffiliateTag(it.product.url);
    const name = escapeMarkdown(it.product.name);
    const store = escapeMarkdown((it.product.store || '').toUpperCase());
    const safeUrl = escapeMdUrl(url);
    const cur = escapeMarkdown(formatPrice(it.currentPrice));
    const before = escapeMarkdown(formatPrice(it.weekStartPrice));
    const pct = escapeMarkdown(it.dropPct.toFixed(0));
    lines.push(`*${i}\\.* [${name}](${safeUrl})`);
    lines.push(`   _${store}_ — *${cur}* \\(de ~${before}~, *\\-${pct}%*\\)`);
    lines.push('');
    i++;
  }
  lines.push(`💎 _Quer monitorar algum desses? Toque no link e use /addproduto no @${BOT_USERNAME}_`);

  try {
    await tgSend('sendMessage', userId, lines.join('\n'), {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    });
    console.log(`[Telegram] Recomendação enviada pra ${userId} (${items.length} itens)`);
    return true;
  } catch (err) {
    const code = err?.response?.body?.error_code;
    if (code !== 403) console.warn(`[Telegram] Recomendação ${userId} falhou:`, err.message);
    return false;
  }
}

async function sendAdminMessage(text, opts = {}) {
  if (!TELEGRAM_ADMIN_USER_ID) {
    console.warn('[Telegram] TELEGRAM_ADMIN_USER_ID não configurado — pulando notificação admin');
    return;
  }
  try {
    await tgSend('sendMessage', TELEGRAM_ADMIN_USER_ID, text, { parse_mode: 'Markdown', disable_web_page_preview: true, ...opts });
  } catch (err) {
    console.error('[Telegram] Erro ao notificar admin:', err.message);
  }
}

module.exports = { sendPriceAlert, sendAdminMessage, sendShowcase, sendCouponDeal, sendBackInStockDigest, sendWeeklyTop, sendPersonalRecommendation, buildShareMessage };
