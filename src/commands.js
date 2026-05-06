require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const {
  getActiveProducts, addProduct, deactivateProduct,
  countProductsByUser, getProductsByUser, findProductByIdAndUser,
  addSuggestion, getPendingSuggestions, updateSuggestionStatus,
  recordReferral, countReferrals, hasBeenReferred,
} = require('./db/queries');
const { getPrice } = require('./scrapers');

const { TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_USER_ID } = process.env;

if (!TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN é obrigatório no .env');
}

const FREE_USER_PRODUCT_LIMIT = parseInt(process.env.FREE_USER_PRODUCT_LIMIT || '3', 10);
const BONUS_PER_REFERRAL      = parseInt(process.env.BONUS_PER_REFERRAL      || '1', 10);
const MAX_BONUS_SLOTS         = parseInt(process.env.MAX_BONUS_SLOTS         || '10', 10);
const BOT_USERNAME            = process.env.TELEGRAM_BOT_USERNAME || 'Elite_Achados_PromoBOT';
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
  { match: 'wap.ind.br',       store: 'wap',          label: 'WAP'           },
];

function detectStore(url) {
  let h;
  try { h = new URL(url).hostname.toLowerCase(); } catch { return null; }
  const route = STORE_ROUTES.find((r) => h.includes(r.match) || h === r.match);
  return route || null;
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
  '• LG Brasil',
  '• Sephora',
  '• Fast Shop',
  '• Keychron Brasil',
  '• Infocellshop, Icelo Shop',
  '• WAP (loja oficial)',
  '',
  '_Para outras lojas, use_ `/sugerir <link>` _que eu avalio._',
].join('\n');

function helpMessage(admin) {
  const base = [
    '🤖 *Como usar o bot*',
    '',
    `📦 \`/addproduto <link>\` — começa a monitorar um produto pra você (limite: ${FREE_USER_PRODUCT_LIMIT} grátis)`,
    '📋 `/meusprodutos` — lista os produtos que você cadastrou',
    '🗑 `/removerproduto <id>` — para de monitorar (apenas os seus)',
    '',
    '💡 `/sugerir <link>` — sugere um produto pro canal (sem limite, eu reviso)',
    '',
    `🤝 \`/convidar\` — pega seu link de indicação. Cada amigo cadastrado = +${BONUS_PER_REFERRAL} slot extra (até +${MAX_BONUS_SLOTS})`,
    '',
    '🛒 `/lojas` — lojas suportadas',
    'ℹ️ `/ajuda` — esta mensagem',
    '',
    '✨ *Quer ainda mais?* Me chama no privado pra liberar acesso premium.',
  ];
  if (admin) {
    base.push(
      '',
      '👑 *Admin*',
      '`/listarprodutos` — todos os ativos',
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

// ── /start [ref_<id>], /ajuda, /help ─────────────────────────────────────────
bot.onText(/^\/(start|ajuda|help)(?:\s+(\S+))?/, async (msg, match) => {
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

// ── /addproduto <url> ────────────────────────────────────────────────────────
bot.onText(/^\/addproduto\s+(.+)$/, async (msg, match) => {
  const url = match[1].trim();
  const userId = String(msg.from.id);
  const username = msg.from.username || msg.from.first_name || 'desconhecido';

  // Valida URL
  try { new URL(url); } catch {
    return reply(msg, '❌ URL inválida. Envie a URL completa do produto.');
  }

  // Loja suportada?
  const route = detectStore(url);
  if (!route) {
    return reply(msg,
      `❌ Loja não suportada.\n\n${SUPPORTED_LIST}\n\n` +
      `Quer registrar como sugestão pra eu avaliar?\n\`/sugerir ${url}\``
    );
  }

  // Limite por usuário (admin/premium passa direto)
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
    return reply(msg, `❌ Erro ao consultar a loja: ${err.message}`);
  }

  if (!result) {
    return reply(msg,
      '❌ Não consegui extrair o preço. URL errada, produto indisponível, ou bloqueio temporário da loja.\n\n' +
      `Quer registrar como sugestão? \`/sugerir ${url}\``
    );
  }

  const { price, name: scrapedName } = result;
  const name = scrapedName || `Produto (${route.label})`;

  try {
    const id = await addProduct(name, url, route.store, {
      addedByTelegramId: userId,
      addedByUsername: username,
    });
    await reply(msg,
      `✅ *Adicionado!*\n\n📦 ${name}\n🏪 ${route.label}\n💰 Preço atual: *${fmtPrice(price)}*\n\n` +
      `🆔 \`${id}\`\n\n_Vou alertar se baixar significativamente._`
    );
  } catch (err) {
    if (err.message.includes('duplicate') || err.message.includes('unique')) {
      return reply(msg, 'ℹ️ Esse produto já está sendo monitorado por alguém. Você vai receber os alertas no canal.');
    }
    await reply(msg, `❌ Erro ao salvar: ${err.message}`);
  }
});

// ── /meusprodutos ────────────────────────────────────────────────────────────
bot.onText(/^\/meusprodutos\b/, async (msg) => {
  const userId = String(msg.from.id);
  const products = await getProductsByUser(userId);

  if (!products.length) {
    return reply(msg, 'Você ainda não cadastrou nenhum produto.\n\nUse `/addproduto <link>` pra começar.');
  }

  let limitInfo;
  if (isPremium(msg)) {
    limitInfo = '✨ premium';
  } else {
    const limit = await getUserLimit(userId);
    const bonusTag = limit.bonus > 0 ? ` (+${limit.bonus} bônus 🤝)` : '';
    limitInfo = `${products.length}/${limit.total}${bonusTag}`;
  }
  const lines = products.map((p) =>
    `• *${p.name}*\n  🏪 ${p.store}  •  🆔 \`${p.id}\``
  );
  await reply(msg, `📋 *Seus produtos* (${limitInfo})\n\n${lines.join('\n\n')}`);
});

// ── /removerproduto <uuid> ───────────────────────────────────────────────────
bot.onText(/^\/removerproduto\s+(\S+)/, async (msg, match) => {
  const productId = match[1].trim();
  const userId = String(msg.from.id);

  // Admin remove qualquer; usuário só os seus
  if (!isAdmin(msg)) {
    const owned = await findProductByIdAndUser(productId, userId);
    if (!owned) {
      return reply(msg, '❌ Produto não encontrado entre os seus. Veja `/meusprodutos`.');
    }
  }

  try {
    await deactivateProduct(productId);
    await reply(msg, '✅ Produto desativado. Você não receberá mais alertas dele.');
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
    const id = await addSuggestion(userId, username, url, note);
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

bot.on('polling_error', (err) => {
  console.warn('[Bot] polling error:', err.code || err.message);
});

// Registra a lista de comandos no Telegram (autocomplete ao digitar "/")
const PUBLIC_COMMANDS = [
  { command: 'addproduto',     description: 'Adicionar produto pra monitorar (link da loja)' },
  { command: 'meusprodutos',   description: 'Ver meus produtos cadastrados' },
  { command: 'removerproduto', description: 'Remover um produto seu (use o ID)' },
  { command: 'sugerir',        description: 'Sugerir um produto pro canal' },
  { command: 'convidar',       description: 'Pegar seu link de indicação (+slots por amigo)' },
  { command: 'lojas',          description: 'Ver lojas suportadas' },
  { command: 'ajuda',          description: 'Como usar o bot' },
];

const ADMIN_COMMANDS = [
  ...PUBLIC_COMMANDS,
  { command: 'listarprodutos',    description: '[admin] Listar todos os produtos ativos' },
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
