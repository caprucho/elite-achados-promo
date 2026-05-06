require('dotenv').config();
const { supabase } = require('../src/db/supabase');

// Apenas os 6 produtos que passaram no teste de scraping (out of 32 enviados).
// Adidas/Nike/Centauro bloqueiam scraping via Akamai — pulados.
// 1 Zattini fora de estoque + 1 Farm Rio descontinuado também excluídos.
const PRODUCTS = [
  // ── Zattini ───────────────────────────────────────────────────────────────────
  { name: 'Sapato Social Masculino Clássico Couro Vicenza',  url: 'https://www.zattini.com.br/p/sapato-social-masculino-classico-couro-linha-vicenza-confortavel-dia-a-dia-marrom-L29-1456-138', store: 'zattini', category: 'calcados',  active: true },
  { name: 'Chinelo Sandália Kenner NK6 Pro Cinza Chumbo',    url: 'https://www.zattini.com.br/p/chinelo-sandalia-kenner-nk6-pro-cinza-chumbo-E20-58CT-040',                                            store: 'zattini', category: 'calcados',  active: true },

  // ── Farm Rio ──────────────────────────────────────────────────────────────────
  { name: 'Vestido Longo Estampado Milena',                  url: 'https://www.farmrio.com.br/vestido-longo-estampado-milena-milena_loc-medio_az-araguaia-360717-57267/p',                              store: 'farmrio', category: 'vestuario', active: true },
  { name: 'Macacão Estampado Amarilis',                      url: 'https://www.farmrio.com.br/macacao-estampado-amarilis-amarilis_verde-macapa-355057-55375/p',                                          store: 'farmrio', category: 'vestuario', active: true },
  { name: 'Kimono Estampado Floresta Doce',                  url: 'https://www.farmrio.com.br/kimono-estampado-floresta-doce-floresta-doce_off-white-340732-51443/p',                                    store: 'farmrio', category: 'vestuario', active: true },
  { name: 'Kimono Estampado Kyoto',                          url: 'https://www.farmrio.com.br/kimono-estampado-kyoto-kyoto_am-cevada-362695-56672/p',                                                    store: 'farmrio', category: 'vestuario', active: true },
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
