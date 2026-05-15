require('dotenv').config();
const { supabase } = require('../src/db/supabase');

// 13 produtos validados desta leva (links testados + resolvidos via API).
const PRODUCTS = [
  { name: 'Blush Líquido Rare Beauty Soft Pinch',          url: 'https://www.sephora.com.br/blush-liquido-rare-beauty-soft-pinch-liquid-blush-18862-18862.html', store: 'sephora', category: 'beleza', active: true },
  { name: 'Pó Compacto Rare Beauty True to Myself',         url: 'https://www.sephora.com.br/po-compacto-rare-beauty-finalizador-true-to-myself-tinted-88992341-88992341.html', store: 'sephora', category: 'beleza', active: true },
  { name: 'Creme Hidratante Drunk Elephant Bora Barrier Repair', url: 'https://www.sephora.com.br/creme-hidratante-drunk-elephant-bora-barrier-repair-cream-88991433-88991433.html', store: 'sephora', category: 'beleza', active: true },
  { name: 'Corretivo NARS Radiant Creamy Concealer',        url: 'https://www.sephora.com.br/corretivo-radiant-creamy-concealer-14815-8029.html', store: 'sephora', category: 'beleza', active: true },
  { name: 'Câmera de Ação Insta360 X4 8K 360',              url: 'https://www.mercadolivre.com.br/insta360-x4-8k-360-action-cmera-360-60fps-para-streaming-profissional-inteligncia-artificial-com-sensor-de-rastreamento-e-controle-de-gestos-prova-dagua-efeito-basto-de-selfie-invisivel/p/MLB36223181', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Apple AirPods Pro 2ª Geração Branco',            url: 'https://www.mercadolivre.com.br/apple-airpods-pro-2-geraco-branco/p/MLB19623394', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Water Cooler Corsair iCUE Link H150i RGB 360mm', url: 'https://www.kabum.com.br/produto/622059/water-cooler-corsair-icue-link-h150i-rgb-aio-360mm-p-intel-amd-rgb-cw-9061003-ww', store: 'kabum', category: 'hardware', active: true },
  { name: 'E-reader Amazon Kindle Scribe 16GB',             url: 'https://www.mercadolivre.com.br/amazon-kindle-scribe-16gb-2024-cor-tungsten/p/MLB47093024', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Tênis Adidas Runfalcon 5 Masculino Verde/Branco', url: 'https://www.netshoes.com.br/p/tenis-adidas-runfalcon-5-masculino-verde+branco-FB9-8805-054', store: 'netshoes', category: 'calcados', active: true },
  { name: 'Mochila Vans Realm Classic Preta',               url: 'https://www.dafiti.com.br/Mochila-Vans-Realm-Classic-Preta-3597155.html', store: 'dafiti', category: 'acessorios', active: true },
  { name: 'Vestido Cropped Farm Rio Romance De Pássaro',    url: 'https://www.farmrio.com.br/vestido-cropped-estampado-romance-de-passaro-romance-de-passaro_mr-terra-361791-56729/p', store: 'farmrio', category: 'vestuario', active: true },
  { name: 'Drone DJI Mini 4 Pro Standard',                  url: 'https://www.amazon.com.br/dp/B0CJYHBYVK', store: 'amazon', category: 'eletronicos', active: true },
  { name: 'Fone de Ouvido Beats Studio Pro Bluetooth',      url: 'https://www.amazon.com.br/dp/B0C95P5PJG', store: 'amazon', category: 'eletronicos', active: true },
];

async function main() {
  console.log(`Inserindo/atualizando ${PRODUCTS.length} produtos...`);
  const { data, error } = await supabase
    .from('products')
    .upsert(PRODUCTS, { onConflict: 'url' })
    .select('id, name');
  if (error) { console.error('Erro:', error.message); process.exit(1); }
  console.log(`${data.length} produto(s) inseridos/atualizados.`);
  process.exit(0);
}

main();
