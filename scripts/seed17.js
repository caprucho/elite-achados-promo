require('dotenv').config();
const { supabase } = require('../src/db/supabase');

// 26 produtos descobertos via API de busca do ML (catálogos com vendedor ativo).
// Foco: notebooks, eletrodomésticos, periféricos, smartphones — categorias
// pedidas. Descartados da descoberta: 2 copos de liquidificador (peça de
// reposição), 1 micro-ondas duplicado, 1 anúncio combo de 2 TVs.
const PRODUCTS = [
  // ── Notebooks ─────────────────────────────────────────────────────────────────
  { name: 'Notebook Dell Inspiron 15',                       url: 'https://www.mercadolivre.com.br/p/MLB22253795', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Notebook Dell Inspiron 15 3000 Cinza Escuro',     url: 'https://www.mercadolivre.com.br/p/MLB27079016', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Notebook Dell Inspiron 3511 Preto',               url: 'https://www.mercadolivre.com.br/p/MLB47293132', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Notebook Lenovo IdeaPad 5',                       url: 'https://www.mercadolivre.com.br/p/MLB23839526', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Notebook Acer Aspire 5 A515-43',                  url: 'https://www.mercadolivre.com.br/p/MLB24532121', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Notebook Samsung Galaxy Book',                    url: 'https://www.mercadolivre.com.br/p/MLB24541892', store: 'mercadolivre', category: 'eletronicos', active: true },

  // ── Eletrodomésticos ──────────────────────────────────────────────────────────
  { name: 'Air Fryer Mondial AF-31 3.5L Preta',              url: 'https://www.mercadolivre.com.br/p/MLB40490221', store: 'mercadolivre', category: 'casa', active: true },
  { name: 'Air Fryer Mondial AF-30',                         url: 'https://www.mercadolivre.com.br/p/MLB25874812', store: 'mercadolivre', category: 'casa', active: true },
  { name: 'Micro-ondas Electrolux MA30S Prata 20L',          url: 'https://www.mercadolivre.com.br/p/MLB6051509',  store: 'mercadolivre', category: 'casa', active: true },
  { name: 'Cafeteira Nespresso CitiZ Preta',                 url: 'https://www.mercadolivre.com.br/p/MLB21819013', store: 'mercadolivre', category: 'casa', active: true },
  { name: 'Cafeteira Nespresso CitiZ Branca',                url: 'https://www.mercadolivre.com.br/p/MLB15317112', store: 'mercadolivre', category: 'casa', active: true },
  { name: 'Batedeira Planetária KitchenAid Artisan 4,8L Hibiscus', url: 'https://www.mercadolivre.com.br/p/MLB25799078', store: 'mercadolivre', category: 'casa', active: true },
  { name: 'Batedeira Planetária Philco PHP500B',             url: 'https://www.mercadolivre.com.br/p/MLB9770331',  store: 'mercadolivre', category: 'casa', active: true },

  // ── Periféricos / Hardware ────────────────────────────────────────────────────
  { name: 'Headset Gamer HyperX CloudX Stinger 2 Xbox Branco', url: 'https://www.mercadolivre.com.br/p/MLB34103818', store: 'mercadolivre', category: 'hardware', active: true },
  { name: 'Headset Gamer HyperX Cloud Stinger 2 Sem Fio Preto', url: 'https://www.mercadolivre.com.br/p/MLB23444052', store: 'mercadolivre', category: 'hardware', active: true },
  { name: 'SSD 1TB NVMe M.2 2280 Pcyes',                     url: 'https://www.mercadolivre.com.br/p/MLB46166592', store: 'mercadolivre', category: 'hardware', active: true },
  { name: 'SSD 1TB NVMe M.2 2280 Gen3 Ioway',                url: 'https://www.mercadolivre.com.br/p/MLB28674491', store: 'mercadolivre', category: 'hardware', active: true },

  // ── Smartphones ───────────────────────────────────────────────────────────────
  { name: 'Smartphone Motorola Moto G15 128GB Laranja',      url: 'https://www.mercadolivre.com.br/p/MLB61494695', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Smartphone Motorola Moto G52 128GB Branco',       url: 'https://www.mercadolivre.com.br/p/MLB19469787', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Smartphone Motorola Moto E13 32GB Grafite',       url: 'https://www.mercadolivre.com.br/p/MLB24551737', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Smartphone Xiaomi Redmi 13 Azul-marinho',         url: 'https://www.mercadolivre.com.br/p/MLB41629336', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Smartphone Xiaomi Redmi Note 13 256GB Verde Claro', url: 'https://www.mercadolivre.com.br/p/MLB40062573', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Smartphone Xiaomi Redmi 9C 32GB Azul',            url: 'https://www.mercadolivre.com.br/p/MLB47326105', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Smartphone Samsung Galaxy S23 256GB Preto',       url: 'https://www.mercadolivre.com.br/p/MLB39957733', store: 'mercadolivre', category: 'eletronicos', active: true },

  // ── Tablet / TV ───────────────────────────────────────────────────────────────
  { name: 'Tablet Samsung Galaxy Tab A9 Preto',              url: 'https://www.mercadolivre.com.br/p/MLB29171759', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Smart TV TCL 50" 4K Google TV',                   url: 'https://www.mercadolivre.com.br/p/MLB24433253', store: 'mercadolivre', category: 'eletronicos', active: true },
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
