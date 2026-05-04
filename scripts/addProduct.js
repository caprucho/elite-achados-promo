require('dotenv').config();
const { supabase } = require('../src/db/supabase');
const { getPrice }  = require('../src/scrapers');

const SUPPORTED_STORES = ['mercadolivre', 'amazon', 'dafiti', 'kabum', 'wap'];

const STORE_MAP = {
  'mercadolivre.com': 'mercadolivre',
  'amazon.com':       'amazon',
  'dafiti.com':       'dafiti',
  'kabum.com':        'kabum',
  'wap.ind.br':       'wap',
};

function detectStore(url) {
  const hostname = new URL(url).hostname;
  const match = Object.keys(STORE_MAP).find((domain) => hostname.includes(domain));
  return match ? STORE_MAP[match] : null;
}

async function addProduct(name, url, category) {
  // Valida URL
  try { new URL(url); } catch {
    console.error('URL inválida:', url);
    process.exit(1);
  }

  // Detecta loja automaticamente
  const store = detectStore(url);
  if (!store) {
    console.error(`Loja não suportada. Suportadas: ${SUPPORTED_STORES.join(', ')}`);
    process.exit(1);
  }

  // Testa se o scraper já consegue coletar o preço
  process.stdout.write(`Testando scraper em ${store}... `);
  const price = await getPrice(url);
  if (price === null) {
    console.log('FALHOU');
    console.warn('Scraper não retornou preço. Produto será inserido mas pode estar com seletor desatualizado.');
  } else {
    console.log(`OK — preço atual: R$ ${price.toFixed(2)}`);
  }

  // Insere no banco
  const { data, error } = await supabase
    .from('products')
    .upsert({ name, url, store, category, active: true }, { onConflict: 'url' })
    .select('id, name, store')
    .single();

  if (error) {
    console.error('Erro ao inserir produto:', error.message);
    process.exit(1);
  }

  // Salva preço inicial se scraper funcionou
  if (price !== null) {
    await supabase.from('price_history').insert({ product_id: data.id, price });
  }

  console.log(`\nProduto adicionado com sucesso!`);
  console.log(`  ID    : ${data.id}`);
  console.log(`  Nome  : ${data.name}`);
  console.log(`  Loja  : ${data.store}`);
}

// Uso: node scripts/addProduct.js "Nome do Produto" "https://..." "categoria"
const [,, name, url, category = 'geral'] = process.argv;

if (!name || !url) {
  console.log('Uso: node scripts/addProduct.js "Nome do Produto" "https://url..." "categoria"');
  console.log('Exemplo: node scripts/addProduct.js "Headset HyperX Cloud II" "https://www.kabum.com.br/..." "perifericos"');
  process.exit(0);
}

addProduct(name, url, category);
