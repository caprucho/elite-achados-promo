require('dotenv').config();
const { supabase } = require('../src/db/supabase');

// 25 produtos validados (de 32 testados).
// Pulados: Kindle Colorsoft (duplicata da URL amzn.to já cadastrada),
// 3 Fast Shop fora de estoque/404, 3 ML "no winners found".
const PRODUCTS = [
  // ── Apple Store BR ────────────────────────────────────────────────────────────
  { name: 'iPhone 16',                        url: 'https://www.apple.com/br/shop/buy-iphone/iphone-16',                                                                                                                                                                                                                                                store: 'apple',    category: 'eletronicos', active: true },
  { name: 'iPad Pro 11" M4 256GB Wi-Fi',      url: 'https://www.apple.com/br/shop/buy-ipad/ipad-pro/tela-de-11-polegadas-256gb-preto-espacial-wifi-vidro-convencional',                                                                                                                                                                              store: 'apple',    category: 'eletronicos', active: true },
  { name: 'MacBook Pro 14" M4',               url: 'https://www.apple.com/br/shop/buy-mac/macbook-pro/14-polegadas',                                                                                                                                                                                                                                  store: 'apple',    category: 'eletronicos', active: true },
  { name: 'Mac mini M4 256GB',                url: 'https://www.apple.com/br/shop/buy-mac/mac-mini/chip-m4-cpu-de-10-n%C3%BAcleos-gpu-de-10-n%C3%BAcleos-16-gb-mem%C3%B3ria-256gb-armazenamento',                                                                                                                                                     store: 'apple',    category: 'eletronicos', active: true },
  { name: 'iMac 24" M4 Verde 512GB',          url: 'https://www.apple.com/br/shop/buy-mac/imac/24-polegadas-verde-chip-m4-cpu-de-8-n%C3%BAcleos-gpu-de-8-n%C3%BAcleos-24-gb-mem%C3%B3ria-512gb-armazenamento-adaptador-para-montagem-vesa',                                                                                                              store: 'apple',    category: 'eletronicos', active: true },

  // ── Fast Shop ─────────────────────────────────────────────────────────────────
  { name: 'Refrigerador Samsung Bespoke 809L Inox Look', url: 'https://site.fastshop.com.br/refrigerador-samsung-frost-free-com-809-litros-bespoke-inox-look---rf29db-sgrf29db_prd/p',                                                                                                                                                                store: 'fastshop', category: 'casa',        active: true },

  // ── WAP ───────────────────────────────────────────────────────────────────────
  { name: 'Climatizador WAP Air Protect',     url: 'https://loja.wap.ind.br/climatizador-air-protect/p',                                                                                                                                                                                                                                              store: 'wap',      category: 'casa',        active: true },
  { name: 'Vaporizador Portátil WAP Wapore Fast 1250', url: 'https://loja.wap.ind.br/vaporizador-portatil-wap-wapore-fast-1250/p',                                                                                                                                                                                                                    store: 'wap',      category: 'casa',        active: true },
  { name: 'Lavadora Alta Pressão WAP Combate Turbo 2600', url: 'https://loja.wap.ind.br/lavadora-de-alta-pressao-1700w-2100psi-wap-combate-turbo-2600/p',                                                                                                                                                                                              store: 'wap',      category: 'casa',        active: true },
  { name: 'Limpadora de Pisos Sem Fio WAP Multi Floor', url: 'https://loja.wap.ind.br/limpadora-de-pisos-sem-fio-wap-multi-floor/p',                                                                                                                                                                                                                  store: 'wap',      category: 'casa',        active: true },
  { name: 'Desobstruidora WAP Premium Ultra 2600', url: 'https://loja.wap.ind.br/desobstruidora-de-alta-pressao-1900w-2400psi-wap-premium-ultra-2600/p',                                                                                                                                                                                              store: 'wap',      category: 'casa',        active: true },

  // ── KaBuM! ────────────────────────────────────────────────────────────────────
  { name: 'Mouse Gamer Sem Fio Razer Viper V3 Pro Branco', url: 'https://www.kabum.com.br/produto/921185/mouse-gamer-sem-fio-razer-viper-v3-pro-35000-dpi-branco-rz01-05120200-r3u1',                                                                                                                                                                  store: 'kabum',    category: 'hardware',    active: true },
  { name: 'Mouse Gamer Logitech G502 X RGB Branco', url: 'https://www.kabum.com.br/produto/388055/mouse-gamer-logitech-g502-x-rgb-25600-dpi-13-botoes-switch-hibrido-branco-910-006145',                                                                                                                                                              store: 'kabum',    category: 'hardware',    active: true },
  { name: 'Teclado Razer BlackWidow V4 Pro 75% Sem Fio', url: 'https://www.kabum.com.br/produto/921177/teclado-mecanico-gamer-sem-fio-razer-blackwidow-v4-75-chroma-rgb-hot-swappable-layout-us-preto-rz03-05130200-r3u1',                                                                                                                            store: 'kabum',    category: 'hardware',    active: true },
  { name: 'Teclado Razer BlackWidow V4 X Preto', url: 'https://www.kabum.com.br/produto/632868/teclado-razer-blackwidow-v4-x-preto-rz0304700200r3u',                                                                                                                                                                                                  store: 'kabum',    category: 'hardware',    active: true },
  { name: 'Fone SteelSeries Arctis Nova 7 Sem Fio', url: 'https://www.kabum.com.br/produto/726340/fone-de-ouvido-steelseries-arctis-nova-7-sem-fio-pc-ps4-ps5',                                                                                                                                                                                       store: 'kabum',    category: 'hardware',    active: true },
  { name: 'Gabinete Gamer Rise Mode Galaxy Glass V2 Branco', url: 'https://www.kabum.com.br/produto/613890/gabinete-gamer-rise-mode-galaxy-glass-standard-v2-mid-tower-atx-lateral-e-frontal-em-vidro-temperado-com-10-ventoinhas-branco-rm-ga-ggsw2-argb',                                                                                          store: 'kabum',    category: 'hardware',    active: true },
  { name: 'PC Gamer Ryzen 7 7800X3D + RTX 3060 12GB', url: 'https://www.kabum.com.br/produto/591084/computador-amd-ryzen-7-7800x3d-64gb-memoria-ram-ddr5-ssd-2tb-m2-nvme-placa-de-video-rtx-3060-12gb-placa-mae-b650-fonte-700w-water-cooler-240mm',                                                                                                  store: 'kabum',    category: 'hardware',    active: true },
  { name: 'PC Gamer Intel Core i7-14700K + RTX 4060 8GB', url: 'https://www.kabum.com.br/produto/614947/pc-gamer-intel-core-i7-14700k-b760m-aorus-elite-rtx-4060-8gb-16gb-ddr5-fury-m-2-nvme-1tb-fonte-700w-tt',                                                                                                                                      store: 'kabum',    category: 'hardware',    active: true },
  { name: 'Processador Intel Core i5-12400F', url: 'https://www.kabum.com.br/produto/594697/processador-intel-core-i5-12400f-2-5ghz-turbo-4-4ghz-cache-18mb-6-nucleos-12-threads-12-geracao-lga-1700-bx8071512400f',                                                                                                                                  store: 'kabum',    category: 'hardware',    active: true },
  { name: 'Placa de Vídeo Gigabyte RTX 4070 Super Eagle OC 12GB', url: 'https://www.kabum.com.br/produto/574326/rtx-4070-super-eagle-oc-12gb-gddr6x-0113133-01-processador-grafico-gigabyte-geforce-gv-n407seagle-oc-12gd',                                                                                                                            store: 'kabum',    category: 'hardware',    active: true },

  // ── Mercado Livre ─────────────────────────────────────────────────────────────
  { name: 'Apple Pencil Pro (iPad Air/Pro M4)', url: 'https://www.mercadolivre.com.br/apple-pencil-pro-para-ipad-air-m2-m3-pro-m4-m5-e-a17-pro/up/MLBU3821270420',                                                                                                                                                                                    store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Samsung Galaxy A26 5G 256GB Branco', url: 'https://www.mercadolivre.com.br/celular-samsung-galaxy-a26-5g-256gb-8gb-ram-cmera-de-50mp-ip67-tela-super-amoled-67-nfc-branco/p/MLB47436035',                                                                                                                                                  store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Console PlayStation 5 Slim Digital 825GB Branco', url: 'https://www.mercadolivre.com.br/console-playstation-5-slim-edico-digital-825-gb-branco-sony/p/MLB29001054',                                                                                                                                                                        store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Alto-falante Bose Soundlink Flex II Beige', url: 'https://www.mercadolivre.com.br/alto-falante-portatil-bose-soundlink-flex-ii-2-geraco-bt-color-beige/p/MLB43584209',                                                                                                                                                                    store: 'mercadolivre', category: 'eletronicos', active: true },
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
