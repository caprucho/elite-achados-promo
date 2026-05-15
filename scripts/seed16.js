require('dotenv').config();
const { supabase } = require('../src/db/supabase');

// 11 produtos semelhantes/concorrentes — todos Amazon BR (loja confiável,
// venda nacional), marcas reconhecidas, categorias já existentes no monitor.
const PRODUCTS = [
  // ── Casa: fechaduras Intelbras + copo térmico ────────────────────────────────
  { name: 'Fechadura Digital de Sobrepor Intelbras FR 101V', url: 'https://www.amazon.com.br/dp/B0GJDM2B38', store: 'amazon', category: 'casa',   active: true },
  { name: 'Fechadura Digital de Sobrepor Intelbras FR 102',  url: 'https://www.amazon.com.br/dp/B0DJH73WNX', store: 'amazon', category: 'casa',   active: true },
  { name: 'Fechadura Digital de Embutir Intelbras FR 221V',  url: 'https://www.amazon.com.br/dp/B0GJTTTG1W', store: 'amazon', category: 'casa',   active: true },
  { name: 'Fechadura Digital Intelbras FR 630 Preto',        url: 'https://www.amazon.com.br/dp/B07W7VQ7HQ', store: 'amazon', category: 'casa',   active: true },
  { name: 'Copo Térmico CamelBak 850ml Aço Inoxidável',      url: 'https://www.amazon.com.br/dp/B087TJ2W31', store: 'amazon', category: 'casa',   active: true },

  // ── Beleza: protetores solares e hidratante (concorrentes do nicho) ──────────
  { name: 'Protetor Solar ISDIN Fusion Water Magic Color FPS 50',     url: 'https://www.amazon.com.br/dp/B07ML4WHQY', store: 'amazon', category: 'beleza', active: true },
  { name: 'Protetor Solar ISDIN Fusion Water 5 Stars Sem Cor FPS 50', url: 'https://www.amazon.com.br/dp/B08F864LDD', store: 'amazon', category: 'beleza', active: true },
  { name: 'Protetor Solar Corporal ISDIN Hydrolotion Bifásico',       url: 'https://www.amazon.com.br/dp/B09QLZZQ5M', store: 'amazon', category: 'beleza', active: true },
  { name: 'Protetor Solar Neutrogena Derm Care Pele Oleosa FPS 70',   url: 'https://www.amazon.com.br/dp/B0F4G9HWF7', store: 'amazon', category: 'beleza', active: true },
  { name: 'Protetor Solar Neutrogena Sun Fresh Derm Care',            url: 'https://www.amazon.com.br/dp/B08NVMP2YZ', store: 'amazon', category: 'beleza', active: true },
  { name: 'Eucerin Aquaphor Pomada Reparadora 50ml',                  url: 'https://www.amazon.com.br/dp/B0B7GNPS48', store: 'amazon', category: 'beleza', active: true },
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
