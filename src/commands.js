require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const {
  getActiveProducts, addProduct, deactivateProduct,
  countProductsByUser, getProductsByUser, findProductByIdAndUser,
  addSuggestion, getPendingSuggestions, updateSuggestionStatus,
  recordReferral, countReferrals, hasBeenReferred,
  getUnavailableProducts,
  findActiveProductByUrl, addWatcher, removeWatcher, isWatching,
  getWatchedProducts, countWatchedProducts,
  getRecentPostedMessages, deletePostedMessageRecord, findPostedByMessageId,
} = require('./db/queries');
const { getPrice } = require('./scrapers');
const { sendAdminMessage, buildShareMessage } = require('./bot/telegram');
const { normalizeUrl } = require('./utils/normalizeUrl');
const { getAdminStats, getHealthChecks, getProductPriceStats, searchProducts, setWatcherTargetPrice } = require('./utils/adminStats');
const { supabase } = require('./db/supabase');
const axios = require('axios');

const { TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_USER_ID } = process.env;

if (!TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN é obrigatório no .env');
}

const FREE_USER_PRODUCT_LIMIT = parseInt(process.env.FREE_USER_PRODUCT_LIMIT || '3', 10);
const BONUS_PER_REFERRAL      = parseInt(process.env.BONUS_PER_REFERRAL      || '1', 10);
const MAX_BONUS_SLOTS         = parseInt(process.env.MAX_BONUS_SLOTS         || '10', 10);
// Strip qualquer "@" líder — link do Telegram NÃO leva "@" depois de t.me/
const BOT_USERNAME            = (process.env.TELEGRAM_BOT_USERNAME || 'Elite_Achados_PromoBOT').replace(/^@/, '');
const PREMIUM_IDS = (process.env.TELEGRAM_PREMIUM_USER_IDS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

const STORE_ROUTES = [
  { match: 'mercadolivre.com', store: 'mercadolivre', label: 'Mercado Livre' },
  { match: 'amazon.com.br',    store: 'amazon',       label: 'Amazon BR'     },
  { match: 'amzn.to',          store: 'amazon',       label: 'Amazon BR'     },
  { match: 'kabum.com.br',     store: 'kabum',        label: 'KaBuM!'        },
  { match: 'netshoes.com.br',  store: 'netshoes',     label: 'Netshoes'      },
  { match: 'dafiti.com.br',    store: 'dafiti',       label: 'Dafiti'        },
  { match: 'farmrio.com.br',   store: 'farmrio',      label: 'Farm Rio'      },
  { match: 'animale.com.br',   store: 'animale',      label: 'Animale'       },
  { match: 'zattini.com.br',   store: 'zattini',      label: 'Zattini'       },
  { match: 'apple.com',        store: 'apple',        label: 'Apple Store BR'},
  { match: 'lg.com',           store: 'lg',           label: 'LG Brasil'     },
  { match: 'keychronbrasil.com', store: 'keychron',   label: 'Keychron'      },
  { match: 'fastshop.com',     store: 'fastshop',     label: 'Fast Shop'     },
  { match: 'infocellshop.com', store: 'infocellshop', label: 'Infocellshop'  },
  { match: 'iceloshop.com',    store: 'iceloshop',    label: 'Icelo Shop'    },
  { match: 'sephora.com',      store: 'sephora',      label: 'Sephora'       },
  { match: 'pichau.com',       store: 'pichau',       label: 'Pichau'        },
  { match: 'wap.ind.br',       store: 'wap',          label: 'WAP'           },
];

function detectStore(url) {
  let h;
  try { h = new URL(url).hostname.toLowerCase(); } catch { return null; }
  const route = STORE_ROUTES.find((r) => h.includes(r.match) || h === r.match);
  return route || null;
}

function isLikelyProductUrl(url) {
  let path;
  try { path = new URL(url).pathname.toLowerCase() + new URL(url).search.toLowerCase(); }
  catch { return false; }
  // Rejeita URLs de busca/categoria (sinais comuns de não ser página de produto)
  const blacklist = ['/busca', '/search', '/q=', '/categoria/', '/categories/', '/colecao/', '/collection/', '/genero/', '/marca/', '/brands/'];
  return !blacklist.some((bad) => path.includes(bad));
}

function isAdmin(msg) {
  return TELEGRAM_ADMIN_USER_ID && String(msg.from.id) === String(TELEGRAM_ADMIN_USER_ID);
}

function isPremium(msg) {
  return isAdmin(msg) || PREMIUM_IDS.includes(String(msg.from.id));
}

async function getUserLimit(userId) {
  const refs = await countReferrals(userId);
  const bonus = Math.min(refs * BONUS_PER_REFERRAL, MAX_BONUS_SLOTS);
  return { base: FREE_USER_PRODUCT_LIMIT, bonus, total: FREE_USER_PRODUCT_LIMIT + bonus, refs };
}

function fmtPrice(p) {
  return p.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const SUPPORTED_LIST = [
  '🛒 *Lojas suportadas*',
  '',
  '• Mercado Livre',
  '• Amazon (.com.br / amzn.to)',
  '• KaBuM!',
  '• Netshoes',
  '• Dafiti',
  '• Farm Rio',
  '• Animale',
  '• Zattini',
  '• Apple Store BR',
  '• Sephora',
  '• Pichau',
  '• Keychron Brasil',
  '• Fast Shop',
  '• Infocellshop, Icelo Shop',
  '• WAP (loja oficial)',
  '',
  '_Para outras lojas, use_ `/sugerir <link>` _que eu avalio._',
].join('\n');

// Guia COMPLETO — exibido pelo /help. Mais detalhado que helpMessage().
function fullGuide(admin) {
  const lines = [
    '📖 *GUIA COMPLETO — Elite Achados & Promo*',
    '',
    '*🎯 O que é o canal?*',
    'Monitoro preços em *14+ lojas brasileiras* e alerto no canal quando algo *realmente* cai de preço. Sem promoção falsa, sem flood.',
    '',
    '*📺 O que sai no canal:*',
    '📉 *Queda de preço* (≥20% vs último preço)',
    '🏆 *Novo mínimo histórico*',
    '🎯 *Voltou ao mínimo* — momento bom de comprar',
    '🐛 *Bug de preço* (>80% off — corre que esgota)',
    '🟢 *Voltou ao estoque* — digest 1x/dia (15h BRT)',
    '🛒 *Achadinhos da Amazon* — 5x/dia em horário aleatório',
    '🎟️ *Cupons KaBuM* — 13h e 19h todo dia',
    '🏆 *TOP da semana* — domingos 16h',
    '',
    '*━━━ COMANDOS ━━━*',
    '',
    '*📦 CADASTRO E MONITORAMENTO*',
    '',
    `\`/addproduto <link>\` — cadastra um produto pra monitorar. Recebe alerta *no seu privado* quando cair de preço.`,
    `   Ex: \`/addproduto https://amazon.com.br/dp/B0XYZ\``,
    `   Limite: *${FREE_USER_PRODUCT_LIMIT} produtos grátis*`,
    `   _Se o produto já é monitorado pelo bot, vira watcher de graça (não conta no limite)._`,
    '',
    '`/meusprodutos` — lista tudo: cadastrados + observados',
    '',
    '`/removerproduto <id>` — para de monitorar (ou desativa, se for seu)',
    '   Ex: `/removerproduto abc12345`',
    '',
    '*📊 HISTÓRICO E PREÇO-ALVO*',
    '',
    '`/preco <id>` — histórico de preço do produto:',
    '   • Preço atual, mínimo histórico, máximo, média 30d',
    '   • Indicação "tá no mínimo? compra agora ou espera"',
    '   Ex: `/preco abc12345` _(aceita só os 8 primeiros chars do ID)_',
    '',
    '`/avisar <id> <preço>` — define um *preço-alvo* personalizado:',
    '   Recebe DM SÓ quando o produto cair pra esse valor (ou abaixo)',
    '   Ex: `/avisar abc12345 1500` _(avisa só se cair pra R$ 1.500 ou menos)_',
    '   _Pra remover o filtro: use preço alto (ex: `999999`)_',
    '',
    '*💎 BOTÕES DOS CARDS NO GRUPO*',
    '',
    '📤 *Compartilhar* — gera link de share *já com seu ref* (cada amigo cadastrado vira +1 slot)',
    '💎 *Monitorar produto* — começa a receber DM daquele item (não conta no limite)',
    '🗑 *Parar de monitorar* — aparece nas DMs que você recebe',
    '',
    '*🤝 INDICAÇÃO E SUGESTÕES*',
    '',
    `\`/convidar\` — pega seu link de indicação. Cada amigo cadastrado te dá *+${BONUS_PER_REFERRAL} slot extra* (até +${MAX_BONUS_SLOTS}).`,
    '',
    '`/sugerir <link>` — sugere um produto/loja pro canal',
    '   Ex: `/sugerir https://kabum.com.br/produto bom pra setup gamer`',
    '',
    '*ℹ️ OUTROS*',
    '',
    '`/lojas` — lista das lojas suportadas',
    '`/ajuda` — versão curta da ajuda',
    '`/help` — este guia completo',
    '',
    '━━━━━━━━━━━━━━━━',
    '',
    '*🎁 LIMITE E COMO AUMENTAR*',
    `• Free: *${FREE_USER_PRODUCT_LIMIT} produtos cadastrados*`,
    `• +${BONUS_PER_REFERRAL} por amigo indicado (até +${MAX_BONUS_SLOTS})`,
    '• Watchers (do que já tá no canal): *sem limite*',
    '• Premium: features extras (em breve)',
    '',
    '*💡 PRA NÃO PERDER NENHUMA OFERTA*',
    '🔔 Ative as notificações do grupo',
    '📌 Fixe o grupo no topo do Telegram',
    '🎯 Silencie tópicos que não interessam (toque no nome → Mute)',
    '🤝 Compartilhe com amigos — `/convidar` te dá link com ref',
    '',
    '*❓ DÚVIDAS FREQUENTES*',
    '',
    '• *Posso confiar nos preços?*',
    '   Sim — verifico antes de postar e bugs >80% passam por dupla checagem.',
    '',
    '• *Onde recebo os alertas dos meus produtos?*',
    '   No privado deste bot. Os alertas também aparecem no grupo pra todos.',
    '',
    '• *Diferença entre cadastrar e clicar em "Monitorar"?*',
    '   - *Cadastrar* (`/addproduto`): adiciona produto NOVO ao bot (conta no limite).',
    '   - *Monitorar* (botão nos cards): vira watcher de produto que JÁ está no bot (NÃO conta).',
    '',
    '• *Como uso o preço-alvo?*',
    '   Use `/avisar <id> <preço>` pra receber DM SÓ quando o produto cair pro valor que você quer. Útil pra produtos caros que você quer comprar só num preço bom.',
    '',
    '• *Quanto tempo até receber um alerta?*',
    '   Scan a cada ~60 min em todos os produtos.',
    '',
    '✉️ *Suporte:* dúvida ou erro? Me chama no privado.',
  ];
  if (admin) {
    lines.push(
      '',
      '━━━━━━━━━━━━━━━━',
      '',
      '👑 *COMANDOS ADMIN*',
      '`/stats` — dashboard com estatísticas',
      '`/health` — diagnóstico do sistema',
      '`/buscar <nome>` — encontra produto pelo nome',
      '`/listarprodutos` — todos os ativos',
      '`/indisponiveis` — produtos em backoff',
      '`/postarcupons` — dispara rotina KaBuM',
      '`/topsemana` — posta TOP da semana',
      '`/sugestoes` — sugestões pendentes',
      '`/aprovarsugestao <id>` — aprovar',
      '`/rejeitarsugestao <id>` — rejeitar',
    );
  }
  return lines.join('\n');
}

function helpMessage(admin) {
  const base = [
    '👋 *Bem-vindo(a) ao Elite Achados & Promo!*',
    '',
    'Monitoro preços em *14+ lojas* e aviso quando algo *cai de verdade* — não inflo expectativa com promoção falsa.',
    '',
    '🎯 *O que sai no canal:*',
    '• Quedas de preço ≥20%',
    '• Novos mínimos históricos',
    '• 🐛 Bugs de preço (>80% off)',
    '• 🎟️ Cupons KaBuM 13h e 19h',
    '• 🏆 TOP da semana — domingos 16h',
    '',
    '🤖 *Seus comandos:*',
    `📦 \`/addproduto <link>\` — monitora um produto (${FREE_USER_PRODUCT_LIMIT} grátis)`,
    '📋 `/meusprodutos` — seus produtos',
    '🗑 `/removerproduto <id>` — remover',
    '📊 `/preco <id>` — histórico de preço',
    '🎯 `/avisar <id> <preço>` — preço-alvo personalizado',
    '💡 `/sugerir <link>` — sugere pro canal',
    `🤝 \`/convidar\` — +${BONUS_PER_REFERRAL} slot por amigo (até +${MAX_BONUS_SLOTS})`,
    '🛒 `/lojas` — lojas suportadas',
    '',
    '💡 *Pra não perder nenhuma oferta:*',
    '🔔 Ative as notificações do canal',
    '📌 Fixe o canal no topo do Telegram',
    '',
    'Use `/help` pro guia completo.',
  ];
  if (admin) {
    base.push(
      '',
      '👑 *Admin*',
      '`/listarprodutos` — todos os ativos',
      '`/indisponiveis` — produtos em backoff',
      '`/postarcupons` — posta cupons KaBuM no canal',
      '`/topsemana` — posta TOP 5 semanal no canal',
      '`/sugestoes` — pendentes',
      '`/aprovarsugestao <id>`',
      '`/rejeitarsugestao <id>`',
    );
  }
  return base.join('\n');
}

async function reply(msg, text, opts = {}) {
  return bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown', ...opts });
}

// Wrapper que envolve qualquer handler com try/catch robusto.
// - Loga erro completo no console (vai pro Railway logs)
// - Manda mensagem amigável pro user com detalhes mínimos
// - Fallback se o erro original não tiver .message
// - Tenta sem Markdown se o primeiro envio falhar (caso seja erro de parse)
function safeHandler(name, handlerFn) {
  return async (msg, match) => {
    try {
      await handlerFn(msg, match);
    } catch (err) {
      // Extrai mensagem de erro robustamente — Telegram API pode jogar erros
      // com formatos diferentes (resposta HTTP, axios error, etc).
      const errMsg = err?.response?.body?.description
                  || err?.response?.data?.description
                  || err?.message
                  || String(err)
                  || 'erro desconhecido';
      console.error(`[Bot] /${name} falhou:`, errMsg);
      if (err?.stack) console.error(err.stack.split('\n').slice(0, 5).join('\n'));

      // Tenta avisar o user. Sem parse_mode pra evitar erro recursivo de Markdown.
      try {
        await bot.sendMessage(msg.chat.id, `❌ Erro no /${name}: ${errMsg.slice(0, 250)}`);
      } catch (sendErr) {
        console.error(`[Bot] falha ao avisar user:`, sendErr.message);
      }
    }
  };
}

// Intercepta bot.onText pra envolver TODOS os handlers com safeHandler
// automaticamente. Assim cada handler ganha tratamento de erro sem precisar
// modificar 19 lugares.
const _originalOnText = bot.onText.bind(bot);
bot.onText = function (regex, handler) {
  const name = String(regex).match(/\/(\w+)/)?.[1] || 'cmd';
  return _originalOnText(regex, safeHandler(name, handler));
};

// ── /start [ref_<id>], /ajuda — boas-vindas curtas ──────────────────────────
bot.onText(/^\/(start|ajuda)(?:\s+(\S+))?/, async (msg, match) => {
  const cmd   = match[1];
  const param = match[2];

  // Atribuição de referral via /start ref_<userid>
  if (cmd === 'start' && param && /^ref_\d+$/.test(param)) {
    const referrerId = param.slice(4);
    const referredId = String(msg.from.id);

    if (referrerId !== referredId) {
      const already = await hasBeenReferred(referredId);
      if (!already) {
        const ok = await recordReferral(referrerId, referredId);
        if (ok) {
          // Notifica o referrer (best effort — pode falhar se ele bloqueou o bot)
          bot.sendMessage(referrerId,
            `🎉 *+${BONUS_PER_REFERRAL} slot extra!*\n\nAlguém se cadastrou pelo seu link de indicação. Veja seu novo limite com \`/meusprodutos\`.`,
            { parse_mode: 'Markdown' }
          ).catch(() => {});

          await reply(msg, '🤝 Você foi indicado por um amigo! Bem-vindo(a).\n\n' + helpMessage(false));
          return;
        }
      }
    }
  }

  await reply(msg, helpMessage(isAdmin(msg)));
});

// ── /help — guia completo ────────────────────────────────────────────────────
bot.onText(/^\/help\b/, async (msg) => {
  await reply(msg, fullGuide(isAdmin(msg)));
});

// ── /convidar ────────────────────────────────────────────────────────────────
bot.onText(/^\/convidar\b/, async (msg) => {
  const userId = msg.from.id;
  const refLink = `https://t.me/${BOT_USERNAME}?start=ref_${userId}`;
  const { bonus, total, refs } = await getUserLimit(userId);
  const limitDisplay = isPremium(msg) ? '∞ (premium)' : `${total}`;

  await reply(msg, [
    '🤝 *Convide e ganhe slots extras!*',
    '',
    `Cada amigo que se cadastrar pelo seu link te dá *+${BONUS_PER_REFERRAL} slot extra* (máx +${MAX_BONUS_SLOTS}).`,
    '',
    `📊 Indicações: *${refs}*`,
    `🎁 Bônus atual: *+${bonus}* slots`,
    `📦 Seu limite total: *${limitDisplay}* produtos`,
    '',
    '🔗 *Seu link de indicação* (toque pra copiar):',
    `\`${refLink}\``,
    '',
    '💡 _Dica: copie e mande no zap, no story, num grupo de família. Cada cadastro vira 1 slot novo pra você._',
  ].join('\n'));
});

// ── /lojas ───────────────────────────────────────────────────────────────────
bot.onText(/^\/lojas\b/, async (msg) => {
  await reply(msg, SUPPORTED_LIST);
});

// Notifica admin no privado quando alguém falha ao cadastrar produto.
// Inclui motivo + URL + quem tentou, pra você decidir se vale arrumar.
async function notifyAddProductFailure(msg, url, reason, details = '') {
  if (!TELEGRAM_ADMIN_USER_ID) return;
  const userId = String(msg.from.id);
  const username = msg.from.username || msg.from.first_name || 'desconhecido';
  const lines = [
    `⚠️ */addproduto falhou*`,
    ``,
    `👤 @${username} (\`${userId}\`)`,
    `❌ Motivo: *${reason}*`,
    `🔗 ${url}`,
  ];
  if (details) lines.push('', `_${details}_`);
  sendAdminMessage(lines.join('\n')).catch(() => {});
}

// ── /addproduto <url> ────────────────────────────────────────────────────────
bot.onText(/^\/addproduto\s+(.+)$/, async (msg, match) => {
  let url = match[1].trim();
  const userId = String(msg.from.id);
  const username = msg.from.username || msg.from.first_name || 'desconhecido';

  // Valida URL
  try { new URL(url); } catch {
    notifyAddProductFailure(msg, url, 'URL inválida', 'String enviada não é uma URL válida');
    return reply(msg, '❌ URL inválida. Envie a URL completa do produto (com `https://...`).\n\nExemplo: `/addproduto https://amazon.com.br/dp/B0XYZ`');
  }

  // Resolve encurtadores (a.co, amzn.to, amzn.eu) e limpa tracking
  try {
    const norm = await normalizeUrl(url);
    if (norm.wasShort) {
      url = norm.url;
      console.log(`[Bot] URL encurtada expandida → ${url}`);
    }
  } catch (err) {
    console.warn('[Bot] normalizeUrl falhou:', err.message);
  }

  // Loja suportada?
  const route = detectStore(url);
  if (!route) {
    let hostname = '';
    try { hostname = new URL(url).hostname; } catch {}
    notifyAddProductFailure(msg, url, 'Loja não suportada', `Hostname: ${hostname}`);
    return reply(msg,
      `❌ *Loja não suportada.*\n\nA loja \`${hostname}\` ainda não tem scraper.\n\n${SUPPORTED_LIST}\n\n` +
      `💡 *Quer que eu adicione essa loja?* Manda como sugestão:\n\`/sugerir ${url}\`\n\nEu avalio e adiciono se possível.`
    );
  }

  // URL de página de produto (não busca/categoria)?
  if (!isLikelyProductUrl(url)) {
    notifyAddProductFailure(msg, url, 'URL de busca/categoria (não produto)', `Loja: ${route.label}`);
    return reply(msg,
      `❌ *Essa URL parece ser de busca, categoria ou listagem.*\n\nPreciso da URL específica de *um* produto, não de uma lista.\n\n` +
      `💡 *Como pegar a URL certa:*\n` +
      `1. Abra o produto no site da ${route.label}\n` +
      `2. Copie o link da barra do navegador\n` +
      `3. Cola aqui com \`/addproduto <link>\``
    );
  }

  // OPCIONAL: produto JÁ monitorado pelo bot? Vira watcher (não cobra slot)
  const existing = await findActiveProductByUrl(url);
  if (existing) {
    if (await isWatching(existing.id, userId)) {
      return reply(msg, `ℹ️ Você *já está monitorando* esse produto.\n\n📦 ${existing.name}\n\nVai receber alertas no privado.`);
    }
    try {
      await addWatcher(existing.id, userId, username);
      return reply(msg,
        `✅ *Você agora monitora esse produto!*\n\n📦 ${existing.name}\n🏪 ${existing.store.toUpperCase()}\n\n` +
        `_Sempre que houver uma queda ou notificação, vou te avisar aqui no privado._\n\n` +
        `_Esse produto já é monitorado pelo canal — não conta no seu limite de slots._`
      );
    } catch (err) {
      return reply(msg, `❌ Erro ao registrar: ${err.message}`);
    }
  }

  // Produto NOVO — agora sim valida limite (admin/premium passa direto)
  if (!isPremium(msg)) {
    const [count, limit] = await Promise.all([
      countProductsByUser(userId),
      getUserLimit(userId),
    ]);
    if (count >= limit.total) {
      const refLink = `https://t.me/${BOT_USERNAME}?start=ref_${userId}`;
      return reply(msg,
        `❌ Você já tem ${count} produtos cadastrados (limite atual: ${limit.total}).\n\n` +
        `🤝 *Ganhe +${BONUS_PER_REFERRAL} slot por amigo indicado:*\n\`${refLink}\`\n\n` +
        '✨ Ou peça acesso premium no privado.\n' +
        '🗑 Ou remova um antigo: `/meusprodutos` → `/removerproduto <id>`'
      );
    }
  }

  await reply(msg, '⏳ Buscando preço...');

  let result;
  try {
    result = await getPrice(url);
  } catch (err) {
    notifyAddProductFailure(msg, url, 'Erro ao consultar loja (exception)', `${route.label}: ${err.message}`);
    return reply(msg, `❌ *Erro ao consultar a loja ${route.label}.*\n\nPode ser bloqueio temporário ou produto fora do ar. Tenta de novo em alguns minutos.\n\nSe persistir: \`/sugerir ${url}\``);
  }

  if (!result) {
    // Caso especial: Amazon bloqueia IP do servidor há tempos, é problema conhecido
    if (route.store === 'amazon') {
      notifyAddProductFailure(msg, url, '🤖 Amazon anti-bot (bloqueia IP do servidor)', `Cadastrar manualmente. URL: ${url}`);
      return reply(msg,
        `⚠️ *A Amazon está bloqueando o servidor temporariamente.*\n\n` +
        `Isso é um problema conhecido — a Amazon detecta o IP do bot e nega o acesso. Estou trabalhando pra resolver (aguardando liberação da API oficial).\n\n` +
        `📝 *Sua solicitação foi registrada com o admin.* Em breve esse produto será adicionado manualmente.\n\n` +
        `_Enquanto isso, você pode cadastrar produtos de outras lojas: \`/lojas\` pra ver a lista._`
      );
    }
    notifyAddProductFailure(msg, url, 'Scraper retornou null', `Loja: ${route.label}. Possíveis causas: anti-bot, produto indisponível, HTML mudou.`);
    return reply(msg,
      `❌ *Não consegui extrair o preço.*\n\nMotivos possíveis:\n` +
      `• Produto indisponível na ${route.label}\n` +
      `• Bloqueio temporário do site\n` +
      `• URL apontando pra página errada\n\n` +
      `💡 Confere se o produto está disponível abrindo o link no navegador. Se estiver, manda como sugestão pra eu investigar:\n\`/sugerir ${url}\``
    );
  }

  const { price, name: scrapedName } = result;

  if (typeof price !== 'number' || isNaN(price) || price <= 0) {
    notifyAddProductFailure(msg, url, 'Preço inválido extraído', `Loja: ${route.label}, raw: ${JSON.stringify(price)}`);
    return reply(msg, `❌ *Preço inválido retornado.*\n\nO scraper achou um número mas ele não faz sentido (${price}). Pode ser bug do parser ou produto sem preço (esgotado).\n\nTenta outra URL ou: \`/sugerir ${url}\``);
  }
  if (!scrapedName || scrapedName.length < 5) {
    notifyAddProductFailure(msg, url, 'Nome do produto não extraído', `Loja: ${route.label}, scraped: "${scrapedName}"`);
    return reply(msg, `❌ *Não consegui ler o nome do produto.*\n\nA URL pode ser de uma página errada (busca, categoria) — preciso da URL específica do produto na ${route.label}.`);
  }

  const name = scrapedName;

  try {
    const { id, status } = await addProduct(name, url, route.store, {
      addedByTelegramId: userId,
      addedByUsername: username,
    });

    // Registra também como watcher pra receber DM
    if (status !== 'already_active') {
      await addWatcher(id, userId, username).catch(() => {});
    }

    if (status === 'already_active') {
      // Race condition raríssima: outro user adicionou entre findActiveProductByUrl e addProduct
      await addWatcher(id, userId, username).catch(() => {});
      return reply(msg,
        `ℹ️ Esse produto já estava sendo monitorado. Adicionei você como watcher — vai receber alertas no privado.\n\n🆔 \`${id}\``
      );
    }

    const header = status === 'reactivated'
      ? `♻️ *Produto reativado!*`
      : `✅ *Adicionado!*`;

    await reply(msg,
      `${header}\n\n📦 ${name}\n🏪 ${route.label}\n💰 Preço atual: *${fmtPrice(price)}*\n\n` +
      `🆔 \`${id}\`\n\n_Vou alertar você no privado quando o preço cair._`
    );

    // Notifica admin no privado sobre o novo produto cadastrado
    sendAdminMessage([
      `📥 *Novo produto cadastrado*`,
      ``,
      `👤 @${username} (\`${userId}\`)`,
      `📦 ${name}`,
      `🏪 ${route.label}`,
      `💰 ${fmtPrice(price)}`,
      `🔗 ${url}`,
    ].join('\n')).catch(() => {});
  } catch (err) {
    await reply(msg, `❌ Erro ao salvar: ${err.message}`);
  }
});

// ── /meusprodutos ────────────────────────────────────────────────────────────
bot.onText(/^\/meusprodutos\b/, async (msg) => {
  const userId = String(msg.from.id);
  const [cadastrados, monitorados] = await Promise.all([
    getProductsByUser(userId),       // produtos que o user adicionou (conta no limite)
    getWatchedProducts(userId),      // produtos que o user só observa (NÃO conta no limite)
  ]);

  // Tira os cadastrados da lista de monitorados (evita duplicar — addproduto registra os dois)
  const cadastradosIds = new Set(cadastrados.map((p) => p.id));
  const apenasObservados = monitorados.filter((p) => !cadastradosIds.has(p.id));

  if (!cadastrados.length && !apenasObservados.length) {
    return reply(msg,
      'Você ainda não tem produtos.\n\n' +
      'Use `/addproduto <link>` pra cadastrar, ou clique em *💎 Monitorar produto* nos cards do canal pra acompanhar produtos que já estão no bot.'
    );
  }

  let limitInfo;
  if (isPremium(msg)) {
    limitInfo = '✨ premium (sem limite)';
  } else {
    const limit = await getUserLimit(userId);
    const bonusTag = limit.bonus > 0 ? ` (+${limit.bonus} bônus 🤝)` : '';
    limitInfo = `${cadastrados.length}/${limit.total} cadastrados${bonusTag}`;
  }

  const blocks = [`📋 *Seus produtos* (${limitInfo})`, ''];

  if (cadastrados.length) {
    blocks.push('🆕 *Cadastrados por você* _(contam no limite)_');
    blocks.push(...cadastrados.map((p) => `• *${p.name}*\n  🏪 ${p.store}  •  🆔 \`${p.id}\``));
    blocks.push('');
  }
  if (apenasObservados.length) {
    blocks.push(`👀 *Monitorando do canal* _(${apenasObservados.length} produtos — não contam no limite)_`);
    blocks.push(...apenasObservados.map((p) => `• *${p.name}*\n  🏪 ${p.store}  •  🆔 \`${p.id}\``));
  }

  await reply(msg, blocks.join('\n\n'));
});

// ── /removerproduto <uuid> ───────────────────────────────────────────────────
// Sempre remove o watcher do user. Se o user for admin ou o cadastrador
// original, também DESATIVA o produto (afeta todos os watchers).
bot.onText(/^\/removerproduto\s+(\S+)/, async (msg, match) => {
  const productId = match[1].trim();
  const userId = String(msg.from.id);
  const admin = isAdmin(msg);

  try {
    // Tira o user dos watchers (sempre — idempotente)
    await removeWatcher(productId, userId).catch(() => {});

    if (admin) {
      await deactivateProduct(productId);
      return reply(msg, '✅ Produto *desativado para todos* (admin).\nNinguém mais receberá alertas.');
    }

    const owned = await findProductByIdAndUser(productId, userId);
    if (owned) {
      await deactivateProduct(productId);
      return reply(msg, '✅ Produto desativado. Você cadastrou esse — slot liberado.');
    }

    // Era só observador
    await reply(msg, '✅ Você parou de monitorar esse produto. Vai continuar no canal pra outros.');
  } catch (err) {
    await reply(msg, `❌ Erro: ${err.message}`);
  }
});

// ── /sugerir <url> ───────────────────────────────────────────────────────────
bot.onText(/^\/sugerir\s+(.+)$/, async (msg, match) => {
  const raw = match[1].trim();
  const userId = String(msg.from.id);
  const username = msg.from.username || msg.from.first_name || 'desconhecido';

  // Aceita URL + nota opcional separada por espaço
  const [url, ...noteParts] = raw.split(/\s+/);
  const note = noteParts.join(' ').trim() || null;

  try { new URL(url); } catch {
    return reply(msg, '❌ URL inválida.\n\nUso: `/sugerir <link> [comentário opcional]`');
  }

  try {
    const { id, status } = await addSuggestion(userId, username, url, note);
    if (status === 'duplicate') {
      return reply(msg, '⏳ Sua sugestão está em análise, será implementado em breve.');
    }
    await reply(msg, `✅ Sugestão registrada!\n🆔 \`${id}\`\n\nVou avaliar e te aviso se for adicionada.`);
  } catch (err) {
    await reply(msg, `❌ Erro: ${err.message}`);
  }
});

// ── ADMIN: /listarprodutos ───────────────────────────────────────────────────
bot.onText(/^\/listarprodutos\b/, async (msg) => {
  if (!isAdmin(msg)) return;
  const products = await getActiveProducts();
  if (!products.length) return reply(msg, 'Nenhum produto ativo.');

  const lines = products.map((p) => {
    const by = p.added_by_username ? ` • por @${p.added_by_username}` : '';
    return `• *${p.name}*\n  🏪 ${p.store}${by}\n  🆔 \`${p.id}\``;
  });

  let block = `📋 *${products.length} produtos ativos:*\n\n`;
  for (const line of lines) {
    if ((block + line + '\n\n').length > 3800) {
      await reply(msg, block);
      block = '';
    }
    block += line + '\n\n';
  }
  if (block.trim()) await reply(msg, block);
});

// ── ADMIN: /cupom [run] ──────────────────────────────────────────────────────
// Cupons MANUAIS (src/manualCoupons.js). Sem arg: mostra os cupons configurados,
// validade e se os produtos têm URL canônica. "run": cadastra + posta 1 no grupo.
bot.onText(/^\/cupom(?:\s+(run))?\b/, async (msg, match) => {
  if (!isAdmin(msg)) return;
  const doRun = match[1] === 'run';
  try {
    if (doRun) {
      await reply(msg, '⏳ Rodando cupons manuais (cadastra + posta)...');
      const { runCouponDeals } = require('./couponDeals');
      const r = await runCouponDeals({ force: false });
      return reply(msg, `✅ *Rodada de cupons concluída*\n\n📥 Cadastrados: ${r.registered}\n📤 Postados: ${r.posted}\n🎯 Candidatos: ${r.candidates}`);
    }
    // Preview da config
    const { getAllCoupons, isCouponValid, hasRealUrl } = require('./manualCoupons');
    const coupons = getAllCoupons();
    if (!coupons.length) return reply(msg, '⚠️ Nenhum cupom manual configurado em `src/manualCoupons.js`.');
    const blocks = coupons.map((c) => {
      const valid = isCouponValid(c) ? '✅ válido' : '⛔ vencido';
      const prods = c.products.map((p) => `  ${hasRealUrl(p) ? '✅' : '⚠️ falta URL'} ${p.name.slice(0, 40)}`).join('\n');
      return `🎟️ \`${c.code}\` — ${valid} (vence ${c.expiresAt})\n${prods}`;
    });
    const pend = coupons.some((c) => c.products.some((p) => !hasRealUrl(p)));
    await reply(msg,
      `📋 *Cupons manuais configurados:*\n\n${blocks.join('\n\n')}` +
      (pend ? `\n\n⚠️ _Tem produto sem URL canônica — me manda a URL normal do ML (.../p/MLB...) que eu preencho._` : `\n\n_Pra cadastrar + postar 1: \`/cupom run\`_`)
    );
  } catch (err) {
    await reply(msg, `❌ Erro: ${err.message}`);
  }
});

// ── ADMIN: /ofertas_ml [run] ─────────────────────────────────────────────────
// Sem arg: PREVIEW (raspa a vitrine e mostra o que faria, sem cadastrar/postar).
// "run": executa de verdade (auto-cadastra + posta nas categorias-foco).
bot.onText(/^\/ofertas_ml(?:\s+(run))?\b/, async (msg, match) => {
  if (!isAdmin(msg)) return;
  const doRun = match[1] === 'run';
  await reply(msg, doRun ? '⏳ Rodando ofertas ML (cadastra + posta)...' : '⏳ Buscando ofertas ML (preview, não posta)...');
  try {
    if (doRun) {
      const { runMlDeals } = require('./mlDeals');
      const r = await runMlDeals({ force: false });
      if (r.error) return reply(msg, `❌ Falha no scrape: ${r.error}`);
      return reply(msg, `✅ *Rodada ML concluída*\n\n📥 Cadastrados: ${r.registered}\n📤 Postados: ${r.posted}\n🎯 Candidatas: ${r.candidates}`);
    }
    // Preview
    const { scrapeOfertas } = require('./scrapers/mlOfertas');
    const { inferCategory } = require('./utils/inferCategory');
    const FOCUS = new Set(['eletronicos','casa','hardware','beleza','calcados','vestuario','smartphones','acessorios','audio','perfumaria']);
    const { items, error, cardsFound, couponsFound } = await scrapeOfertas({ minDiscount: 0, limit: 60 });
    if (error) return reply(msg, `❌ Falha no scrape: ${error}`);
    if (!items.length) return reply(msg, `⚠️ 0 ofertas parseadas (${cardsFound} cards). ML pode ter mudado o HTML.`);
    const top = items
      .map((it) => ({ ...it, cat: inferCategory(it.name) }))
      .filter((it) => it.discountPct != null && it.discountPct >= 40 && FOCUS.has(it.cat))
      .sort((a, b) => b.discountPct - a.discountPct)
      .slice(0, 12);
    const cupTxt = (c) => c ? (c.type === 'pct' ? ` 🎟️${c.value}%` : ` 🎟️+${fmtPrice(c.value)}`) : '';
    if (!top.length) {
      return reply(msg, `🔎 *Preview ofertas ML*\n${items.length} ofertas, ${cardsFound} cards, ${couponsFound} c/ cupom.\n\n⚠️ Nenhuma ≥40% OFF nas categorias-foco agora — *não postaria nada* nesta rodada.`);
    }
    const lines = top.map((it) => {
      const de = it.originalPrice ? `de ${fmtPrice(it.originalPrice)} ` : '';
      return `*${it.discountPct}% OFF*${cupTxt(it.coupon)} — ${de}por *${fmtPrice(it.price)}*\n[${it.cat}] ${it.name.slice(0, 46)}`;
    });
    await reply(msg,
      `🔎 *Preview ofertas ML* (${items.length} ofertas, ${couponsFound} c/ cupom)\n\n` +
      lines.join('\n\n') +
      `\n\n_Executar de verdade: \`/ofertas_ml run\`_`
    );
  } catch (err) {
    await reply(msg, `❌ Erro: ${err.message}`);
  }
});

// ── ADMIN: apagar posts do bot no grupo ──────────────────────────────────────
// O bot grava o message_id de cada post (tabela posted_messages). Dois modos:
//  1) Responder a uma mensagem do bot no grupo com /apagar → apaga aquela.
//  2) /apagar_ultimos N → apaga os N últimos posts (default 1, máx 10).
// Requer que o bot seja ADMIN do grupo (permissão de apagar mensagens).
async function deleteOneMessage(chatId, messageId) {
  try {
    await bot.deleteMessage(String(chatId), messageId);
    return true;
  } catch (err) {
    // 'message to delete not found' / 'message can't be deleted' → trata como já-ido
    console.warn('[apagar] deleteMessage falhou:', err.message);
    return false;
  }
}

bot.onText(/^\/apagar\b/, async (msg) => {
  if (!isAdmin(msg)) return;
  const reply_to = msg.reply_to_message;
  if (!reply_to) {
    return reply(msg, 'ℹ️ *Como apagar:*\n\n1. No grupo, *responda* à mensagem do bot que quer apagar e mande `/apagar`\n2. Ou use `/apagar_ultimos N` pra apagar os N últimos posts.');
  }
  const chatId = msg.chat.id;
  const messageId = reply_to.message_id;
  const ok = await deleteOneMessage(chatId, messageId);
  // limpa o registro (se existir) e a própria mensagem do comando
  const recs = await findPostedByMessageId(messageId).catch(() => []);
  for (const r of recs) await deletePostedMessageRecord(r.id).catch(() => {});
  await deleteOneMessage(chatId, msg.message_id).catch(() => {});
  if (!ok) await reply(msg, '⚠️ Não consegui apagar (mensagem antiga demais ou o bot não é admin do grupo).');
});

bot.onText(/^\/apagar_ultimos(?:\s+(\d+))?\b/, async (msg, match) => {
  if (!isAdmin(msg)) return;
  const n = Math.min(parseInt(match[1] || '1', 10), 10);
  const recs = await getRecentPostedMessages(n);
  if (!recs.length) {
    return reply(msg, '⚠️ Nenhum post registrado pra apagar. (Só funciona pros posts feitos APÓS esta atualização.)');
  }
  let apagados = 0;
  for (const r of recs) {
    const ok = await deleteOneMessage(r.chat_id, r.message_id);
    if (ok) apagados++;
    await deletePostedMessageRecord(r.id).catch(() => {});
  }
  await reply(msg, `🗑 *${apagados}/${recs.length}* post(s) apagado(s).` + (apagados < recs.length ? '\n\n_Alguns podem ser antigos demais ou o bot não é admin do grupo._' : ''));
});

// ── ADMIN: /test_ml_link ─────────────────────────────────────────────────────
bot.onText(/^\/test_ml_link\s+(.+)$/, async (msg, match) => {
  if (!isAdmin(msg)) return;
  const rawUrl = match[1].trim();
  await reply(msg, '⏳ Testando link ML...');
  try {
    const { getMLShortUrl } = require('../utils/mlShortUrl');
    const shortUrl = await getMLShortUrl(rawUrl);
    const lines = [
      '✅ *Link testado:*',
      '',
      `📍 Original:`,
      `\`${rawUrl}\``,
      '',
      `🔗 Short URL (com ref):`,
      `\`${shortUrl}\``,
      '',
      shortUrl.includes('meli.la') ? '✅ API funcionando (meli.la)' : '⚠️ Fallback (API cair ou URL com ref)',
    ];
    await reply(msg, lines.join('\n'));
  } catch (err) {
    await reply(msg, `❌ Erro: ${err.message}`);
  }
});

// ── ADMIN: /topsemana_debug ──────────────────────────────────────────────────
bot.onText(/^\/topsemana_debug\b/, async (msg) => {
  if (!isAdmin(msg)) return;
  await reply(msg, '⏳ Analisando drops da semana...');
  try {
    const { getWeeklyTopDrops } = require('./db/queries');
    const drops = await getWeeklyTopDrops(10);
    if (!drops.length) {
      await reply(msg, '❌ Nenhum drop encontrado');
      return;
    }
    const lines = ['📊 *DEBUG: TOP DROPS BRUTO DO BANCO*', ''];
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      const fmt = (p) => (p || 0).toFixed(2);
      lines.push(`${i+1}\\. ${d.product.name.slice(0,40)}`);
      lines.push(`   weekStartPrice: R\\$ ${fmt(d.weekStartPrice)}`);
      lines.push(`   currentPrice: R\\$ ${fmt(d.currentPrice)}`);
      lines.push(`   dropPct: ${fmt(d.dropPct)}%`);
      lines.push(`   calc: (${fmt(d.weekStartPrice)} \\- ${fmt(d.currentPrice)}) / ${fmt(d.weekStartPrice)} \\* 100 = ${fmt((d.weekStartPrice - d.currentPrice) / d.weekStartPrice * 100)}%`);
      lines.push('');
    }
    await reply(msg, lines.join('\n'));
  } catch (err) {
    await reply(msg, `❌ Erro: ${err.message}`);
  }
});

// ── ADMIN: /recomendar ───────────────────────────────────────────────────────
bot.onText(/^\/recomendar\b/, async (msg) => {
  if (!isAdmin(msg)) return;
  await reply(msg, '⏳ Disparando recomendações personalizadas pra todos os watchers...');
  try {
    const { runPersonalRecommendations } = require('./personalRecommendations');
    await runPersonalRecommendations();
    await reply(msg, '✅ Concluído. Veja o log pra detalhes.');
  } catch (err) {
    await reply(msg, `❌ Erro: ${err.message}`);
  }
});

// ── ADMIN: /topsemana ────────────────────────────────────────────────────────
bot.onText(/^\/topsemana\b/, async (msg) => {
  if (!isAdmin(msg)) return;
  await reply(msg, '⏳ Montando TOP da semana...');
  try {
    const { runWeeklyTop } = require('./weeklyTop');
    await runWeeklyTop();
    await reply(msg, '✅ TOP semanal postado (se houve quedas relevantes).');
  } catch (err) {
    await reply(msg, `❌ Erro: ${err.message}`);
  }
});

// ── ADMIN: /postarcupons ─────────────────────────────────────────────────────
bot.onText(/^\/postarcupons\b/, async (msg) => {
  if (!isAdmin(msg)) return;
  await reply(msg, '⏳ Varrendo cupons da KaBuM... (pode levar 1-2 min)');
  try {
    const { runKabumCupons } = require('./kabumCupons');
    const r = await runKabumCupons();
    if (r.error) {
      await reply(msg, `❌ Erro: ${r.error}`);
    } else {
      await reply(msg, `✅ ${r.posted} produto(s) postado(s) no canal.\n${r.candidatos || 0} válidos de ${r.cupons || 0} cupom(ns).`);
    }
  } catch (err) {
    await reply(msg, `❌ Erro: ${err.message}`);
  }
});

// ── ADMIN: /indisponiveis ────────────────────────────────────────────────────
bot.onText(/^\/indisponiveis\b/, async (msg) => {
  if (!isAdmin(msg)) return;

  await reply(msg, '⏳ Buscando produtos indisponíveis... (pode demorar uns segundos)');

  const list = await getUnavailableProducts();
  if (!list.length) {
    return reply(msg, '✅ Nenhum produto em backoff. Tudo disponível.');
  }

  const fmtTime = (start) => {
    const ms = Date.now() - new Date(start).getTime();
    const h = ms / 3600000;
    if (h < 24) return `${h.toFixed(1)}h`;
    return `${(h / 24).toFixed(1)}d`;
  };

  const lines = list.map((p) =>
    `• *${p.name}*\n` +
    `  🏪 ${p.store} · 🕒 há ${fmtTime(p.streakStart)} (${p.unavailableCount}x)\n` +
    `  ${p.url}\n` +
    `  🆔 \`${p.id}\``
  );

  let block = `🧟 *${list.length} produto(s) em backoff:*\n\n`;
  for (const line of lines) {
    if ((block + line + '\n\n').length > 3800) {
      await bot.sendMessage(msg.chat.id, block, { parse_mode: 'Markdown', disable_web_page_preview: true });
      block = '';
    }
    block += line + '\n\n';
  }
  if (block.trim()) {
    await bot.sendMessage(msg.chat.id, block, { parse_mode: 'Markdown', disable_web_page_preview: true });
  }
});

// ── ADMIN: /sugestoes ────────────────────────────────────────────────────────
bot.onText(/^\/sugestoes\b/, async (msg) => {
  if (!isAdmin(msg)) return;
  const sugs = await getPendingSuggestions();
  if (!sugs.length) return reply(msg, 'Nenhuma sugestão pendente.');

  const lines = sugs.map((s) => {
    const noteLine = s.note ? `\n  💬 ${s.note}` : '';
    return `🆔 \`${s.id}\`\n  👤 @${s.username || s.telegram_id}\n  🔗 ${s.url}${noteLine}`;
  });
  await reply(msg, `📨 *${sugs.length} sugestões pendentes:*\n\n${lines.join('\n\n')}`);
});

// ── ADMIN: /aprovarsugestao <id> | /rejeitarsugestao <id> ────────────────────
bot.onText(/^\/(aprovar|rejeitar)sugestao\s+(\S+)/, async (msg, match) => {
  if (!isAdmin(msg)) return;
  const action = match[1];
  const id = match[2].trim();
  try {
    await updateSuggestionStatus(id, action === 'aprovar' ? 'approved' : 'rejected');
    await reply(msg, `✅ Sugestão ${action === 'aprovar' ? 'aprovada' : 'rejeitada'}.`);
  } catch (err) {
    await reply(msg, `❌ Erro: ${err.message}`);
  }
});

// ── Callback queries (botões inline tipo "💎 Monitorar produto") ────────────
bot.on('callback_query', async (cb) => {
  const data = cb.data || '';
  const userId = String(cb.from.id);
  const username = cb.from.username || cb.from.first_name || 'desconhecido';

  // watch:<productId> → registra o user como watcher do produto
  if (data.startsWith('watch:')) {
    const productId = data.slice(6);
    try {
      const already = await isWatching(productId, userId);
      if (already) {
        await bot.answerCallbackQuery(cb.id, { text: 'Você já monitora esse produto', show_alert: false });
        return;
      }
      const r = await addWatcher(productId, userId, username);
      if (r.status === 'already_watching') {
        await bot.answerCallbackQuery(cb.id, { text: 'Você já monitora esse produto', show_alert: false });
        return;
      }
      await bot.answerCallbackQuery(cb.id, { text: '✅ Monitorando! Você receberá alertas no privado', show_alert: true });
      // DM de confirmação (best effort — falha se o user nunca abriu o bot)
      bot.sendMessage(userId, [
        `💎 *Você agora monitora um produto!*`,
        ``,
        `Sempre que houver alerta desse produto, vou te avisar aqui no privado.`,
        ``,
        `Veja todos os seus monitorados com \`/meusprodutos\`.`,
      ].join('\n'), { parse_mode: 'Markdown' }).catch(() => {});
    } catch (err) {
      console.error('[callback watch] erro:', err.message);
      await bot.answerCallbackQuery(cb.id, { text: '❌ Erro ao registrar. Tente abrir o bot no privado primeiro.', show_alert: true });
    }
    return;
  }

  // share:<productId> → gera link de share com ref do user e manda no DM dele
  if (data.startsWith('share:')) {
    const productId = data.slice(6);
    try {
      const { data: p } = await supabase.from('products').select('name, url').eq('id', productId).single();
      if (!p) {
        await bot.answerCallbackQuery(cb.id, { text: '❌ Produto não encontrado', show_alert: false });
        return;
      }
      const shareText = buildShareMessage({ name: p.name, url: p.url, referrerId: userId });
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(p.url)}&text=${encodeURIComponent(shareText)}`;
      await bot.answerCallbackQuery(cb.id, { text: '📩 Mandei o link no seu privado', show_alert: false });
      bot.sendMessage(userId, [
        `📤 *Compartilhar com seu link de indicação*`,
        ``,
        `Toque no botão abaixo pra compartilhar. Cada amigo que se cadastrar pelo seu link te dá *+1 slot extra*!`,
      ].join('\n'), {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '📤 Compartilhar agora', url: shareUrl }]],
        },
      }).catch(() => {});
    } catch (err) {
      console.error('[callback share] erro:', err.message);
      await bot.answerCallbackQuery(cb.id, { text: '❌ Erro. Tente abrir o bot no privado primeiro.', show_alert: true });
    }
    return;
  }

  // unwatch:<productId> → remove watcher (usado em DMs)
  if (data.startsWith('unwatch:')) {
    const productId = data.slice(8);
    try {
      await removeWatcher(productId, userId);
      await bot.answerCallbackQuery(cb.id, { text: '🗑 Parou de monitorar esse produto', show_alert: false });
    } catch (err) {
      await bot.answerCallbackQuery(cb.id, { text: '❌ Erro', show_alert: false });
    }
    return;
  }

  await bot.answerCallbackQuery(cb.id, { text: '' }).catch(() => {});
});

// ── ADMIN: /stats ────────────────────────────────────────────────────────────
bot.onText(/^\/stats\b/, async (msg) => {
  if (!isAdmin(msg)) return;
  const s = await getAdminStats();
  let members = '?';
  if (process.env.TELEGRAM_GROUP_ID) {
    // chat_id supergroup vem como string com "-100..."; alguns clientes
    // do node-telegram-bot-api preferem número. Converte se for numérico.
    let chatId = process.env.TELEGRAM_GROUP_ID;
    const asNum = parseInt(chatId, 10);
    if (!isNaN(asNum) && String(asNum) === chatId) chatId = asNum;
    const fn = bot.getChatMemberCount || bot.getChatMembersCount;
    if (fn) {
      try { members = await fn.call(bot, chatId); }
      catch (err) {
        console.warn('[stats] count falhou:', err?.response?.body?.description || err?.message);
      }
    }
  }
  const cats = s.alertsByCategory7d.map((r) => `• ${r.category || '(sem cat)'}: ${r.n}`).join('\n') || '• _nenhum_';
  const users = s.topUsers.map((r) => `• @${r.added_by_username || r.added_by_telegram_id}: ${r.n}`).join('\n') || '• _nenhum_';

  await reply(msg, [
    `📊 *STATS — ${new Date().toLocaleDateString('pt-BR')}*`,
    ``,
    `👥 Grupo: *${members}* membros`,
    `📦 Catálogo: *${s.totalProducts}* produtos ativos`,
    `🔔 Alertas (24h): *${s.alerts24h}*`,
    ``,
    `🏪 *Alertas por categoria (7d):*`,
    cats,
    ``,
    `👤 *Top users (cadastros):*`,
    users,
    ``,
    `💎 Watchers: *${s.totalWatchers}* (de *${s.uniqueWatchers}* users)`,
  ].join('\n'));
});

// ── ADMIN: /health ───────────────────────────────────────────────────────────
bot.onText(/^\/health\b/, async (msg) => {
  if (!isAdmin(msg)) return;
  try {
    const h = await getHealthChecks();
    const minutesAgo = h.lastScanAt ? Math.floor((Date.now() - new Date(h.lastScanAt).getTime()) / 60000) : '?';

    // Testa ML token
    let mlOk = false;
    try {
      const r = await axios.post('https://api.mercadolibre.com/oauth/token',
        new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.ML_APP_ID, client_secret: process.env.ML_CLIENT_SECRET }),
        { timeout: 5000 });
      mlOk = !!r.data?.access_token;
    } catch {}

    // Testa Telegram
    let tgOk = false;
    try { tgOk = !!(await bot.getMe()); } catch {}

    await reply(msg, [
      `🏥 *SISTEMA*`,
      ``,
      `⏱️ Última varredura: *há ${minutesAgo} min*`,
      `${mlOk ? '✅' : '❌'} ML API: *${mlOk ? 'OK' : 'token inválido'}*`,
      `${tgOk ? '✅' : '❌'} Telegram: *${tgOk ? 'respondendo' : 'offline'}*`,
      `💾 DB latency: *${h.dbLatency}ms*`,
      ``,
      `📦 Produtos em backoff: *${h.productsInBackoff}*`,
      `🚨 Scans falhos (24h): *${h.failedScans24h}*`,
      ``,
      `🤖 *Amazon (24h):*`,
      `   ✅ OK: ${h.amazonOk24h}`,
      `   ❌ Falha: ${h.amazonFail24h} (${h.amazonFailPct24h}%)`,
      h.amazonFailPct24h > 50 ? `\n   ⚠️ Alta taxa de falha — provável bloqueio anti-bot` : '',
    ].filter(Boolean).join('\n'));
  } catch (err) {
    await reply(msg, `❌ Erro: ${err.message}`);
  }
});

// ── ADMIN: /buscar <nome> ────────────────────────────────────────────────────
bot.onText(/^\/buscar\s+(.+)$/, async (msg, match) => {
  if (!isAdmin(msg)) return;
  const q = match[1].trim();
  try {
    const results = await searchProducts(q, 15);
    if (!results.length) return reply(msg, `🔍 Nenhum produto encontrado pra _${q}_`);
    const lines = results.map((r) => `${r.active ? '✅' : '⛔'} \`${r.id.slice(0,8)}\` ${r.name.slice(0,55)} (${r.store})`);
    await reply(msg, `🔍 *${results.length} produto(s) pra "${q}"*\n\n${lines.join('\n')}`);
  } catch (err) {
    await reply(msg, `❌ Erro: ${err.message}`);
  }
});

// ── /preco <id> ──────────────────────────────────────────────────────────────
bot.onText(/^\/pre[cç]o\s+(\S+)/, async (msg, match) => {
  const productId = match[1].trim().toLowerCase();
  try {
    // Aceita ID completo ou primeiros 8 chars
    let resolvedId = productId;
    if (productId.length < 36) {
      const matches = await searchProducts('', 1000); // pega tudo, vai filtrar
      const found = matches.find((p) => p.id.startsWith(productId));
      if (!found) return reply(msg, `❌ Produto não encontrado. Use o ID completo ou os primeiros 8 chars.`);
      resolvedId = found.id;
    }
    const s = await getProductPriceStats(resolvedId);
    if (!s || !s.current_price) return reply(msg, `❌ Produto sem histórico de preço.`);

    const fmt = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const minAtDays = s.min_at ? Math.floor((Date.now() - new Date(s.min_at).getTime()) / 86400000) : '?';
    const atMin = Math.abs(s.current_price - s.min_price) / s.min_price < 0.02;

    await reply(msg, [
      `📊 *${s.name}*`,
      `🏪 ${s.store?.toUpperCase()}`,
      ``,
      `💰 *Agora: ${fmt(s.current_price)}*`,
      `🟢 Mínimo: ${fmt(s.min_price)} _(há ${minAtDays} dias)_`,
      `🔴 Máximo: ${fmt(s.max_price)}`,
      `📈 Média 30d: ${fmt(s.avg_30d || s.current_price)}`,
      `📦 Registros: ${s.count}`,
      ``,
      atMin ? `🎯 *Está no MÍNIMO histórico — momento bom de comprar*` : `_Acima do mínimo histórico — espere ou compre se urgente_`,
      ``,
      `🛒 [Ver produto](${s.url})`,
    ].join('\n'), { disable_web_page_preview: true });
  } catch (err) {
    await reply(msg, `❌ Erro: ${err.message}`);
  }
});

// ── /avisar <id> <preço> ─────────────────────────────────────────────────────
bot.onText(/^\/avisar\s+(\S+)\s+([\d.,]+)/, async (msg, match) => {
  const userId = String(msg.from.id);
  const productId = match[1].trim().toLowerCase();
  const targetPrice = parseFloat(match[2].replace(',', '.').replace(/[^\d.]/g, ''));

  if (!targetPrice || targetPrice <= 0) {
    return reply(msg, '❌ Preço inválido. Use: `/avisar <id> <preço>`\nEx: `/avisar abc12345 1500`');
  }

  try {
    // Resolve ID (aceita 8 chars)
    let resolvedId = productId;
    if (productId.length < 36) {
      const matches = await searchProducts('', 1000);
      const found = matches.find((p) => p.id.startsWith(productId));
      if (!found) return reply(msg, `❌ Produto não encontrado.\nVeja seus produtos com \`/meusprodutos\`.`);
      resolvedId = found.id;
    }

    // User precisa estar monitorando o produto
    if (!(await isWatching(resolvedId, userId))) {
      return reply(msg, `❌ Você não está monitorando esse produto.\nUse \`/addproduto <link>\` ou toque em "💎 Monitorar produto" no card primeiro.`);
    }

    const ok = await setWatcherTargetPrice(resolvedId, userId, targetPrice);
    if (!ok) return reply(msg, `❌ Não consegui setar o preço-alvo.`);

    const fmt = targetPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    await reply(msg, [
      `🎯 *Preço-alvo definido!*`,
      ``,
      `Vou te avisar SÓ quando esse produto cair pra *${fmt}* ou menos.`,
      ``,
      `_Pra remover o filtro: \`/avisar ${productId} 999999\` (preço muito alto)._`,
    ].join('\n'));
  } catch (err) {
    await reply(msg, `❌ Erro: ${err.message}`);
  }
});

bot.on('polling_error', (err) => {
  console.warn('[Bot] polling error:', err.code || err.message);
});

// ── Auto-clean do tópico General ─────────────────────────────────────────────
// O General (tópico do sistema) recebe automaticamente notificações tipo
// "X joined the group", "Y changed the photo", etc. Como não dá pra desativar
// essas mensagens no Telegram, o bot deleta elas automaticamente — mantém o
// tópico limpo mesmo que ele esteja sendo usado pra outra coisa.
const AUTO_CLEAN_GENERAL = process.env.AUTO_CLEAN_GENERAL !== 'false';
const CLEAN_GROUP_ID = process.env.TELEGRAM_GROUP_ID;

// Formata nome do user com fallback (first_name + last_name + @username + id)
function formatMember(u) {
  if (!u) return '(desconhecido)';
  const full = [u.first_name, u.last_name].filter(Boolean).join(' ') || '(sem nome)';
  const handle = u.username ? `@${u.username}` : `\`${u.id}\``;
  return `${full} (${handle})`;
}

// Notifica admin quando alguém entra/sai do grupo
async function notifyJoinLeave(msg, action, members) {
  if (!TELEGRAM_ADMIN_USER_ID) return;
  let total = '?';
  const fn = bot.getChatMemberCount || bot.getChatMembersCount;
  if (fn) {
    try { total = await fn.call(bot, msg.chat.id); }
    catch (err) { console.warn('[joinleave] count falhou:', err.message); }
  }
  const lines = [
    action === 'joined' ? `🟢 *Novo membro no grupo*` : `🔴 *Saiu do grupo*`,
    ``,
    ...members.map((m) => `👤 ${formatMember(m)}`),
    ``,
    `👥 Total agora: *${total}* membros`,
  ];
  if (action === 'joined' && msg.from && !members.some((m) => m.id === msg.from.id)) {
    lines.push(`➕ Adicionado por ${formatMember(msg.from)}`);
  }
  sendAdminMessage(lines.join('\n')).catch(() => {});
}

if (AUTO_CLEAN_GENERAL && CLEAN_GROUP_ID) {
  bot.on('message', async (msg) => {
    if (String(msg.chat.id) !== String(CLEAN_GROUP_ID)) return;

    // General no Telegram não tem message_thread_id (ou tem === 1).
    // Tópicos normais que você criou têm thread_id > 1.
    const threadId = msg.message_thread_id;
    const isGeneral = !threadId || threadId === 1;
    if (!isGeneral) return;

    // Detecta service messages
    const isService = !!(
      msg.new_chat_members ||
      msg.left_chat_member ||
      msg.new_chat_title ||
      msg.new_chat_photo ||
      msg.delete_chat_photo ||
      msg.pinned_message ||
      msg.group_chat_created ||
      msg.supergroup_chat_created ||
      msg.channel_chat_created ||
      msg.message_auto_delete_timer_changed ||
      msg.forum_topic_created ||
      msg.forum_topic_edited ||
      msg.forum_topic_closed ||
      msg.forum_topic_reopened ||
      msg.general_forum_topic_hidden ||
      msg.general_forum_topic_unhidden
    );
    if (!isService) return;

    // Antes de deletar, se for join/leave, notifica admin no privado
    if (msg.new_chat_members?.length) {
      notifyJoinLeave(msg, 'joined', msg.new_chat_members);
    } else if (msg.left_chat_member) {
      notifyJoinLeave(msg, 'left', [msg.left_chat_member]);
    }

    try {
      await bot.deleteMessage(msg.chat.id, msg.message_id);
      console.log(`[CleanGeneral] deletou service message ${msg.message_id} do General`);
    } catch (err) {
      // 400 com "message to delete not found" ou "message can't be deleted" — ignora
      console.warn('[CleanGeneral] não consegui deletar:', err.message);
    }
  });
  console.log('[Bot] Auto-clean do General + notificação de join/leave ativados');
}

// Registra a lista de comandos no Telegram (autocomplete ao digitar "/")
const PUBLIC_COMMANDS = [
  { command: 'addproduto',     description: 'Adicionar produto pra monitorar (link da loja)' },
  { command: 'meusprodutos',   description: 'Ver meus produtos cadastrados' },
  { command: 'removerproduto', description: 'Remover um produto seu (use o ID)' },
  { command: 'preco',          description: 'Ver histórico de preço de um produto (use o ID)' },
  { command: 'avisar',         description: 'Definir preço-alvo p/ alerta (ex: /avisar abc123 1500)' },
  { command: 'sugerir',        description: 'Sugerir um produto pro canal' },
  { command: 'convidar',       description: 'Pegar seu link de indicação (+slots por amigo)' },
  { command: 'lojas',          description: 'Ver lojas suportadas' },
  { command: 'ajuda',          description: 'Como usar o bot (versão curta)' },
  { command: 'help',           description: 'Guia completo de uso' },
];

const ADMIN_COMMANDS = [
  ...PUBLIC_COMMANDS,
  { command: 'stats',             description: '[admin] Dashboard com estatísticas' },
  { command: 'health',            description: '[admin] Diagnóstico do sistema' },
  { command: 'buscar',            description: '[admin] Buscar produto por nome' },
  { command: 'listarprodutos',    description: '[admin] Listar todos os produtos ativos' },
  { command: 'indisponiveis',     description: '[admin] Listar produtos em backoff' },
  { command: 'postarcupons',      description: '[admin] Postar cupons KaBuM no canal agora' },
  { command: 'topsemana',         description: '[admin] Postar TOP da semana no canal agora' },
  { command: 'recomendar',        description: '[admin] Disparar recomendações personalizadas (DM)' },
  { command: 'ofertas_ml',        description: '[admin] Ofertas ML: preview / run' },
  { command: 'cupom',             description: '[admin] Cupons manuais: ver / run' },
  { command: 'apagar',            description: '[admin] Apagar post (responda à msg do bot)' },
  { command: 'apagar_ultimos',    description: '[admin] Apagar os N últimos posts' },
  { command: 'sugestoes',         description: '[admin] Ver sugestões pendentes' },
  { command: 'aprovarsugestao',   description: '[admin] Aprovar sugestão pelo ID' },
  { command: 'rejeitarsugestao',  description: '[admin] Rejeitar sugestão pelo ID' },
];

(async () => {
  try {
    // Comandos públicos pra todos os usuários (scope default)
    await bot.setMyCommands(PUBLIC_COMMANDS, { scope: { type: 'default' } });

    // Comandos completos só pro admin (scope direcionado ao chat dele)
    if (TELEGRAM_ADMIN_USER_ID) {
      await bot.setMyCommands(ADMIN_COMMANDS, {
        scope: { type: 'chat', chat_id: parseInt(TELEGRAM_ADMIN_USER_ID, 10) },
      });
    }
    console.log('[Bot] Comandos registrados no Telegram.');
  } catch (err) {
    console.warn('[Bot] Falha ao registrar comandos:', err.message);
  }
})();

console.log('Bot interativo iniciado.');
console.log(`  Limite gratuito : ${FREE_USER_PRODUCT_LIMIT} produtos`);
console.log(`  Premium IDs     : ${PREMIUM_IDS.length || '(nenhum)'}`);
console.log(`  Admin           : ${TELEGRAM_ADMIN_USER_ID || '(não definido)'}`);

module.exports = { bot };
