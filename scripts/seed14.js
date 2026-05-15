require('dotenv').config();
const { supabase } = require('../src/db/supabase');

// 24 produtos validados (de 34 testados). 10 pulados: 7 ML sem winner (404),
// Fast Shop TV 65" (404) + Kindle Paperwhite (OutOfStock), WAP Ousada (URL de
// categoria, não de produto).
const PRODUCTS = [
  { name: "iPhone 17 Pro 512GB Laranja-Cósmico", url: "https://www.apple.com/br/shop/buy-iphone/iphone-17-pro/tela-de-6,3-polegadas-512gb-laranja-c%C3%B3smico", store: "apple", category: "eletronicos", active: true },
  { name: "Mac mini M4 Pro 512GB", url: "https://www.apple.com/br/shop/buy-mac/mac-mini/chip-m4-cpu-de-10-n%C3%BAcleos-gpu-de-10-n%C3%BAcleos-16-gb-mem%C3%B3ria-512gb-armazenamento", store: "apple", category: "eletronicos", active: true },
  { name: "Apple AirTag", url: "https://www.apple.com/br/shop/buy-airtag/airtag", store: "apple", category: "eletronicos", active: true },
  { name: "iPad Pro 11\" M4 1TB Preto Espacial", url: "https://www.apple.com/br/shop/buy-ipad/ipad-pro/tela-de-11-polegadas-1tb-preto-espacial-wifi-vidro-convencional", store: "apple", category: "eletronicos", active: true },
  { name: "MacBook Air M5 13\"", url: "https://www.apple.com/br/shop/buy-mac/macbook-air/13-polegadas", store: "apple", category: "eletronicos", active: true },
  { name: "Samsung Galaxy S25 5G 256GB Azul Claro", url: "https://www.mercadolivre.com.br/samsung-galaxy-s25-5g-256gb-12gb-cmera-tripla-azul-claro/p/MLB45513356", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "Console Xbox Series X 1TB Standard Lacrado", url: "https://www.mercadolivre.com.br/xbox-series-x-1tb-standard-original-lacrado-com-nota-fiscal-garantia-de-1-ano/up/MLBU1807948095", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "Caixa de Som JBL Boombox 3 Squad Camuflada", url: "https://www.mercadolivre.com.br/jbl-boombox-3-bluetooth-squad-jblboombox3squadbr/p/MLB46273431", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "Caixa de Som JBL Boombox 3 Wi-Fi", url: "https://www.mercadolivre.com.br/caixa-de-som-bluetooth-jbl-boombox-3-wi-fi/p/MLB44814356", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "Smart TV LG OLED evo AI C5 4K 55\"", url: "https://www.mercadolivre.com.br/smart-tv-lg-oled-evo-ai-c5-4k-55-polegadas-2025-processador-9-ai-ger-8-webos-25-intensificador-de-brilho/p/MLB53613524", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "Amazon Echo Dot 5ª Geração Glacier White", url: "https://www.mercadolivre.com.br/echo-dot-5-geraco-glacier-white-amazon/p/MLB19757119", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "Mouse Gamer Logitech G502 X RGB Branco", url: "https://www.kabum.com.br/produto/388055/mouse-gamer-logitech-g502-x-rgb-25600-dpi-13-botoes-switch-hibrido-branco-910-006145", store: "kabum", category: "hardware", active: true },
  { name: "Teclado Mecânico SteelSeries Apex PRO RGB", url: "https://www.kabum.com.br/produto/115327/teclado-mecanico-gamer-steelseries-apex-pro-rgb-switch-omnipoint-us-preto-64626", store: "kabum", category: "hardware", active: true },
  { name: "PC Gamer Neologic AMD Ryzen 5 8600G 32GB", url: "https://www.kabum.com.br/produto/543491/pc-gamer-neologic-amd-am5-ryzen-5-8600g-32gb-ram-ddr5-radeon-vega-7-integrado-ssd-240gb-fonte-500w-windows-11-nli86617", store: "kabum", category: "hardware", active: true },
  { name: "PC Gamer Intel Core i7-14700 128GB DDR5", url: "https://www.kabum.com.br/produto/614941/pc-top-intel-core-i7-14700-b760m-aorus-elite-128gb-ddr5-fury-m-2-nvme-1tb-fonte-700w-tt", store: "kabum", category: "hardware", active: true },
  { name: "Notebook Gamer Razer Blade 16 i9 RTX 4080", url: "https://www.kabum.com.br/produto/571235/razer-blade-16-intel-14-geracao-i9-14900hx-rtx-4080-tela-16-oled-ssd-1tb-nvme-ram-32gb", store: "kabum", category: "hardware", active: true },
  { name: "Case Externo Wavlink USB-C 40Gbps SSD M.2 NVMe", url: "https://www.kabum.com.br/produto/897532/case-gabinete-externo-wavlink-usb-c-40gbps-ssd-p-m2-nvme", store: "kabum", category: "hardware", active: true },
  { name: "PC Gamer AlphaPCs Ryzen 9 RTX 4080 Super", url: "https://www.kabum.com.br/produto/584989/computador-alphapcs-amd-ryzen-9-32gb-ram-2x16gb-ddr5-placa-rtx-4080-super-16gb-ssd-1tb-m2-fonte-750w-windows-11-pro", store: "kabum", category: "hardware", active: true },
  { name: "Mouse Gamer Sem Fio Razer Viper V3 Pro Preto", url: "https://www.kabum.com.br/produto/921184/mouse-gamer-sem-fio-razer-viper-v3-pro-35000-dpi-preto-rz01-05120100-r3u1", store: "kabum", category: "hardware", active: true },
  { name: "Smart TV LG OLED evo AI C5 48\"", url: "https://site.fastshop.com.br/smart--lg-oled-evo-ai-c5-48-polegadas-oled48c5psa-116388/p", store: "fastshop", category: "eletronicos", active: true },
  { name: "Smartphone Samsung Galaxy S26 Ultra 5G 256GB", url: "https://site.fastshop.com.br/smartphone-samsung-galaxy-s26-ultra-5g-tela-6-9--256gb-camera-quadrupla-200mp-160410/p", store: "fastshop", category: "eletronicos", active: true },
  { name: "Robô Aspirador de Pó WAP Robot W100", url: "https://loja.wap.ind.br/robo-aspirador-de-po-wap-robot-w100/p", store: "wap", category: "casa", active: true },
  { name: "Robô Aspirador Inteligente WAP Robot W3000", url: "https://loja.wap.ind.br/robot-w3000/p", store: "wap", category: "casa", active: true },
  { name: "Kindle Paperwhite 16GB 12ª Geração", url: "https://www.amazon.com.br/dp/B0CFPL6CFY", store: "amazon", category: "eletronicos", active: true },
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
