require('dotenv').config();
const { supabase } = require('../src/db/supabase');

// 10 produtos novos da Sephora (1 duplicado já está no seed8 — Mist Cheirosa 62).
// Pichau bloqueou todas as 7 URLs com 403 (Cloudflare) — não inseridas.
const PRODUCTS = [
  { name: 'Perfume Dior Sauvage Parfum Masculino',                    url: 'https://www.sephora.com.br/perfume-dior-sauvage-parfum-masculino-prd43865-16885.html',                                                                       store: 'sephora', category: 'beleza', active: true },
  { name: 'Perfume Dior Sauvage Eau de Parfum Masculino',             url: 'https://www.sephora.com.br/perfume-dior-sauvage-masculino-eau-de-parfum-prd40693-14186.html',                                                              store: 'sephora', category: 'beleza', active: true },
  { name: 'Perfume Dior Sauvage Eau de Toilette Masculino',           url: 'https://www.sephora.com.br/sauvage-masculino-eau-de-toilette-20832-15756.html',                                                                             store: 'sephora', category: 'beleza', active: true },
  { name: 'Perfume Dior Sauvage Eau Forte Parfum Masculino',          url: 'https://www.sephora.com.br/perfume-dior-sauvage-eau-forte-masculino-parfum-88992306-88992306.html',                                                        store: 'sephora', category: 'beleza', active: true },
  { name: 'Perfume Dior Sauvage Elixir Masculino',                    url: 'https://www.sephora.com.br/perfume-dior-sauvage-elixir-masculino-9090558095-9090558095.html',                                                              store: 'sephora', category: 'beleza', active: true },
  { name: 'Perfume Lancôme La Vie Est Belle Eau de Parfum Feminino',  url: 'https://www.sephora.com.br/la-vie-est-belle-feminino-eau-de-parfum-14897-11894.html',                                                                       store: 'sephora', category: 'beleza', active: true },
  { name: 'Perfume Lancôme La Vie Est Belle Intensément EDP',         url: 'https://www.sephora.com.br/perfume-lancome-la-vie-est-belle-intensement-feminino-eau-de-parfum-prd44898-18415.html',                                       store: 'sephora', category: 'beleza', active: true },
  { name: 'Refil Perfume Lancôme La Vie Est Belle Eau de Parfum',     url: 'https://www.sephora.com.br/refil-perfume-lancome-la-vie-est-belle-feminino-eau-de-parfum-9090616694-9090616694.html',                                      store: 'sephora', category: 'beleza', active: true },
  { name: 'Kit Coffret Lancôme La Vie Est Belle Feminino (op. 1)',    url: 'https://www.sephora.com.br/kit-offret-lancome-la-vie-est-belle-feminino-9090810442-9090810442.html',                                                       store: 'sephora', category: 'beleza', active: true },
  { name: 'Kit Coffret Lancôme La Vie Est Belle Feminino (op. 2)',    url: 'https://www.sephora.com.br/kit-coffret-lancome-la-vie-est-belle-feminino-9090804425-9090804425.html',                                                      store: 'sephora', category: 'beleza', active: true },
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
