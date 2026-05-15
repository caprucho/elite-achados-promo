require('dotenv').config();
const { supabase } = require('../src/db/supabase');

// 27 produtos validados (de 37 testados). Novos desta leva: Razer Viper V3
// Pro SE e Logitech G502 X Plus Branco — o resto já estava cadastrado
// (upsert por URL apenas atualiza). Falhas: 3 ML sem winner, 2 Fast Shop
// 404, 1 WAP (URL de categoria), 4 Amazon com ASINs inexistentes
// (Fechadura IFR 1001, Stanley, Bioré, Neutrogena).
const PRODUCTS = [
  { name: "iPhone 17 Pro 512GB Laranja-Cósmico", url: "https://www.apple.com/br/shop/buy-iphone/iphone-17-pro/tela-de-6,3-polegadas-512gb-laranja-c%C3%B3smico", store: "apple", category: "eletronicos", active: true },
  { name: "iPad Pro M4 11\" 1TB Preto Espacial", url: "https://www.apple.com/br/shop/buy-ipad/ipad-pro/tela-de-11-polegadas-1tb-preto-espacial-wifi-vidro-convencional", store: "apple", category: "eletronicos", active: true },
  { name: "Apple Watch Series 11 46mm GPS Space Gray", url: "https://www.apple.com/br/shop/buy-watch/apple-watch/46mm-gps-space-gray-alum%C3%ADnio-black-pulseira-esportiva", store: "apple", category: "eletronicos", active: true },
  { name: "Apple AirTag", url: "https://www.apple.com/br/shop/buy-airtag/airtag", store: "apple", category: "eletronicos", active: true },
  { name: "Processador AMD Ryzen 7 9800X3D", url: "https://www.kabum.com.br/produto/662405/processador-amd-ryzen-7-9800x3d-cache-8mb-8-nucleos-16-threads-am5-100-100001084wof", store: "kabum", category: "hardware", active: true },
  { name: "Mouse Gamer Sem Fio Razer Viper V3 Pro SE", url: "https://www.kabum.com.br/produto/1012564/mouse-gamer-sem-fio-razer-viper-v3-pro-se-1000hz-sensor-35k-ultra-leve", store: "kabum", category: "hardware", active: true },
  { name: "Mouse Gamer Sem Fio Logitech G502 X Plus Branco", url: "https://www.kabum.com.br/produto/388059/mouse-gamer-sem-fio-logitech-g502-x-plus-rgb-25600-dpi-13-botoes-switch-branco-910-006170", store: "kabum", category: "hardware", active: true },
  { name: "Teclado Mecânico SteelSeries Apex PRO RGB", url: "https://www.kabum.com.br/produto/115327/teclado-mecanico-gamer-steelseries-apex-pro-rgb-switch-omnipoint-us-preto-64626", store: "kabum", category: "hardware", active: true },
  { name: "PC Gamer AlphaPCs Ryzen 9 RTX 4080 Super", url: "https://www.kabum.com.br/produto/584989/computador-alphapcs-amd-ryzen-9-32gb-ram-2x16gb-ddr5-placa-rtx-4080-super-16gb-ssd-1tb-m2-fonte-750w-windows-11-pro", store: "kabum", category: "hardware", active: true },
  { name: "Case Externo Wavlink USB-C 40Gbps SSD M.2 NVMe", url: "https://www.kabum.com.br/produto/897532/case-gabinete-externo-wavlink-usb-c-40gbps-ssd-p-m2-nvme", store: "kabum", category: "hardware", active: true },
  { name: "Apple iPhone 16 Pro 128GB Titânio Branco", url: "https://www.mercadolivre.com.br/apple-iphone-16-pro-128-gb-titnio-branco/p/MLB40287849", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "Samsung Galaxy S26 Ultra 5G 512GB Branco", url: "https://www.mercadolivre.com.br/celular-samsung-galaxy-s26-ultra-5g-512gb-12gb-ram-cmera-quadrupla-tela-grande-de-69-branco/p/MLB65503988", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "Samsung Galaxy S25 5G 256GB Azul Claro", url: "https://www.mercadolivre.com.br/samsung-galaxy-s25-5g-256gb-12gb-cmera-tripla-azul-claro/p/MLB45513356", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "Samsung Galaxy Z Flip 6 5G 512GB Verde", url: "https://www.mercadolivre.com.br/celular-samsung-galaxy-z-flip6-5g-512gb-12gb-ram-tela-67-cm-dupla-selfie-50mp-galaxy-ai-verde/p/MLB38130550", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "Motorola Razr 50 Ultra 512GB Verde Primavera", url: "https://www.mercadolivre.com.br/motorola-razr-50-ultra-verde-primavera-512-gb-12-gb/p/MLB40194288", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "Apple Watch Ultra 2 49mm Oceano Azul", url: "https://www.mercadolivre.com.br/apple-watch-ultra-2-gps-cellular-caixa-de-titnio-49-mm-pulseira-oceano-azul/p/MLB27594644", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "Console Xbox Series X 1TB Branco", url: "https://www.mercadolivre.com.br/console-xbox-series-x-1-tb-branco-c-controle/p/MLB43535812", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "Console Nintendo Switch OLED Standard Branco", url: "https://www.mercadolivre.com.br/nintendo-switch-oled-64gb-standard-com-joy-con-branco/p/MLB31000132", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "Caixa de Som JBL Boombox 3 Squad Camuflada", url: "https://www.mercadolivre.com.br/jbl-boombox-3-bluetooth-squad-jblboombox3squadbr/p/MLB46273431", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "Caixa de Som JBL Boombox 3 Wi-Fi", url: "https://www.mercadolivre.com.br/caixa-de-som-bluetooth-jbl-boombox-3-wi-fi/p/MLB44814356", store: "mercadolivre", category: "eletronicos", active: true },
  { name: "Smart TV LG OLED evo AI C5 48\"", url: "https://site.fastshop.com.br/smart--lg-oled-evo-ai-c5-48-polegadas-oled48c5psa-116388/p", store: "fastshop", category: "eletronicos", active: true },
  { name: "Refrigerador Samsung Bespoke 809L Inox Look", url: "https://site.fastshop.com.br/refrigerador-samsung-frost-free-com-809-litros-bespoke-inox-look---rf29db-sgrf29db_prd/p", store: "fastshop", category: "casa", active: true },
  { name: "Aspirador de Pó Sem Fio Dyson V12 Detect Slim", url: "https://site.fastshop.com.br/dyson-v12-detect-slim-aspirador-de-po-sem-fio---bivolt-95097/p", store: "fastshop", category: "casa", active: true },
  { name: "Robô Aspirador Inteligente WAP Robot W3000", url: "https://loja.wap.ind.br/robot-w3000/p", store: "wap", category: "casa", active: true },
  { name: "Climatizador e Umidificador WAP Air Protect", url: "https://loja.wap.ind.br/climatizador-air-protect/p", store: "wap", category: "casa", active: true },
  { name: "Vassoura WAP MOP Spray com Reservatório", url: "https://loja.wap.ind.br/limpador-wap-vassoura-mop-spray-com-reservatorio/p", store: "wap", category: "casa", active: true },
  { name: "Kindle 11ª Geração Verde Matcha", url: "https://www.amazon.com.br/dp/B0CP31QS6R", store: "amazon", category: "eletronicos", active: true },
];

async function main() {
  console.log(`Inserindo/atualizando ${PRODUCTS.length} produtos...`);
  const { data, error } = await supabase
    .from('products')
    .upsert(PRODUCTS, { onConflict: 'url' })
    .select('id, name');
  if (error) { console.error('Erro:', error.message); process.exit(1); }
  console.log(`${data.length} produto(s) inseridos/atualizados.`);
  process.exit(0);
}

main();
