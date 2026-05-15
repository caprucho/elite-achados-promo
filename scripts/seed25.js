require('dotenv').config();
const { supabase } = require('../src/db/supabase');

// 20 produtos KaBuM validados — componentes (fontes, placas-mãe, memórias,
// monitores), periféricos e 1 notebook. Todos testados OK.
const PRODUCTS = [
  { name: "Fonte MSI MAG A650BN 650W 80 Plus Bronze", url: "https://www.kabum.com.br/produto/369658/fonte-msi-mag-a650bn-650w-80-plus-bronze-pfc-ativo-com-cabo-preto-306-7zp2b22-ce0", store: 'kabum', category: "hardware", active: true },
  { name: "Mouse Gamer Sem Fio Attack Shark X1", url: "https://www.kabum.com.br/produto/904342/mouse-gamer-sem-fio-attack-shark-x1-ultraleve-com-base-de-carregamento-magnetico-rgb-tri-mode-40-000-dpi-sensor-optico-paw3395-pro-6-botoes-preto", store: 'kabum', category: "hardware", active: true },
  { name: "Placa-Mãe MSI A520M-A PRO AMD AM4", url: "https://www.kabum.com.br/produto/280890/placa-mae-msi-a520m-a-pro-amd-am4-matx-ddr4-preto-a520m-a-pro", store: 'kabum', category: "hardware", active: true },
  { name: "Placa de Vídeo Gigabyte RX 7600 Gaming OC 8GB", url: "https://www.kabum.com.br/produto/475647/placa-de-video-rx-7600-gaming-oc-8g-amd-radeon-gigabyte-8gb-gddr6-128bits-rgb-gv-r76gaming-oc-8gd", store: 'kabum', category: "hardware", active: true },
  { name: "Monitor Gamer ASUS TUF 25\" FHD 200Hz VG259Q5A", url: "https://www.kabum.com.br/produto/747517/monitor-gamer-asus-tuf-25-full-hd-200hz-0-3ms-fast-ips-vrr-g-sync-comp-freesync-premium-hdr10-som-integrado-preto-vg259q5a", store: 'kabum', category: "hardware", active: true },
  { name: "Fonte MSI MAG A600DN 600W 80 Plus White", url: "https://www.kabum.com.br/produto/369655/fonte-msi-mag-a600dn-600w-80-plus-white-pfc-ativo-com-cabo-preto-306-7zp6b22-809", store: 'kabum', category: "hardware", active: true },
  { name: "Memória RAM Rise Mode Z 8GB 3200MHz DDR4", url: "https://www.kabum.com.br/produto/383892/memoria-ram-rise-mode-z-8gb-3200mhz-ddr4-cl19-preto-rm-d4-8g-3200z", store: 'kabum', category: "hardware", active: true },
  { name: "Combo Teclado e Mouse Sem Fio Logitech MK235", url: "https://www.kabum.com.br/produto/79357/combo-teclado-e-mouse-sem-fio-logitech-mk235-com-conexao-usb-pilhas-inclusas-e-layout-abnt2-920-007903", store: 'kabum', category: "hardware", active: true },
  { name: "Combo Teclado e Mouse com Fio Logitech MK120", url: "https://www.kabum.com.br/produto/20868/combo-teclado-e-mouse-com-fio-usb-logitech-mk120-com-design-confortavel-duravel-e-resistente-a-respingos-e-layout-abnt2-920-004429", store: 'kabum', category: "hardware", active: true },
  { name: "Echo Dot 5ª Geração Amazon Alexa Preto", url: "https://www.kabum.com.br/produto/460471/echo-dot-5-geracao-amazon-com-alexa-smart-speaker-preto-b09b8vgcr8", store: 'kabum', category: "eletronicos", active: true },
  { name: "Monitor Gamer ASUS TUF 27\" QHD 210Hz VG27AQ5A", url: "https://www.kabum.com.br/produto/747516/monitor-gamer-asus-tuf-27-qhd-210hz-0-3ms-fast-ips-g-sync-comp-freesync-premium-hdr10-som-integrado-vg27aq5a", store: 'kabum', category: "hardware", active: true },
  { name: "Fonte Corsair CX650 650W 80 Plus Bronze", url: "https://www.kabum.com.br/produto/516056/fonte-corsair-cx-series-cx650-650w-80-plus-bronze-com-cabo-preto-cp-9020278-br", store: 'kabum', category: "hardware", active: true },
  { name: "Cadeira Gamer Husky Storm Preta e Branca", url: "https://www.kabum.com.br/produto/833991/cadeira-gamer-husky-storm-100-ate-120kg-almofadas-reclinavel-135-pu-preta-e-branca-hcg100ptbr", store: 'kabum', category: "casa", active: true },
  { name: "Placa-Mãe Gigabyte B550M Aorus Elite AMD AM4", url: "https://www.kabum.com.br/produto/114781/placa-mae-gigabyte-b550m-aorus-elite-rev-1-3-amd-am4-micro-atx-ddr4-preto-b550m-aorus-elite", store: 'kabum', category: "hardware", active: true },
  { name: "Monitor Gamer Curvo ASUS TUF 34\" WQHD 250Hz VG34WQML5A", url: "https://www.kabum.com.br/produto/952751/monitor-gamer-curvo-asus-tuf-34-wqhd-250hz-0-5ms-fast-va-freesync-premium-altura-ajustavel-som-integrado-preto-vg34wqml5a", store: 'kabum', category: "hardware", active: true },
  { name: "Monitor Gamer ASUS TUF 27\" FHD 240Hz VG279QM5A", url: "https://www.kabum.com.br/produto/747518/monitor-gamer-asus-tuf-27-full-hd-240hz-0-3ms-fast-ips-vrr-g-sync-comp-freesync-premium-hdr10-som-integrado-preto-vg279qm5a", store: 'kabum', category: "hardware", active: true },
  { name: "Monitor Gamer LG 27\" FHD 100Hz 27MS500", url: "https://www.kabum.com.br/produto/700172/monitor-gamer-lg-27-fhd-100hz-5ms-ips-dynamic-action-sync-hdmi-preto-27ms500-b", store: 'kabum', category: "hardware", active: true },
  { name: "Notebook Lenovo IdeaPad Slim 3 Ryzen 7 7735HS 16GB", url: "https://www.kabum.com.br/produto/955187/notebook-lenovo-ideapad-slim-3-amd-ryzen-7-7735hs-16gb-ram-amd-radeon-graphics-ssd-512gb-15-3-wuxga-linux-luna-grey-83mms00000", store: 'kabum', category: "eletronicos", active: true },
  { name: "Fonte Gigabyte P650G 650W 80 Plus Gold", url: "https://www.kabum.com.br/produto/907600/fonte-gigabyte-p650g-pg5-650w-80-plus-gold-pfc-ativo-preto-28200-p65g5-1cbrr", store: 'kabum', category: "hardware", active: true },
  { name: "Memória RAM Kingston Fury Beast 16GB 3200MHz DDR4", url: "https://www.kabum.com.br/produto/172366/memoria-ram-kingston-fury-beast-16gb-3200mhz-ddr4-cl16-preto-kf432c16bb1-16", store: 'kabum', category: "hardware", active: true },
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
