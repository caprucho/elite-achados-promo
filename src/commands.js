require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { getActiveProducts, addProduct, deactivateProduct } = require('./db/queries');
const { getPrice } = require('./scrapers');
const { closeBrowser } = require('./scrapers/browser');

const { TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_USER_ID } = process.env;

if (!TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN é obrigatório no .env');
}
if (!TELEGRAM_ADMIN_USER_ID) {
  throw new Error('TELEGRAM_ADMIN_USER_ID é obrigatório no .env (seu ID pessoal do Telegram)');
}

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

function isAdmin(msg) {
  return String(msg.from.id) === String(TELEGRAM_ADMIN_USER_ID);
}

function detectStore(url) {
  const h = new URL(url).hostname;
  if (h.includes('mercadolivre')) return 'Mercado Livre';
  if (h.includes('amazon'))       return 'Amazon';
  if (h.includes('dafiti'))       return 'Dafiti';
  if (h.includes('kabum'))        return 'KaBuM';
  if (h.includes('wap'))          return 'WAP';
  if (h.includes('netshoes'))     return 'Netshoes';
  if (h.includes('farmrio'))      return 'Farm Rio';
  if (h === 'amzn.to')            return 'Amazon';
  return h;
}

// /addproduto <url>
bot.onText(/\/addproduto (.+)/, async (msg, match) => {
  if (!isAdmin(msg)) return;

  const url = match[1].trim();

  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    await bot.sendMessage(msg.chat.id, '❌ URL inválida.');
    return;
  }

  await bot.sendMessage(msg.chat.id, '⏳ Buscando informações do produto...');

  try {
    const result = await getPrice(url);
    if (!result) {
      await bot.sendMessage(msg.chat.id, '❌ Não consegui extrair o preço. Verifique se a loja é suportada e a URL está correta.');
      return;
    }

    const { price, name: scrapedName } = result;
    const store = detectStore(url);
    const name = scrapedName || `Produto (${store})`;
    const priceFormatted = price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const id = await addProduct(name, url, store);

    await bot.sendMessage(msg.chat.id,
      `✅ Produto adicionado!\n\nID: ${id}\nNome: ${name}\nLoja: ${store}\nPreço atual: ${priceFormatted}`
    );
  } catch (err) {
    await bot.sendMessage(msg.chat.id, `❌ Erro: ${err.message}`);
  }
});

// /removerproduto <id>
bot.onText(/\/removerproduto (\d+)/, async (msg, match) => {
  if (!isAdmin(msg)) return;

  const productId = parseInt(match[1], 10);

  try {
    await deactivateProduct(productId);
    await bot.sendMessage(msg.chat.id, `✅ Produto #${productId} desativado com sucesso.`);
  } catch (err) {
    await bot.sendMessage(msg.chat.id, `❌ Erro ao desativar produto #${productId}: ${err.message}`);
  }
});

// /listarprodutos
bot.onText(/\/listarprodutos/, async (msg) => {
  if (!isAdmin(msg)) return;

  const products = await getActiveProducts();

  if (!products.length) {
    await bot.sendMessage(msg.chat.id, 'Nenhum produto ativo no momento.');
    return;
  }

  // Telegram limite de 4096 chars — divide em blocos se necessário
  const lines = products.map((p) => `#${p.id} — ${p.name}\n${p.store} | ${p.url}`);
  let block = `📋 *${products.length} produtos ativos:*\n\n`;

  for (const line of lines) {
    if ((block + line + '\n\n').length > 4000) {
      await bot.sendMessage(msg.chat.id, block, { parse_mode: 'Markdown' });
      block = '';
    }
    block += line + '\n\n';
  }

  if (block.trim()) {
    await bot.sendMessage(msg.chat.id, block, { parse_mode: 'Markdown' });
  }
});

// /ajuda
bot.onText(/\/ajuda|\/start/, async (msg) => {
  if (!isAdmin(msg)) return;

  await bot.sendMessage(msg.chat.id, [
    '🤖 *Comandos disponíveis:*',
    '',
    '`/addproduto <url>` — adiciona produto pelo link',
    '`/removerproduto <id>` — desativa produto pelo ID',
    '`/listarprodutos` — lista todos os produtos ativos',
  ].join('\n'), { parse_mode: 'Markdown' });
});

process.on('SIGINT',  () => closeBrowser().then(() => process.exit(0)));
process.on('SIGTERM', () => closeBrowser().then(() => process.exit(0)));

console.log('Bot de comandos admin iniciado. Aguardando mensagens...');
console.log(`Admin: ${TELEGRAM_ADMIN_USER_ID}`);
