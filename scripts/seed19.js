require('dotenv').config();
const { supabase } = require('../src/db/supabase');

// 23 produtos descobertos via API ML. Descartados da busca: peças de
// reposição (agitador/dispenser de lavadora), suportes de parede,
// marcas obscuras (Ioway, Inova, fone intraocular), combo "Tab+Buds",
// forno sem marca e duplicatas.
const PRODUCTS = [
  // ── Eletrodomésticos ──────────────────────────────────────────────────────────
  { name: 'Geladeira Consul Frost Free Duplex CRM44MB',       url: 'https://www.mercadolivre.com.br/p/MLB52458477', store: 'mercadolivre', category: 'casa', active: true },
  { name: 'Geladeira Consul Frost Free Duplex CRM44MK Inox',  url: 'https://www.mercadolivre.com.br/p/MLB54119844', store: 'mercadolivre', category: 'casa', active: true },
  { name: 'Liquidificador Mondial Turbo Inox L1100',          url: 'https://www.mercadolivre.com.br/p/MLB26450825', store: 'mercadolivre', category: 'casa', active: true },
  { name: 'Liquidificador Mondial Turbo Inox Pulsar',         url: 'https://www.mercadolivre.com.br/p/MLB41184908', store: 'mercadolivre', category: 'casa', active: true },
  { name: 'Fritadeira Air Fryer BFR36A Preta',                url: 'https://www.mercadolivre.com.br/p/MLB62725174', store: 'mercadolivre', category: 'casa', active: true },
  { name: 'Fritadeira Air Fryer PAF15C',                      url: 'https://www.mercadolivre.com.br/p/MLB66275098', store: 'mercadolivre', category: 'casa', active: true },
  { name: 'Cadeira Gamer ThunderX3 BC7 Azul',                 url: 'https://www.mercadolivre.com.br/p/MLB22639381', store: 'mercadolivre', category: 'casa', active: true },
  { name: 'Cadeira Gamer ThunderX3 TGC12 Cinza',              url: 'https://www.mercadolivre.com.br/p/MLB37849530', store: 'mercadolivre', category: 'casa', active: true },

  // ── Computadores / Hardware ───────────────────────────────────────────────────
  { name: 'Notebook Gamer Lenovo LOQ i5 16GB RTX 2050',       url: 'https://www.mercadolivre.com.br/p/MLB38644264', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Notebook Gamer Lenovo LOQ i5 8GB RTX 2050',        url: 'https://www.mercadolivre.com.br/p/MLB37178404', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Notebook Gamer Lenovo LOQ i5-12450 RTX 3050',      url: 'https://www.mercadolivre.com.br/p/MLB54134220', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Placa de Vídeo Palit GeForce RTX 5080 GamingPro 16GB', url: 'https://www.mercadolivre.com.br/p/MLB49575556', store: 'mercadolivre', category: 'hardware', active: true },
  { name: 'Placa de Vídeo Zotac GeForce RTX 4060 8GB White',  url: 'https://www.mercadolivre.com.br/p/MLB29892127', store: 'mercadolivre', category: 'hardware', active: true },
  { name: 'SSD Kingston A400 480GB SATA',                     url: 'https://www.mercadolivre.com.br/p/MLB51790900', store: 'mercadolivre', category: 'hardware', active: true },
  { name: 'Monitor Gamer Samsung Odyssey G32A 24"',           url: 'https://www.mercadolivre.com.br/p/MLB19821707', store: 'mercadolivre', category: 'hardware', active: true },
  { name: 'Monitor Gamer Samsung Odyssey 27" LS27BG400',      url: 'https://www.mercadolivre.com.br/p/MLB24545350', store: 'mercadolivre', category: 'hardware', active: true },

  // ── Smartphones / Tablets / TV / Áudio ────────────────────────────────────────
  { name: 'Apple iPhone 13 128GB Azul',                       url: 'https://www.mercadolivre.com.br/p/MLB18500846', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Apple iPhone 13 128GB Rosa',                       url: 'https://www.mercadolivre.com.br/p/MLB18500849', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Smartphone Samsung Galaxy S24 FE 256GB Grafite',   url: 'https://www.mercadolivre.com.br/p/MLB44665554', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Tablet Samsung Galaxy Tab A7 32GB',                url: 'https://www.mercadolivre.com.br/p/MLB22341580', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Smart TV TCL 43" FHD QLED Google TV',              url: 'https://www.mercadolivre.com.br/p/MLB50801479', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Caixa de Som JBL Charge 5 Camuflada',              url: 'https://www.mercadolivre.com.br/p/MLB25859499', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Fone de Ouvido Philips TAT1209 TWS Bluetooth',     url: 'https://www.mercadolivre.com.br/p/MLB63636595', store: 'mercadolivre', category: 'eletronicos', active: true },
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
