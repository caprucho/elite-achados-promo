require('dotenv').config();
const { supabase } = require('../src/db/supabase');

// 9 produtos novos resolvidos automaticamente a partir da lista de
// nomes/modelos do Gemini (ML via API, WAP via VTEX, Apple e Amazon via busca).
const PRODUCTS = [
  { name: 'Fritadeira Air Fryer Mondial 6L 1900W AFN-60-BI',  url: 'https://www.mercadolivre.com.br/p/MLB37651406', store: 'mercadolivre', category: 'casa', active: true },
  { name: 'Aspirador de Pó Vertical 2 em 1 WAP Power Speed 2000W', url: 'https://loja.wap.ind.br/aspirador-de-po-vertical-2-em-1-2000w-wap-power-speed/p', store: 'wap', category: 'casa', active: true },
  { name: 'Aspirador de Pó Portátil a Bateria WAP Handson',   url: 'https://loja.wap.ind.br/aspirador-de-po-portatil-a-bateria-wap-handson/p', store: 'wap', category: 'casa', active: true },
  { name: 'Limpador WAP MOP Multiúso Lava e Seca Duplo Compacto', url: 'https://loja.wap.ind.br/limpador-wap-mop-multiuso-lava-e-seca-duplo-compacto/p', store: 'wap', category: 'casa', active: true },
  { name: 'Robô Aspirador de Pó WAP Robot W310',              url: 'https://loja.wap.ind.br/robot-w310-1/p', store: 'wap', category: 'casa', active: true },
  { name: 'Lavadora de Alta Pressão WAP Ousada Plus 2200 1500W', url: 'https://loja.wap.ind.br/lavadora-de-alta-pressao-1500w-1750psi-wap-ousada-plus-2200/p', store: 'wap', category: 'casa', active: true },
  { name: 'Apple iPhone 17e 256GB',                           url: 'https://www.apple.com/br/shop/buy-iphone/iphone-17e', store: 'apple', category: 'eletronicos', active: true },
  { name: 'Apple Watch Ultra 3 Titânio 49mm',                 url: 'https://www.apple.com/br/shop/buy-watch/apple-watch-ultra', store: 'apple', category: 'eletronicos', active: true },
  { name: 'Smartwatch Samsung Galaxy Fit3 Grafite',           url: 'https://www.amazon.com.br/dp/B0CVCLGV1W', store: 'amazon', category: 'eletronicos', active: true },
];

async function main() {
  console.log(`Inserindo/atualizando ${PRODUCTS.length} produtos...`);
  const { data, error } = await supabase
    .from('products')
    .upsert(PRODUCTS, { onConflict: 'url' })
    .select('id, name');
  if (error) { console.error('Erro:', error.message); process.exit(1); }
  console.log(`\n${data.length} produto(s):`);
  data.forEach((p) => console.log(`  ${p.name}`));
  process.exit(0);
}

main();
