require('dotenv').config();
const { supabase } = require('../src/db/supabase');

// 28 produtos validados (de 36 testados). 8 pulados: 4 Fast Shop (404 /
// OutOfStock), 4 Amazon com ASIN 404 (Copo Stanley, Bioré, Neutrogena,
// Fechadura Intelbras — ASINs provavelmente inválidos).
const PRODUCTS = [
  { name: "Placa de Vídeo RTX 4070 Super Zotac Trinity Black", url: "https://www.kabum.com.br/produto/573500/zotac-gaming-geforce-rtx-4070-super-trinity-black-edition-12gb-gddr6x-zt-d40720d-10p", store: "kabum", category: "hardware", active: true },
  { name: "Processador AMD Ryzen 7 9800X3D", url: "https://www.kabum.com.br/produto/677529/processador-amd-ryzen-7-9800x3d-4-7ghz-5-2ghz-turbo-8-cores-16-threads-am5-sem-cooler-100-1000001084wof", store: "kabum", category: "hardware", active: true },
  { name: "Mouse Gamer Razer Viper V3 Pro Preto", url: "https://www.kabum.com.br/produto/921184/mouse-gamer-sem-fio-razer-viper-v3-pro-35000-dpi-preto-rz01-05120100-r3u1", store: "kabum", category: "hardware", active: true },
  { name: "Mouse Razer Viper V3 Pro c/ Dongle 8K", url: "https://www.kabum.com.br/produto/618927/mouse-gamer-razer-viper-v3-pro-35000-dpi-54g-ultraleve-com-dongle-8k-95hr-de-bateria-recarregavel-preto", store: "kabum", category: "hardware", active: true },
  { name: "Mouse Logitech G502 X Plus Preto", url: "https://www.kabum.com.br/produto/388058/mouse-gamer-sem-fio-logitech-g502-x-plus-rgb-25600-dpi-13-botoes-switch-preto-910-006161", store: "kabum", category: "hardware", active: true },
  { name: "Mouse Logitech G502 X Plus Branco", url: "https://www.kabum.com.br/produto/457864/mouse-gamer-sem-fio-logitech-g502-x-plus-lightspeed-com-rgb-lightsync-branco-910-006170", store: "kabum", category: "hardware", active: true },
  { name: "Teclado Mecânico SteelSeries Apex PRO RGB", url: "https://www.kabum.com.br/produto/115327/teclado-mecanico-gamer-steelseries-apex-pro-rgb-switch-omnipoint-us-preto-64626", store: "kabum", category: "hardware", active: true },
  { name: "Teclado Gamer Razer BlackWidow V4 X Preto", url: "https://www.kabum.com.br/produto/632868/teclado-razer-blackwidow-v4-x-preto-rz0304700200r3u", store: "kabum", category: "hardware", active: true },
  { name: "Amazon Fire TV Stick Lite 2ª Geração", url: "https://www.kabum.com.br/produto/349378/amazon-fire-tv-stick-lite-2-geracao-full-hd-hdmi-bluetooth-com-controle-remoto-por-voz-com-alexa-b091g767yb", store: "kabum", category: "eletronicos", active: true },
  { name: "Echo Dot 5ª Geração Azul com Relógio", url: "https://www.kabum.com.br/produto/471472/caixa-de-som-amazon-echo-dot-5-geracao-alexa-relogio-bluetooth-azul", store: "kabum", category: "eletronicos", active: true },
  { name: "Mac mini M4 256GB", url: "https://www.apple.com/br/shop/buy-mac/mac-mini/chip-m4-cpu-de-10-n%C3%BAcleos-gpu-de-10-n%C3%BAcleos-16-gb-mem%C3%B3ria-256gb-armazenamento", store: "apple", category: "eletronicos", active: true },
  { name: "iMac M4 24\" Verde 512GB", url: "https://www.apple.com/br/shop/buy-mac/imac/24-polegadas-verde-chip-m4-cpu-de-8-n%C3%BAcleos-gpu-de-8-n%C3%BAcleos-24-gb-mem%C3%B3ria-512gb-armazenamento-adaptador-para-montagem-vesa", store: "apple", category: "eletronicos", active: true },
  { name: "iMac M4 24\" Azul 512GB", url: "https://www.apple.com/br/shop/buy-mac/imac/24-polegadas-blue-chip-m4-cpu-de-10-n%C3%BAcleos-gpu-de-10-n%C3%BAcleos-16-gb-mem%C3%B3ria-512gb-armazenamento-vidro-convencional-base", store: "apple", category: "eletronicos", active: true },
  { name: "iPad Pro M4 11\" 256GB Preto Espacial", url: "https://www.apple.com/br/shop/buy-ipad/ipad-pro/tela-de-11-polegadas-256gb-preto-espacial-wifi-vidro-convencional", store: "apple", category: "eletronicos", active: true },
  { name: "iPhone 17 Pro 512GB Laranja-Cósmico", url: "https://www.apple.com/br/shop/buy-iphone/iphone-17-pro/tela-de-6,3-polegadas-512gb-laranja-c%C3%B3smico", store: "apple", category: "eletronicos", active: true },
  { name: "iPhone 17 Pro Max 256GB Prateado", url: "https://www.apple.com/br/shop/buy-iphone/iphone-17-pro/tela-de-6,9-polegadas-256gb-prateado", store: "apple", category: "eletronicos", active: true },
  { name: "Robô Aspirador de Pó WAP Robot W300", url: "https://loja.wap.ind.br/robo-aspirador-de-po-wap-robot-w300/p", store: "wap", category: "casa", active: true },
  { name: "Limpadora de Pisos Sem Fio WAP Multi Floor", url: "https://loja.wap.ind.br/limpadora-de-pisos-sem-fio-wap-multi-floor/p", store: "wap", category: "casa", active: true },
  { name: "Vassoura WAP MOP Spray com Reservatório", url: "https://loja.wap.ind.br/limpador-wap-vassoura-mop-spray-com-reservatorio/p", store: "wap", category: "casa", active: true },
  { name: "Vaporizador Portátil WAP Wapore Fast 1250", url: "https://loja.wap.ind.br/vaporizador-portatil-wap-wapore-fast-1250/p", store: "wap", category: "casa", active: true },
  { name: "Aspirador Vertical 3 em 1 WAP Silent Speed Max", url: "https://loja.wap.ind.br/aspirador-de-po-vertical-3-em-1-1350w-wap-silent-speed-max-1/p", store: "wap", category: "casa", active: true },
  { name: "Lavadora de Alta Pressão WAP Combate Turbo 2600", url: "https://loja.wap.ind.br/lavadora-de-alta-pressao-1700w-2100psi-wap-combate-turbo-2600/p", store: "wap", category: "casa", active: true },
  { name: "Desobstruidora WAP Premium Ultra 2600", url: "https://loja.wap.ind.br/desobstruidora-de-alta-pressao-1900w-2400psi-wap-premium-ultra-2600/p", store: "wap", category: "casa", active: true },
  { name: "Climatizador e Umidificador WAP Air Protect", url: "https://loja.wap.ind.br/climatizador-air-protect/p", store: "wap", category: "casa", active: true },
  { name: "Refrigerador Samsung Bespoke 809L Inox Look", url: "https://site.fastshop.com.br/refrigerador-samsung-frost-free-com-809-litros-bespoke-inox-look---rf29db-sgrf29db_prd/p", store: "fastshop", category: "casa", active: true },
  { name: "Kindle 11ª Geração Verde Matcha", url: "https://www.amazon.com.br/dp/B0CP31QS6R", store: "amazon", category: "eletronicos", active: true },
  { name: "Kindle Colorsoft 16GB", url: "https://www.amazon.com.br/dp/B0CX8MT2M2", store: "amazon", category: "eletronicos", active: true },
  { name: "Echo Dot 5ª Geração Azul", url: "https://www.amazon.com.br/dp/B09B8VGCR8", store: "amazon", category: "eletronicos", active: true },
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
