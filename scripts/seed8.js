require('dotenv').config();
const { supabase } = require('../src/db/supabase');

// 5 produtos validados via scraper genérico jsonld.js (de 22 enviados).
// Lojas que falharam: Sony/PlayStation/Neutrogena/Bioré/Vivo/Extra/Shopee/
// TrackField/VbGps/HorizonPlay/ShoppingDosRobos/Mazer/BneStore — sem JSON-LD
// extraível (preço via JS) ou bloqueio Akamai. LG e Fastshop também não
// conseguiram (LG sem offers no JSON-LD, Fastshop fora de estoque).
const PRODUCTS = [
  { name: 'MacBook Air M3',                                 url: 'https://www.apple.com/br/shop/buy-mac/macbook-air',                                                                                                                store: 'apple',        category: 'eletronicos', active: true },
  { name: 'Teclado Mecânico Keychron V1 Max QMK Wireless',  url: 'https://keychronbrasil.com.br/products/keychron-v1-max-qmk-teclado-mecanico-custom-wireless',                                                                     store: 'keychron',     category: 'hardware',    active: true },
  { name: 'Mist Sol de Janeiro Brazilian Crush Cheirosa 62 (Sephora)', url: 'https://www.sephora.com.br/Mist-Perfumado-Sol-de-Janeiro-Brazilian-Crush-Cheirosa--62-Body---Hair-Mist-%2011220124-11220124.html',                     store: 'sephora',      category: 'beleza',      active: true },
  { name: 'Echo Show 5 3ª Geração Smart Speaker (Infocellshop)',       url: 'https://infocellshop.com.br/produtos/echo-dot-5-geracao-smart-speaker-com-alexa/',                                                                       store: 'infocellshop', category: 'eletronicos', active: true },
  { name: 'Kindle Scribe 16GB 2022 + Premium Pen (Icelo Shop)',         url: 'https://www.iceloshop.com.br/index.php?route=product/product&product_id=512',                                                                          store: 'iceloshop',    category: 'eletronicos', active: true },
];

async function main() {
  console.log(`Inserindo/atualizando ${PRODUCTS.length} produtos...`);

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
