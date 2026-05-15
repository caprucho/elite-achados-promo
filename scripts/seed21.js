require('dotenv').config();
const { supabase } = require('../src/db/supabase');

// 29 produtos validados (de 36 testados). Maioria já cadastrada em seeds
// anteriores — upsert por URL apenas atualiza. Produto novo desta leva:
// Aspirador Dyson V12 Detect Slim. Falhas: 3 Fast Shop (URLs 404), 3 ML
// sem winner, 1 Amazon (ASIN da Fechadura IFR 1001 não existe).
const PRODUCTS = [
  { name: "PC Gamer Neologic AMD Ryzen 5 8600G 32GB", url: "https://www.kabum.com.br/produto/543491/pc-gamer-neologic-amd-am5-ryzen-5-8600g-32gb-ram-ddr5-radeon-vega-7-integrado-ssd-240gb-fonte-500w-windows-11-nli86617", store: "kabum", category: "hardware", active: true },
  { name: "Notebook Gamer Razer Blade 16 i9 RTX 4080", url: "https://www.kabum.com.br/produto/571235/razer-blade-16-intel-14-geracao-i9-14900hx-rtx-4080-tela-16-oled-ssd-1tb-nvme-ram-32gb", store: "kabum", category: "eletronicos", active: true },
  { name: "Teclado Mecânico SteelSeries Apex PRO RGB", url: "https://www.kabum.com.br/produto/115327/teclado-mecanico-gamer-steelseries-apex-pro-rgb-switch-omnipoint-us-preto-64626", store: "kabum", category: "hardware", active: true },
  { name: "Mouse Gamer Logitech G502 X Plus Preto", url: "https://www.kabum.com.br/produto/388058/mouse-gamer-sem-fio-logitech-g502-x-plus-rgb-25600-dpi-13-botoes-switch-preto-910-006161", store: "kabum", category: "hardware", active: true },
  { name: "Mouse Razer Viper V3 Pro c/ Dongle 8K", url: "https://www.kabum.com.br/produto/618927/mouse-gamer-razer-viper-v3-pro-35000-dpi-54g-ultraleve-com-dongle-8k-95hr-de-bateria-recarregavel-preto", store: "kabum", category: "hardware", active: true },
  { name: "Case Externo Wavlink USB-C 40Gbps SSD M.2 NVMe", url: "https://www.kabum.com.br/produto/897532/case-gabinete-externo-wavlink-usb-c-40gbps-ssd-p-m2-nvme", store: "kabum", category: "hardware", active: true },
  { name: "PC Gamer AlphaPCs Ryzen 9 RTX 4080 Super", url: "https://www.kabum.com.br/produto/584989/computador-alphapcs-amd-ryzen-9-32gb-ram-2x16gb-ddr5-placa-rtx-4080-super-16gb-ssd-1tb-m2-fonte-750w-windows-11-pro", store: "kabum", category: "hardware", active: true },
  { name: "PC Gamer Intel Core i7-14700 128GB DDR5", url: "https://www.kabum.com.br/produto/614941/pc-top-intel-core-i7-14700-b760m-aorus-elite-128gb-ddr5-fury-m-2-nvme-1tb-fonte-700w-tt", store: "kabum", category: "hardware", active: true },
  { name: "Mac mini M4 256GB", url: "https://www.apple.com/br/shop/buy-mac/mac-mini/chip-m4-cpu-de-10-n%C3%BAcleos-gpu-de-10-n%C3%BAcleos-16-gb-mem%C3%B3ria-256gb-armazenamento", store: "apple", category: "eletronicos", active: true },
  { name: "iMac M4 24\" Verde 512GB", url: "https://www.apple.com/br/shop/buy-mac/imac/24-polegadas-verde-chip-m4-cpu-de-8-n%C3%BAcleos-gpu-de-8-n%C3%BAcleos-24-gb-mem%C3%B3ria-512gb-armazenamento-adaptador-para-montagem-vesa", store: "apple", category: "eletronicos", active: true },
  { name: "iMac M4 24\" Azul 512GB", url: "https://www.apple.com/br/shop/buy-mac/imac/24-polegadas-blue-chip-m4-cpu-de-10-n%C3%BAcleos-gpu-de-10-n%C3%BAcleos-16-gb-mem%C3%B3ria-512gb-armazenamento-vidro-convencional-base", store: "apple", category: "eletronicos", active: true },
  { name: "Apple iPhone 17 256GB Azul-névoa", url: "https://www.apple.com/br/shop/buy-iphone/iphone-17", store: "apple", category: "eletronicos", active: true },
  { name: "Apple AirTag", url: "https://www.apple.com/br/shop/buy-airtag/airtag", store: "apple", category: "eletronicos", active: true },
  { name: "Apple Watch Series 11 46mm GPS Space Gray", url: "https://www.apple.com/br/shop/buy-watch/apple-watch/46mm-gps-space-gray-alum%C3%ADnio-black-pulseira-esportiva", store: "apple", category: "eletronicos", active: true },
  { name: "Apple iPhone 17 Pro 512GB Laranja-Cósmico", url: "https://www.apple.com/br/shop/buy-iphone/iphone-17-pro/tela-de-6,3-polegadas-512gb-laranja-c%C3%B3smico", store: "apple", category: "eletronicos", active: true },
  { name: "Smart TV LG OLED evo AI C5 48\"", url: "https://site.fastshop.com.br/smart--lg-oled-evo-ai-c5-48-polegadas-oled48c5psa-116388/p", store: "fastshop", category: "eletronicos", active: true },
  { name: "Aspirador de Pó Sem Fio Dyson V12 Detect Slim", url: "https://site.fastshop.com.br/dyson-v12-detect-slim-aspirador-de-po-sem-fio---bivolt-95097/p", store: "fastshop", category: "casa", active: true },
  { name: "Limpadora de Pisos Sem Fio WAP Multi Floor", url: "https://loja.wap.ind.br/limpadora-de-pisos-sem-fio-wap-multi-floor/p", store: "wap", category: "casa", active: true },
  { name: "Vassoura WAP MOP Spray com Reservatório", url: "https://loja.wap.ind.br/limpador-wap-vassoura-mop-spray-com-reservatorio/p", store: "wap", category: "casa", active: true },
  { name: "Vaporizador Portátil WAP Wapore Fast 1250", url: "https://loja.wap.ind.br/vaporizador-portatil-wap-wapore-fast-1250/p", store: "wap", category: "casa", active: true },
  { name: "Desobstruidora WAP Premium Ultra 2600", url: "https://loja.wap.ind.br/desobstruidora-de-alta-pressao-1900w-2400psi-wap-premium-ultra-2600/p", store: "wap", category: "casa", active: true },
  { name: "Climatizador e Umidificador WAP Air Protect", url: "https://loja.wap.ind.br/climatizador-air-protect/p", store: "wap", category: "casa", active: true },
  { name: "Robô Aspirador de Pó WAP Robot W100", url: "https://loja.wap.ind.br/robo-aspirador-de-po-wap-robot-w100/p", store: "wap", category: "casa", active: true },
  { name: "Robô Aspirador Inteligente WAP Robot W3000", url: "https://loja.wap.ind.br/robot-w3000/p", store: "wap", category: "casa", active: true },
  { name: "Tablet Samsung Galaxy Tab S9 FE 128GB Cinza Escuro", url: "https://www.mercadolivre.com.br/samsung-galaxy-tab-s9-fe-128-gb-cinza-escuro-excelente-recondicionado/p/MLB2010314141", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "Caixa de Som JBL Boombox 3 Squad Camuflada", url: "https://www.mercadolivre.com.br/jbl-boombox-3-bluetooth-squad-jblboombox3squadbr/p/MLB46273431", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "Fone Bose QuietComfort SC Preto", url: "https://www.mercadolivre.com.br/bose-quietcomfort-sc-na-caixa-rega-preto/p/MLB46589363", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "Kindle Colorsoft 16GB", url: "https://www.amazon.com.br/dp/B0CX8MT2M2", store: "amazon", category: "eletronicos", active: true },
  { name: "Kindle 11ª Geração Verde Matcha", url: "https://www.amazon.com.br/dp/B0CP31QS6R", store: "amazon", category: "eletronicos", active: true },
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

  console.log(`\n${data.length} produto(s) inseridos/atualizados.`);
  process.exit(0);
}

main();
