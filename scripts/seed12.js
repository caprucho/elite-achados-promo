require('dotenv').config();
const { supabase } = require('../src/db/supabase');

// 2 alternativas encontradas via API /products/search do ML pra produtos
// que falharam em levas anteriores (Fast Shop fora de estoque / ML sem winner).
const PRODUCTS = [
  { name: 'Tela Display Touch Redmi Note 13 5G Preto',  url: 'https://www.mercadolivre.com.br/p/MLB51763533', store: 'mercadolivre', category: 'acessorios', active: true },
  { name: 'Lava e Seca LG VC4 14kg Branca',             url: 'https://www.mercadolivre.com.br/p/MLB35813609', store: 'mercadolivre', category: 'casa',       active: true },
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
