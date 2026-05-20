require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const {
  getActiveProducts, addProduct, deactivateProduct,
  countProductsByUser, getProductsByUser, findProductByIdAndUser,
  addSuggestion, getPendingSuggestions, updateSuggestionStatus,
  recordReferral, countReferrals, hasBeenReferred,
  getUnavailableProducts,
} = require('./db/queries');
const { getPrice } = require('./scrapers');

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
    '*🤖 SEUS COMANDOS*',
    '',
    `📦 \`/addproduto <link>\` — *cadastra um produto pra monitorar*. Quando ele cair de preço, recebe alerta no canal.`,
    `   Ex: \`/addproduto https://amazon.com.br/dp/B0XYZ\``,
    `   Limite: *${FREE_USER_PRODUCT_LIMIT} produtos grátis*`,
    '',
    '📋 `/meusprodutos` — lista todos os seus produtos cadastrados, com ID',
    '',
    '🗑 `/removerproduto <id>` — para de monitorar um produto seu',
    '   Ex: `/removerproduto abc-123`',
    '   _(use o ID que aparece em /meusprodutos)_',
    '',
    '💡 `/sugerir <link>` — *sugere um produto pro canal* (sem limite)',
    '   Eu reviso e adiciono se fizer sentido. Pode incluir um comentário:',
    '   Ex: `/sugerir https://kabum.com.br/produto bom pra setup gamer`',
    '',
    `🤝 \`/convidar\` — pega seu *link de indicação*. Cada amigo que se cadastrar pelo seu link te dá *+${BONUS_PER_REFERRAL} slot extra* (até +${MAX_BONUS_SLOTS}).`,
    '',
    '🛒 `/lojas` — vê a lista de lojas suportadas',
    '',
    'ℹ️ `/ajuda` — versão curta da ajuda',
    'ℹ️ `/help` — este guia completo',
    '',
    '*🎁 LIMITE GRATUITO E COMO AUMENTAR*',
    `• Free: *${FREE_USER_PRODUCT_LIMIT} produtos*`,
    `• +${BONUS_PER_REFERRAL} por amigo indicado (até +${MAX_BONUS_SLOTS} bônus)`,
    '• Premium: limite alto + features extras (em breve)',
    '',
    '*💡 PRA NÃO PERDER NENHUMA OFERTA*',
    '🔔 *Ative as notificações* do canal (toque no nome do canal → Sino)',
    '📌 *Fixe o canal* no topo do Telegram (toque longo → Fixar)',
    '🤝 Compartilhe o canal com amigos — ofertas boas ficam melhor em grupo',
    '',
    '*❓ DÚVIDAS FREQUENTES*',
    '• *Posso confiar nos preços?* Sim — verifico antes de postar e bugs >80% passam por dupla checagem.',
    '• *Por que não recebo alerta dos meus produtos no privado?* Por enquanto, todos os alertas saem no canal — você só precisa ativar as notificações.',
    '• *Quanto tempo até receber um alerta?* Faço scan a cada ~30-60 min em todos os produtos cadastrados.',
    '',
    '✉️ *Suporte:* qualquer dúvida ou erro, me chama no privado.',
  ];
  if (admin) {
    lines.push(
      '',
      '👑 *COMANDOS ADMIN*',
      '`/listarprodutos` — todos os ativos no banco',
      '`/indisponiveis` — produtos em backoff',
      '`/postarcupons` — dispara rotina KaBuM agora',
      '`/topsemana` — posta TOP da semana agora',
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

  // URL de página de produto (não busca/categoria)?
  if (!isLikelyProductUrl(url)) {
    return reply(msg,
      `❌ Essa URL parece ser de busca, categoria ou listagem — preciso da URL específica de **um** produto.\n\n` +
      `Abra o produto no site e copie o link da barra do navegador.`
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

  // Validações finais — defesa contra dados lixo
  if (typeof price !== 'number' || isNaN(price) || price <= 0) {
    return reply(msg, '❌ O preço retornado é inválido. Pode ser bug do scraper ou produto fora de venda. Tente outra URL.');
  }
  if (!scrapedName || scrapedName.length < 5) {
    return reply(msg, '❌ Não consegui ler o nome do produto. URL pode ser de página errada (busca/categoria). Confirme se é a URL específica de um produto.');
  }

  const name = scrapedName;

  try {
    const { id, status } = await addProduct(name, url, route.store, {
      addedByTelegramId: userId,
      addedByUsername: username,
    });

    if (status === 'already_active') {
      return reply(msg,
        `ℹ️ Esse produto *já está sendo monitorado* (por você ou por outro usuário). ` +
        `Você vai receber os alertas no canal.\n\n🆔 \`${id}\``
      );
    }

    const header = status === 'reactivated'
      ? `♻️ *Produto reativado!*`
      : `✅ *Adicionado!*`;

    await reply(msg,
      `${header}\n\n📦 ${name}\n🏪 ${route.label}\n💰 Preço atual: *${fmtPrice(price)}*\n\n` +
      `🆔 \`${id}\`\n\n_Vou alertar se baixar significativamente._`
    );
  } catch (err) {
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
  { command: 'ajuda',          description: 'Como usar o bot (versão curta)' },
  { command: 'help',           description: 'Guia completo de uso' },
];

const ADMIN_COMMANDS = [
  ...PUBLIC_COMMANDS,
  { command: 'listarprodutos',    description: '[admin] Listar todos os produtos ativos' },
  { command: 'indisponiveis',     description: '[admin] Listar produtos em backoff' },
  { command: 'postarcupons',      description: '[admin] Postar cupons KaBuM no canal agora' },
  { command: 'topsemana',         description: '[admin] Postar TOP da semana no canal agora' },
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
