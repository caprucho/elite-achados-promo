require('dotenv').config();
const { supabase } = require('../src/db/supabase');

const PRODUCTS = [
  // ── Farm Rio ──────────────────────────────────────────────────────────────────
  { name: 'Vestido Ombro Só Selva De Flor',                         url: 'https://www.farmrio.com.br/vestido-ombro-so-selva-de-flor-selva-de-flor_preto-363790-56684/p',                                                                           store: 'farmrio',      category: 'vestuario',   active: true },
  { name: 'Vestido Curto Estampado Selva De Flor',                  url: 'https://www.farmrio.com.br/vestido-curto-estampado-selva-de-flor-selva-de-flor_preto-362716-56684/p',                                                                     store: 'farmrio',      category: 'vestuario',   active: true },
  { name: 'Macacão Estampado Amarilis',                             url: 'https://www.farmrio.com.br/macacao-estampado-amarilis-amarilis_verde-macapa-355057-55375/p',                                                                               store: 'farmrio',      category: 'vestuario',   active: true },
  { name: 'Vestido Cropped Estampado Romance De Pássaro',           url: 'https://www.farmrio.com.br/vestido-cropped-estampado-romance-de-passaro-romance-de-passaro_mr-terra-361791-56729/p',                                                       store: 'farmrio',      category: 'vestuario',   active: true },
  { name: 'Vestido Curto Estampado Romance De Pássaro',             url: 'https://www.farmrio.com.br/vestido-curto-estampado-romance-de-passaro-romance-de-passaro_mr-terra-361790-56729/p',                                                         store: 'farmrio',      category: 'vestuario',   active: true },

  // ── Mercado Livre ─────────────────────────────────────────────────────────────
  { name: 'Apple iPhone 17 Pro Max 256GB',                          url: 'https://www.mercadolivre.com.br/iphone-17-pro-max-256gb-prateado/p/MLB55308605',                                                                                           store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Samsung Galaxy S26 Ultra 5G 256GB',                      url: 'https://www.mercadolivre.com.br/celular-samsung-galaxy-s26-ultra-5g-256gb-12gb-ram-cmera-quadrupla-tela-grande-de-69-preto/p/MLB65503984',                                 store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Apple Watch Series 11 46mm GPS Alumínio',                url: 'https://www.mercadolivre.com.br/apple-watch-series-11-gps-caixa-cinza-espacial-de-aluminio-46-mm-pulseira-esportiva-preta-mg-distribuidor-autorizado/p/MLB1054112179',     store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'LEGO Icons Wildflower Bouquet 10313',                    url: 'https://www.mercadolivre.com.br/lego-icons-wildflower-bouquet-10313-artificial-flowers-wit/p/MLB2063287491',                                                               store: 'mercadolivre', category: 'casa',        active: true },
  { name: 'Body Mist Sol de Janeiro Cheirosa 62 240ml',             url: 'https://www.mercadolivre.com.br/sol-de-janeiro-brazilian-crush-cheirosa-62-body-mist-fem-240ml/p/MLB24244613',                                                             store: 'mercadolivre', category: 'beleza',      active: true },
  { name: 'Splash Sol de Janeiro Cheirosa 62 90ml',                 url: 'https://www.mercadolivre.com.br/splash-sol-de-janeiro-brazilian-crush-cheirosa-62-90ml-vegan/p/MLB24244614',                                                               store: 'mercadolivre', category: 'beleza',      active: true },
  { name: 'Perfume Sol de Janeiro Cheirosa 62 Eau de Parfum 50ml',  url: 'https://www.mercadolivre.com.br/perfume-sol-de-janeiro-cheirosa-62-eau-de-parfum-50ml-amadeirado/p/MLB21401853',                                                           store: 'mercadolivre', category: 'beleza',      active: true },

  // ── Amazon ────────────────────────────────────────────────────────────────────
  { name: 'Kindle Colorsoft 16GB',                                  url: 'https://amzn.to/4ont43E',                                                                                                                                                  store: 'amazon',       category: 'eletronicos', active: true },
  { name: 'Drone DJI Mini 4 Pro',                                   url: 'https://amzn.to/3XDHMc9',                                                                                                                                                  store: 'amazon',       category: 'eletronicos', active: true },

  // ── Dafiti ────────────────────────────────────────────────────────────────────
  { name: 'Tênis adidas Originals SL 72 RS Preto',                  url: 'https://www.dafiti.com.br/Tenis-adidas-Originals-SL-72-RS-Preto-13985423.html',                                                                                           store: 'dafiti',       category: 'calcados',    active: true },
  { name: 'Tênis SL 72 OG adidas Originals Branco',                 url: 'https://www.dafiti.com.br/Tenis-SL-72-OG-adidas-Originals-Branco-14760676.html',                                                                                          store: 'dafiti',       category: 'calcados',    active: true },
  { name: 'Tênis New Balance 1906R Preto',                          url: 'https://www.dafiti.com.br/Tenis-New-Balance-1906R-Preto-14737811.html',                                                                                                    store: 'dafiti',       category: 'calcados',    active: true },
];

async function main() {
  console.log(`Inserindo ${PRODUCTS.length} produtos...`);

  const { data, error } = await supabase
    .from('products')
    .upsert(PRODUCTS, { onConflict: 'url' })
    .select('id, name');

  if (error) {
    console.error('Erro:', error.message);
    process.exit(1);
  }

  console.log(`\n${data.length} produto(s) inseridos/atualizados:`);
  data.forEach((p) => console.log(`  #${p.id} — ${p.name}`));
  process.exit(0);
}

main();
