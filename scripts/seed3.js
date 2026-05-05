require('dotenv').config();
const { supabase } = require('../src/db/supabase');

const PRODUCTS = [
  // ── Netshoes ─────────────────────────────────────────────────────────────────
  { name: 'Tênis Olympikus Corre 4 Chumbo/Bege (Unissex)',           url: 'https://www.netshoes.com.br/p/tenis-olympikus-corre-4-chumbo+bege-2I3-0603-933',                                                                                                   store: 'netshoes', category: 'calcados',   active: true },
  { name: 'Chuteira Futsal Umbro Pro 5 Bump Unissex Branco/Preto',   url: 'https://www.netshoes.com.br/p/chuteira-futsal-umbro-pro-5-bump-unissex-branco+preto-2IA-2818-028',                                                                                store: 'netshoes', category: 'calcados',   active: true },
  { name: 'Camisa Nike Seleção Brasileira Feminina I 2024/25',       url: 'https://www.netshoes.com.br/p/camisa-nike-selecao-brasileira-feminina-i-202425-torcedora-pro-feminina-amarelo-JD8-7860-030',                                                       store: 'netshoes', category: 'vestuario',  active: true },
  { name: 'Camisa Nike Seleção Brasileira Feminina II 2024/25',      url: 'https://www.netshoes.com.br/p/camisa-nike-selecao-brasileira-feminina-ii-202425-torcedora-pro-feminina-azul-JD8-8144-008',                                                        store: 'netshoes', category: 'vestuario',  active: true },

  // ── Dafiti ────────────────────────────────────────────────────────────────────
  { name: 'Óculos de Sol Ray-Ban Essentials Chumbo',                 url: 'https://www.dafiti.com.br/Oculos-de-Sol-Ray-Ban-Essentials-Chumbo-0RB3445-004-64-15082493.html',                                                                                  store: 'dafiti',   category: 'acessorios', active: true },
  { name: 'Blusa de Moletom GAP Reta Logo Off-White',               url: 'https://www.dafiti.com.br/Blusa-de-Moletom-Aberta-GAP-Reta-Logo-Off-White-14544809.html',                                                                                         store: 'dafiti',   category: 'vestuario',  active: true },

  // ── Mercado Livre ─────────────────────────────────────────────────────────────
  { name: 'Placa de Vídeo INNO3D GeForce RTX 4060 Ti 8GB GDDR6',    url: 'https://www.mercadolivre.com.br/placa-de-video-inno3d-geforce-rtx-4060-ti-8gb-gddr6-hdmi-21-4352-cores/p/MLB26529540',                                                             store: 'mercadolivre', category: 'hardware',    active: true },
  { name: 'Capa Prova de Choque para Galaxy Buds FE',               url: 'https://produto.mercadolivre.com.br/MLB-6691770124-capa-prova-de-choque-t-para-galaxy-buds-fe-capa-para-fo-_JM',                                                                   store: 'mercadolivre', category: 'acessorios',  active: true },
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
