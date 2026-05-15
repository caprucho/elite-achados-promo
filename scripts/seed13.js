require('dotenv').config();
const { supabase } = require('../src/db/supabase');

// 31 produtos validados (de 40 testados). 9 pulados: catálogos ML sem
// vendedor ativo / winner (404) — TV Samsung QN90D, Xbox Series X, Switch OLED,
// iPad Mini 7, Galaxy S23, Galaxy S26 Ultra, Apple Watch Ultra 2, Apple Pencil,
// Galaxy Watch 7 Ultra Prata.
const PRODUCTS = [
  { name: "iPhone 16 Pro Max 512GB Titânio Preto", url: "https://www.mercadolivre.com.br/apple-iphone-16-pro-max-512-gb-titnio-preto/p/MLB40287863", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "Fone Bose QuietComfort Ultra Preto (2ª Geração)", url: "https://www.mercadolivre.com.br/fones-de-ouvido-bluetooth-bose-quietcomfort-ultra-de-2-geracopretos-e-pretos/p/MLB62911450", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "Smart TV LG OLED evo AI C5 4K 55\"", url: "https://www.mercadolivre.com.br/smart-tv-lg-oled-evo-ai-c5-55-polegadas-oled55c5psa-brilh/up/MLBU3333912446", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "Fone Bose QuietComfort SC Preto", url: "https://www.mercadolivre.com.br/bose-quietcomfort-sc-na-caixa-rega-preto/p/MLB46589363", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "Body Mist Sol de Janeiro Cheirosa 62 240ml", url: "https://www.mercadolivre.com.br/sol-de-janeiro-brazilian-crush-cheirosa-62-body-mist-fem-240ml/p/MLB24244613", store: "mercadolivre", category: "beleza", active: true },
  { name: "Samsung Galaxy A26 5G 256GB Branco", url: "https://www.mercadolivre.com.br/celular-samsung-galaxy-a26-5g-256gb-8gb-ram-cmera-de-50mp-ip67-tela-super-amoled-67-nfc-branco/p/MLB47436035", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "Sabão Líquido Omo Multiação 3L", url: "https://www.mercadolivre.com.br/sabo-liquido-omo-multiaco-poder-acelerador-3-l/p/MLB2050354955", store: "mercadolivre", category: "casa", active: true },
  { name: "Caixa de Som JBL Boombox 3 Preta", url: "https://www.mercadolivre.com.br/caixa-de-som-boombox-3-bluetooth-preta-jbl/p/MLB23163768", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "Câmera GoPro Hero 13 Black", url: "https://www.mercadolivre.com.br/gopro-hero13-black-cmera-de-aco-prova-dagua-10m-53k60-27mp-hypersmooth-60-gps-wi-fi-6-detecco-automatica-das-lentes-hb-series/p/MLB40284977", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "MacBook Air M3 13\" Space Gray", url: "https://www.mercadolivre.com.br/apple-macbook-air-13-inch-space-gray-13-apple-m3-8gb-de-ram/p/MLB37740034", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "Samsung Galaxy Z Flip 6 5G 512GB Verde", url: "https://www.mercadolivre.com.br/celular-samsung-galaxy-z-flip6-5g-512gb-12gb-ram-tela-67-cm-dupla-selfie-50mp-galaxy-ai-verde/p/MLB38130550", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "MacBook Air M5 13\"", url: "https://www.apple.com/br/shop/buy-mac/macbook-air", store: "apple", category: "eletronicos", active: true },
  { name: "MacBook Pro 14\"", url: "https://www.apple.com/br/shop/buy-mac/macbook-pro/14-polegadas", store: "apple", category: "eletronicos", active: true },
  { name: "iPad Pro M4 11\" 1TB Preto Espacial", url: "https://www.apple.com/br/shop/buy-ipad/ipad-pro/tela-de-11-polegadas-1tb-preto-espacial-wifi-vidro-convencional", store: "apple", category: "eletronicos", active: true },
  { name: "iPad Pro M4 11\" 256GB Preto Espacial", url: "https://www.apple.com/br/shop/buy-ipad/ipad-pro/tela-de-11-polegadas-256gb-preto-espacial-wifi-vidro-convencional", store: "apple", category: "eletronicos", active: true },
  { name: "iPhone 17 Pro Max 256GB Laranja-Cósmico", url: "https://www.apple.com/br/shop/buy-iphone/iphone-17-pro/tela-de-6,9-polegadas-256gb-laranja-c%C3%B3smico", store: "apple", category: "eletronicos", active: true },
  { name: "iPhone 17 Pro Max 256GB Prateado", url: "https://www.apple.com/br/shop/buy-iphone/iphone-17-pro/tela-de-6,9-polegadas-256gb-prateado", store: "apple", category: "eletronicos", active: true },
  { name: "iPhone 17 Pro 512GB Laranja-Cósmico", url: "https://www.apple.com/br/shop/buy-iphone/iphone-17-pro/tela-de-6,3-polegadas-512gb-laranja-c%C3%B3smico", store: "apple", category: "eletronicos", active: true },
  { name: "iMac 24\" M4 Verde 512GB", url: "https://www.apple.com/br/shop/buy-mac/imac/24-polegadas-verde-chip-m4-cpu-de-8-n%C3%BAcleos-gpu-de-8-n%C3%BAcleos-24-gb-mem%C3%B3ria-512gb-armazenamento-adaptador-para-montagem-vesa", store: "apple", category: "eletronicos", active: true },
  { name: "iMac 24\" M4 Azul 512GB", url: "https://www.apple.com/br/shop/buy-mac/imac/24-polegadas-blue-chip-m4-cpu-de-10-n%C3%BAcleos-gpu-de-10-n%C3%BAcleos-16-gb-mem%C3%B3ria-512gb-armazenamento-vidro-convencional-base", store: "apple", category: "eletronicos", active: true },
  { name: "Mac mini M4 256GB", url: "https://www.apple.com/br/shop/buy-mac/mac-mini/chip-m4-cpu-de-10-n%C3%BAcleos-gpu-de-10-n%C3%BAcleos-16-gb-mem%C3%B3ria-256gb-armazenamento", store: "apple", category: "eletronicos", active: true },
  { name: "Mac mini M4 512GB", url: "https://www.apple.com/br/shop/buy-mac/mac-mini/chip-m4-cpu-de-10-n%C3%BAcleos-gpu-de-10-n%C3%BAcleos-16-gb-mem%C3%B3ria-512gb-armazenamento", store: "apple", category: "eletronicos", active: true },
  { name: "Apple Watch Series 11 46mm GPS Alumínio Space Gray", url: "https://www.apple.com/br/shop/buy-watch/apple-watch/46mm-gps-space-gray-alum%C3%ADnio-black-pulseira-esportiva", store: "apple", category: "eletronicos", active: true },
  { name: "Apple AirTag", url: "https://www.apple.com/br/shop/buy-airtag/airtag", store: "apple", category: "eletronicos", active: true },
  { name: "iPhone 17", url: "https://www.apple.com/br/shop/buy-iphone/iphone-17", store: "apple", category: "eletronicos", active: true },
  { name: "Notebook Gamer Razer Blade 16 i9 RTX 4080 OLED", url: "https://www.kabum.com.br/produto/571235/razer-blade-16-intel-14-geracao-i9-14900hx-rtx-4080-tela-16-oled-ssd-1tb-nvme-ram-32gb", store: "kabum", category: "hardware", active: true },
  { name: "Teclado Mecânico SteelSeries Apex PRO RGB", url: "https://www.kabum.com.br/produto/115327/teclado-mecanico-gamer-steelseries-apex-pro-rgb-switch-omnipoint-us-preto-64626", store: "kabum", category: "hardware", active: true },
  { name: "PC Gamer AMD Ryzen 5 8600G Vega 7", url: "https://www.kabum.com.br/produto/543105/pc-gamer-amd-am5-ryzen-5-8600g-16gb-ddr5-radeon-vega-7-integrado-ssd-240gb-500w-80-plus-nli86576", store: "kabum", category: "hardware", active: true },
  { name: "Case Externo Wavlink USB-C 40Gbps SSD M.2 NVMe", url: "https://www.kabum.com.br/produto/897532/case-gabinete-externo-wavlink-usb-c-40gbps-ssd-p-m2-nvme", store: "kabum", category: "hardware", active: true },
  { name: "PC Gamer AlphaPCs Ryzen 9 RTX 4080 Super", url: "https://www.kabum.com.br/produto/584989/computador-alphapcs-amd-ryzen-9-32gb-ram-2x16gb-ddr5-placa-rtx-4080-super-16gb-ssd-1tb-m2-fonte-750w-windows-11-pro", store: "kabum", category: "hardware", active: true },
  { name: "PC Gamer Intel Core i7-14700 128GB DDR5", url: "https://www.kabum.com.br/produto/614941/pc-top-intel-core-i7-14700-b760m-aorus-elite-128gb-ddr5-fury-m-2-nvme-1tb-fonte-700w-tt", store: "kabum", category: "hardware", active: true },
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
