require('dotenv').config();
const { supabase } = require('../src/db/supabase');

// 26 produtos ML validados (de 36 testados).
// 10 pulados: catálogo sem winners (404) ou item direto restrito (403) —
// iPhone 15 Amarelo, Galaxy S24 FE, Redmi Note 14 Pro+, Apple Watch S11 42mm,
// Apple Pencil Pro (MLBU3895807699), Galaxy Watch 7 Ultra Prata, Tab S9 FE 5G,
// Steam Deck OLED, Ryzen 5700X Inland, Echo Dot Azul Escuro.
const PRODUCTS = [
  { name: 'iPhone 16 Pro 128GB Titânio Natural', url: 'https://www.mercadolivre.com.br/apple-iphone-16-pro-128-gb-titnio-natural-distribuidor-autorizado/p/MLB53430960', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'iPhone 15 128GB Azul', url: 'https://www.mercadolivre.com.br/apple-iphone-15-128-gb-azul-distribuidor-autorizado/p/MLB1027172667', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Samsung Galaxy S26 Ultra 5G 512GB Prata', url: 'https://www.mercadolivre.com.br/celular-samsung-galaxy-s26-ultra-5g-512gb-12gb-ram-cmera-quadrupla-tela-grande-de-69-prata/p/MLB66060812', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Samsung Galaxy S26 Ultra 5G 256GB Branco', url: 'https://www.mercadolivre.com.br/celular-samsung-galaxy-s26-ultra-5g-256gb-12gb-ram-cmera-quadrupla-tela-grande-de-69-branco/p/MLB65503988', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Samsung Galaxy S25 5G 256GB Azul Claro', url: 'https://www.mercadolivre.com.br/samsung-galaxy-s25-5g-256gb-12gb-cmera-tripla-azul-claro/p/MLB45513356', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Motorola Razr 50 Ultra 512GB Verde Primavera', url: 'https://www.mercadolivre.com.br/motorola-razr-50-ultra-verde-primavera-512-gb-12-gb/p/MLB40194288', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Samsung Galaxy A26 5G 256GB Branco', url: 'https://www.mercadolivre.com.br/celular-samsung-galaxy-a26-5g-256gb-8gb-ram-cmera-de-50mp-ip67-tela-super-amoled-67-nfc-branco/p/MLB47436035', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Apple Watch Ultra 2 49mm Titânio Preto', url: 'https://www.mercadolivre.com.br/apple-watch-ultra-2-gps-cellular-caixa-preta-de-titnio-de-49-mm-pulseira-oceano-preta-novo-com-caixa-aberta/p/MLB2023393882', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Apple Watch Ultra 2 49mm Oceano Azul', url: 'https://www.mercadolivre.com.br/apple-watch-ultra-2-gps-cellular-caixa-de-titnio-49-mm-pulseira-oceano-azul/p/MLB27594644', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Samsung Galaxy Watch 7 Ultra 47mm Cinza/Laranja', url: 'https://www.mercadolivre.com.br/samsung-galaxy-watch-ultra-smartwatch-47mm-lte-caixa-titnio-cinza-pulseira-laranja/p/MLB38775227', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Tablet Samsung Galaxy Tab S9 FE 128GB Cinza Escuro', url: 'https://www.mercadolivre.com.br/samsung-galaxy-tab-s9-fe-128-gb-cinza-escuro-excelente-recondicionado/p/MLB2010314141', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Apple MacBook Air M3 13" Space Gray', url: 'https://www.mercadolivre.com.br/apple-macbook-air-13-inch-space-gray-13-apple-m3-8gb-de-ram/p/MLB37740034', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Console Xbox Series X 1TB Preto', url: 'https://www.mercadolivre.com.br/microsoft-xbox-series-x-1tb/p/MLB16160759', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Console Xbox Series X 1TB Branco', url: 'https://www.mercadolivre.com.br/console-xbox-series-x-1-tb-branco-c-controle/p/MLB43535812', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Console Nintendo Switch OLED 64GB Branco', url: 'https://www.mercadolivre.com.br/nintendo-switch-oled-branco-64gb/p/MLB20545792', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Console Nintendo Switch OLED Standard Branco', url: 'https://www.mercadolivre.com.br/nintendo-switch-oled-64gb-standard-com-joy-con-branco/p/MLB31000132', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Câmera GoPro HERO 13 Black 5.3K', url: 'https://www.mercadolivre.com.br/gopro-hero13-black-cmera-de-aco-prova-dagua-10m-53k60-27mp-hypersmooth-60-gps-wi-fi-6-detecco-automatica-das-lentes-hb-series/p/MLB40284977', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Fone Bose QuietComfort Ultra Preto', url: 'https://www.mercadolivre.com.br/fones-de-ouvido-bose-quietcomfort-ultra-sem-fio-de-2-geracopretos-e-pretos/p/MLB62911450', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Fone JBL Tune 520BT Azul', url: 'https://www.mercadolivre.com.br/fone-de-ouvido-headphone-bluetooth-jbl-tune-520bt-cor-azul/p/MLB56414483', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Caixa de Som JBL Boombox 3 Preta', url: 'https://www.mercadolivre.com.br/caixa-de-som-boombox-3-bluetooth-preta-jbl/p/MLB23163768', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Caixa de Som JBL Boombox 3 Squad Camuflada', url: 'https://www.mercadolivre.com.br/jbl-boombox-3-bluetooth-squad-jblboombox3squadbr/p/MLB46273431', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Caixa de Som JBL Boombox 3 Wi-Fi', url: 'https://www.mercadolivre.com.br/caixa-de-som-bluetooth-jbl-boombox-3-wi-fi/p/MLB44814356', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Processador AMD Ryzen 7 5700X', url: 'https://www.mercadolivre.com.br/processador-amd-ryzen-7-5700x-8core-16threads-34ghz/up/MLBU2262237894', store: 'mercadolivre', category: 'hardware', active: true },
  { name: 'Smart TV LG OLED evo AI C5 4K 55"', url: 'https://www.mercadolivre.com.br/smart-tv-lg-oled-evo-ai-c5-4k-55-polegadas-2025-processador-9-ai-ger-8-webos-25-intensificador-de-brilho/p/MLB53613524', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Amazon Echo Dot 5ª Geração Preto', url: 'https://www.mercadolivre.com.br/echo-dot-5-geracao-smart-speaker-com-alexa-amazon-preto/p/MLB40122422', store: 'mercadolivre', category: 'eletronicos', active: true },
  { name: 'Amazon Fire TV Stick Lite Full HD', url: 'https://www.mercadolivre.com.br/fire-tv-stick-amazon-lite-de-voz-full-hd-8gb-1gb-memoria-ram-cor-preto-tipo-de-controle-remoto-padro/p/MLB38057141', store: 'mercadolivre', category: 'eletronicos', active: true },
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
