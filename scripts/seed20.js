require('dotenv').config();
const { supabase } = require('../src/db/supabase');

// 24 produtos descobertos via API ML. Descartados: 7 peças de reposição
// (sacos de aspirador, torneira/emenda de purificador, cabo de força,
// controle remoto, carregador de notebook), marcas obscuras (Inova, câmeras
// genéricas), TV sem modelo e duplicatas exatas.
const PRODUCTS = [
  // ── Casa ──────────────────────────────────────────────────────────────────────
  { name: 'Micro-ondas Panasonic 21L Branco NN-ST25',          url: 'https://www.mercadolivre.com.br/p/MLB17325969', store: 'mercadolivre', category: 'casa', active: true },
  { name: 'Micro-ondas Panasonic 27L Preto NN-ST54',           url: 'https://www.mercadolivre.com.br/p/MLB65836536', store: 'mercadolivre', category: 'casa', active: true },
  { name: 'Ferro de Passar a Vapor Black+Decker FX3100',       url: 'https://www.mercadolivre.com.br/p/MLB25010786', store: 'mercadolivre', category: 'casa', active: true },
  { name: 'Ferro de Passar a Vapor Black+Decker AJ2200',       url: 'https://www.mercadolivre.com.br/p/MLB23134470', store: 'mercadolivre', category: 'casa', active: true },

  // ── Hardware / Periféricos ────────────────────────────────────────────────────
  { name: 'Teclado Mecânico Gamer Redragon Draconic Pro 60% RGB', url: 'https://www.mercadolivre.com.br/p/MLB22726881', store: 'mercadolivre', category: 'hardware', active: true },
  { name: 'Kit Gamer Redragon S107 Teclado + Mouse + Mousepad', url: 'https://www.mercadolivre.com.br/p/MLB63498774', store: 'mercadolivre', category: 'hardware', active: true },
  { name: 'Headset Gamer Sem Fio Logitech G435 LIGHTSPEED Preto', url: 'https://www.mercadolivre.com.br/p/MLB20751588', store: 'mercadolivre', category: 'hardware', active: true },
  { name: 'Headset Gamer Sem Fio Logitech G435 LIGHTSPEED Azul', url: 'https://www.mercadolivre.com.br/p/MLB19474690', store: 'mercadolivre', category: 'hardware', active: true },
  { name: 'HD Externo Seagate 2TB STKM2000400',                url: 'https://www.mercadolivre.com.br/p/MLB34112622', store: 'mercadolivre', category: 'hardware', active: true },
  { name: 'HD Externo Seagate Game Drive PlayStation 2TB',     url: 'https://www.mercadolivre.com.br/p/MLB34351730', store: 'mercadolivre', category: 'hardware', active: true },
  { name: 'Processador AMD Ryzen 5 5600 AM4',                  url: 'https://www.mercadolivre.com.br/p/MLB23888602', store: 'mercadolivre', category: 'hardware', active: true },

  // ── Eletrônicos / Smartphones / Áudio ─────────────────────────────────────────
  { name: 'Smart TV LG UHD 4K UT80 50" 50UT8000',              url: 'https://www.mercadolivre.com.br/p/MLB45987581', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Apple iPhone 14 128GB Amarelo',                     url: 'https://www.mercadolivre.com.br/p/MLB24156591', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Apple iPhone 14 128GB Azul',                        url: 'https://www.mercadolivre.com.br/p/MLB19615339', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Smartphone Xiaomi 15 5G 16GB/512GB Preto',          url: 'https://www.mercadolivre.com.br/p/MLB65214612', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Smartphone Motorola One Vision 128GB Bronze',       url: 'https://www.mercadolivre.com.br/p/MLB14982892', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Smartphone Motorola Moto G53 5G 128GB Grafite',     url: 'https://www.mercadolivre.com.br/p/MLB22831224', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Caixa de Som JBL PartyBox Encore Essential Preta',  url: 'https://www.mercadolivre.com.br/p/MLB44799754', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Echo Pop Smart Speaker Alexa Branco',               url: 'https://www.mercadolivre.com.br/p/MLB37018118', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Echo Pop Smart Speaker Alexa Preto',                url: 'https://www.mercadolivre.com.br/p/MLB37234221', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Smartwatch Xiaomi Redmi Watch 5 Active',            url: 'https://www.mercadolivre.com.br/p/MLB43271436', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Smartwatch Xiaomi Redmi Watch 5 Lite GPS Branco',   url: 'https://www.mercadolivre.com.br/p/MLB65016737', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Soundbar LG 5.1.2 Canais 520W SP9A',                url: 'https://www.mercadolivre.com.br/p/MLB21402620', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Notebook Samsung Galaxy Book4 Core i3 8GB 256GB',   url: 'https://www.mercadolivre.com.br/p/MLB47310642', store: 'mercadolivre', category: 'eletronicos', active: true },
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
