// Atualiza os preços dos produtos Amazon no banco.
// RODE LOCALMENTE (IP residencial) — a Amazon bloqueia o IP do Railway.
// Uso: node scripts/refresh-amazon.js   (ou: npm run refresh-amazon)
require('dotenv').config();
const { supabase } = require('../src/db/supabase');
const { getPrice } = require('../src/scrapers');

async function main() {
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, url')
    .eq('store', 'amazon')
    .eq('active', true);

  if (error) { console.error('Erro ao buscar produtos:', error.message); process.exit(1); }
  console.log(`Atualizando preço de ${products.length} produtos Amazon...\n`);

  let ok = 0, fail = 0;
  for (const p of products) {
    try {
      const r = await getPrice(p.url);
      if (r && r.price > 0) {
        await supabase.from('price_history').insert({ product_id: p.id, price: r.price, is_available: true });
        // Atualiza image_url no produto (se o scraper retornou) — usado pelo card de Achadinho
        if (r.imageUrl) {
          await supabase.from('products').update({ image_url: r.imageUrl }).eq('id', p.id);
        }
        console.log(`  ✅ R$ ${r.price.toFixed(2).padStart(10)}  ${p.name.slice(0, 50)}${r.imageUrl ? ' 🖼️' : ''}`);
        ok++;
      } else {
        console.log(`  ❌ NULL${' '.repeat(8)}  ${p.name.slice(0, 50)}`);
        fail++;
      }
    } catch (e) {
      console.log(`  ❌ ERR ${(e.message || '').slice(0, 30)}  ${p.name.slice(0, 50)}`);
      fail++;
    }
    await new Promise((res) => setTimeout(res, 1500));
  }

  console.log(`\n=== ${ok} atualizados / ${fail} falharam ===`);
  process.exit(0);
}

main();
