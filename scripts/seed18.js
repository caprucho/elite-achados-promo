require('dotenv').config();
const { supabase } = require('../src/db/supabase');

// 19 produtos descobertos via API ML — eletrodomésticos, periféricos, áudio.
// Descartados: peças de reposição (controle, capa, capacitor, base motor,
// cases de mouse, pulseira), marcas obscuras, soundbars com nome ambíguo
// e duplicatas exatas do mesmo catálogo ML.
const PRODUCTS = [
  // ── Eletrodomésticos / Casa ───────────────────────────────────────────────────
  { name: 'Ar Condicionado Split Inverter Philco 12000 BTUs Frio', url: 'https://www.mercadolivre.com.br/p/MLB38510257', store: 'mercadolivre', category: 'casa', active: true },
  { name: 'Ventilador de Coluna Mondial Super Turbo VTX-40',       url: 'https://www.mercadolivre.com.br/p/MLB56339568', store: 'mercadolivre', category: 'casa', active: true },
  { name: 'Ventilador de Coluna Mondial Turbo NVT-40C',            url: 'https://www.mercadolivre.com.br/p/MLB56291202', store: 'mercadolivre', category: 'casa', active: true },
  { name: 'Fogão 4 Bocas Atlas Mônaco Top Mesa Inox',              url: 'https://www.mercadolivre.com.br/p/MLB29219277', store: 'mercadolivre', category: 'casa', active: true },
  { name: 'Fogão 4 Bocas Atlas Agile Automático Mesa Inox',        url: 'https://www.mercadolivre.com.br/p/MLB66785336', store: 'mercadolivre', category: 'casa', active: true },
  { name: 'Cooktop Indução 2 Bocas Oster Preto',                   url: 'https://www.mercadolivre.com.br/p/MLB18711680', store: 'mercadolivre', category: 'casa', active: true },
  { name: 'Cooktop Indução Tronos IF7010B1 7000W',                 url: 'https://www.mercadolivre.com.br/p/MLB63585746', store: 'mercadolivre', category: 'casa', active: true },

  // ── Periféricos / Hardware ────────────────────────────────────────────────────
  { name: 'Monitor LG 24" Full HD',                                url: 'https://www.mercadolivre.com.br/p/MLB44799005', store: 'mercadolivre', category: 'hardware', active: true },
  { name: 'Roteador TP-Link AX3000 Wi-Fi 6 Dual Band',             url: 'https://www.mercadolivre.com.br/p/MLB36553978', store: 'mercadolivre', category: 'hardware', active: true },
  { name: 'Processador Intel Core i5-14400F LGA 1700',             url: 'https://www.mercadolivre.com.br/p/MLB67843053', store: 'mercadolivre', category: 'hardware', active: true },
  { name: 'Processador Intel Core i5-11400',                       url: 'https://www.mercadolivre.com.br/p/MLB63438757', store: 'mercadolivre', category: 'hardware', active: true },
  { name: 'Webcam Logitech C920 Full HD 1080p',                    url: 'https://www.mercadolivre.com.br/p/MLB21848979', store: 'mercadolivre', category: 'hardware', active: true },

  // ── Eletrônicos / Áudio / Wearables ───────────────────────────────────────────
  { name: 'Smartwatch Amazfit Bip 5 Preto',                        url: 'https://www.mercadolivre.com.br/p/MLB34175947', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Smartwatch Amazfit GTS 2e Moss Green',                  url: 'https://www.mercadolivre.com.br/p/MLB17709111', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Smartwatch Apple Watch Series 4 44mm',                  url: 'https://www.mercadolivre.com.br/p/MLB47306330', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Impressora Multifuncional Epson EcoTank L3250',         url: 'https://www.mercadolivre.com.br/p/MLB34847250', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Fone JBL Tune 770NC Bluetooth ANC',                     url: 'https://www.mercadolivre.com.br/p/MLB47527709', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Fone de Ouvido Bluetooth JBL Tune 510 Branco',          url: 'https://www.mercadolivre.com.br/p/MLB35469993', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Caixa de Som Bluetooth JBL Go 4 Branca',                url: 'https://www.mercadolivre.com.br/p/MLB65441450', store: 'mercadolivre', category: 'eletronicos', active: true },
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
