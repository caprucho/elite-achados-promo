require('dotenv').config();
const { supabase } = require('../src/db/supabase');

const PRODUCTS = [
  // Mercado Livre
  { name: 'Echo Dot 5ª Geração',           url: 'https://www.mercadolivre.com.br/amazon-echo-dot-5th-alexa-amazon-assist-virtual-rapido-cor-preto/p/MLB32109961',                                                                                                                                                                                    store: 'mercadolivre', category: 'eletronicos',  active: true  },
  { name: 'Kindle Paperwhite 16GB',         url: 'https://www.mercadolivre.com.br/amazon-kindle-paperwhite-12-gen-16-gb-prova-dagua-preto/p/MLB44601586',                                                                                                                                                                                              store: 'mercadolivre', category: 'eletronicos',  active: true  },
  { name: 'Fire TV Stick Lite',             url: 'https://www.mercadolivre.com.br/fire-tv-stick-amazon-lite-de-voz-full-hd-8gb-1gb-memoria-ram-cor-preto-tipo-de-controle-remoto-padro/p/MLB38057141',                                                                                                                                                 store: 'mercadolivre', category: 'eletronicos',  active: true  },
  { name: 'Apple AirPods Pro 2ª Geração',   url: 'https://www.mercadolivre.com.br/apple-airpods-pro-2-geraco-branco-distribuidor-autorizado/p/MLB1019623394',                                                                                                                                                                                          store: 'mercadolivre', category: 'audio',         active: true  },
  { name: 'Sabão Líquido Omo 3L',           url: 'https://www.mercadolivre.com.br/sabo-liquido-omo-lavagem-perfeita-3l/p/MLB2050354955',                                                                                                                                                                                                               store: 'mercadolivre', category: 'casa',          active: true  },
  { name: 'iPhone 15 128GB',                url: 'https://www.mercadolivre.com.br/apple-iphone-15-128-gb-preto-distribuidor-autorizado/p/MLB1027172677',                                                                                                                                                                                               store: 'mercadolivre', category: 'smartphones',   active: true  },
  { name: 'Samsung Galaxy S23 256GB',       url: 'https://www.mercadolivre.com.br/samsung-galaxy-s23-256-gb-5g-preto-8-gb-ram/p/MLB21436188',                                                                                                                                                                                                         store: 'mercadolivre', category: 'smartphones',   active: true  },
  { name: 'Logitech G PRO X Superlight 2', url: 'https://www.mercadolivre.com.br/mouse-gamer-sem-fio-logitech-g-pro-x-superlight-2-branco/p/MLB28294852',                                                                                                                                                                                             store: 'mercadolivre', category: 'perifericos',   active: true  },
  { name: 'Processador AMD Ryzen 7 5700X', url: 'https://www.mercadolivre.com.br/processador-amd-ryzen-7-5700x-oem-46ghz-8-nucleos-e-16-thed/p/MLB62338492',                                                                                                                                                                                          store: 'mercadolivre', category: 'hardware',      active: true  },
  { name: 'Placa de Vídeo RTX 4060 Ti 16GB', url: 'https://www.mercadolivre.com.br/placa-de-video-rtx-4060-ti-16gb-gddr6-128bits-ventus-3x-oc/p/MLB29715221',                                                                                                                                                                                        store: 'mercadolivre', category: 'hardware',      active: true  },
  { name: 'Samsung Galaxy Tab S9 FE 128GB', url: 'https://www.mercadolivre.com.br/tablet-samsung-galaxy-tab-s9-fe-5g-128gb-6gb-ram-tela-imersiva-de-109-90hz-camera-traseira-de-8mp-cmera-frontal-de-12mp-ultra-wide-wifi-6-ip68-android-14-verde-claro/p/MLB28529805',                                                                               store: 'mercadolivre', category: 'eletronicos',   active: true  },
  { name: 'JBL Tune 520BT',                url: 'https://www.mercadolivre.com.br/fone-de-ouvido-headphone-bluetooth-jbl-tune-520bt-azul/p/MLB44202830',                                                                                                                                                                                               store: 'mercadolivre', category: 'audio',         active: true  },

  // Dafiti
  { name: 'Nike Revolution 6 Feminino',    url: 'https://www.dafiti.com.br/Tenis-Nike-Revolution-6-Next-Nature-Feminino-13652846.html',             store: 'dafiti', category: 'calcados',    active: true },
  { name: 'Vans Old Skool Preto',          url: 'https://www.dafiti.com.br/Tenis-Vans-Old-Skool-Preto-14772934.html',                               store: 'dafiti', category: 'calcados',    active: true },
  { name: 'Puma Smash V2',                 url: 'https://www.dafiti.com.br/Tenis-Puma-Smash-V2-Bdp-Preto-3740164.html',                             store: 'dafiti', category: 'calcados',    active: true },
  { name: 'Jaqueta Puffer Calvin Klein',   url: 'https://www.dafiti.com.br/Jaqueta-Calvin-Klein-Masculina-Puffer-Waterproof-Caqui-15166833.html',   store: 'dafiti', category: 'vestuario',   active: true },
  { name: 'Moletom GAP com Logo',          url: 'https://www.dafiti.com.br/Blusa-de-Moletom-Aberta-GAP-Logo-Marrom-11580219.html',                  store: 'dafiti', category: 'vestuario',   active: true },
  { name: 'Perfume CK One 100ml',          url: 'https://www.dafiti.com.br/Perfume-100ml-Ck-One-Eau-de-Toilette-Calvin-Klein-Unissex-13358208.html', store: 'dafiti', category: 'perfumaria',  active: true },
  { name: 'Bota Vizzano Cano Curto',       url: 'https://www.dafiti.com.br/p/Bota-Vizzano-Cano-Curto-Preta-14575366.html',                          store: 'dafiti', category: 'calcados',    active: true },
  { name: 'Relógio Casio Vintage F-91WM',  url: 'https://www.dafiti.com.br/Relogio-Casio-Digital-F-91WM-3ADF-SC-Verde-13177176.html',               store: 'dafiti', category: 'acessorios',  active: true },
  { name: 'Mochila Nike Heritage',         url: 'https://www.dafiti.com.br/Mochila-Nike-Heritage-Unissex-12366021.html',                             store: 'dafiti', category: 'acessorios',  active: true },

  // KaBuM
  { name: 'PlayStation 5 Edição Digital',  url: 'https://www.kabum.com.br/produto/989702/console-sony-playstation-5-ssd-825gb-controle-sem-fio-dualsense-2-jogos-digitais-edicao-digital', store: 'kabum', category: 'games',      active: true },
  { name: 'Monitor LG UltraGear 24" 180Hz', url: 'https://www.kabum.com.br/produto/614879/monitor-gamer-lg-ultragear-24-fhd-180hz-1ms-ips-dp-e-hdmi-hdr10-freesync-g-sync-24gs60f-b',    store: 'kabum', category: 'perifericos', active: true },
  { name: 'Cadeira Husky Gaming Snow',     url: 'https://www.kabum.com.br/produto/92752/cadeira-gamer-husky-gaming-snow-preto-e-branco-cilindro-de-gas-classe-4-base-em-metal-roda-em-nylon-hsn-bw', store: 'kabum', category: 'games', active: true },

  // WAP
  { name: 'Aspirador WAP Robot W300',      url: 'https://loja.wap.ind.br/robo-aspirador-de-po-wap-robot-w300/p', store: 'wap', category: 'casa', active: true },
];

async function seed() {
  console.log(`Inserindo ${PRODUCTS.length} produtos...\n`);

  const { data, error } = await supabase
    .from('products')
    .upsert(PRODUCTS, { onConflict: 'url', ignoreDuplicates: false })
    .select('name, store, active');

  if (error) {
    console.error('Erro ao inserir produtos:', error.message);
    process.exit(1);
  }

  data.forEach((p) => {
    const status = p.active ? '✓' : '○';
    console.log(`${status} [${p.store.padEnd(13)}] ${p.name}`);
  });

  console.log(`\n${data.length} produto(s) inseridos/atualizados com sucesso.`);
}

seed();
