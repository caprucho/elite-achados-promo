require('dotenv').config();
const { supabase } = require('../src/db/supabase');

// 34 eletrodomésticos Fast Shop — todos testados OK (URLs reais do site).
const PRODUCTS = [
  { name: "Lava-louças Brastemp Eclipse BLF62AP 15 Serviços", url: "https://site.fastshop.com.br/lava-loucas-brastemp-eclipse-collection-black-stainless-com-15-servicos--05-programas-de-lavagem---blf62ap-brblf62ap_prd-66626/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Lava e Seca Samsung 13kg AI Control WD13FG", url: "https://site.fastshop.com.br/lava-e-seca-13-kg-samsung-smart-ai-control-inox---wd13fg-sgwd13fg6b34b_prd-136057/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Refrigerador Brastemp Inverse 500L BRE66AK", url: "https://site.fastshop.com.br/refrigerador-brastemp-inverse-frost-free-500l-inox-classe-a-inteligente-com-fresh-space-bivolt---bre66ak-brbre66akxna_prd-156903/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Cooktop 5 Bocas Brastemp Gourmand BDK90DR", url: "https://site.fastshop.com.br/cooktop-5-bocas-brastemp-gourmand-inox-com-duplachama-e-trempe-com-ferro-fundido-bdk90dr-brbdk90dr_prd-3806/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Refrigerador French Door Electrolux 484L IM7B", url: "https://site.fastshop.com.br/refrigerador-french-door-electrolux-de-03-portas-frost-free-com-484-litros-black-inox-look---im7b-exim7b_prd-70810/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Refrigerador French Door Brastemp 559L Inox BRO85MK", url: "https://site.fastshop.com.br/-refrigerador-french-door-brastemp-de-03-portas-frost-free-com-559-litros-inox---bro85mk-brbro85mk_prd-155553/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Refrigerador Brastemp 2 Portas 512L BRM62AK", url: "https://site.fastshop.com.br/refrigerador-brastemp-de-02-portas-frost-free-512l-classe-a-inteligente-com-fresh-space-inox---brm62ak-brbrm62akxna_prd-156910/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Fogão de Piso Brastemp 5 Bocas BFS5GDR", url: "https://site.fastshop.com.br/fogao-de-piso-brastemp-de-05-bocas-com-turbo-chama-e-grill-inox---bfs5gdr-brbfs5gdr_prd-93490/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Forno de Embutir a Gás Brastemp 78L BOA84AE", url: "https://site.fastshop.com.br/forno-de-embutir-a-gas-brastemp-78-litros-preto-com-grill-e-timer-touch---boa84ae-brboa84ae_prd-12518/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Refrigerador French Door Brastemp 559L Black BRO85ME", url: "https://site.fastshop.com.br/refrigerador-french-door-brastemp-de-03-portas-frost-free-com-559-litros-black-inox---bro85me-brbro85me_prd-155802/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Lava-louças Brastemp 10 Serviços BLF10BR", url: "https://site.fastshop.com.br/lava-loucas-brastemp-10-servicos-inox-com-ciclo-pesado-e-delicado-blf10br-brblf10br_prd-619/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Fogão Brastemp 5 Bocas de Embutir BYS5VCR", url: "https://site.fastshop.com.br/fogao-brastemp-5-bocas-de-embutir-inox-com-mesa-de-vidro-e-touch-timer-com-autodesligamento---bys5vcr-brbys5vcr_prd-12553/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Lava-louças Embutir Brastemp Gourmand 14 Serviços BLB14GR", url: "https://site.fastshop.com.br/lava-loucas-de-embutir-brastemp-gourmand-14-servicos-inox-com-smart-sensor---blb14gr-brblb14grana_prd-4260/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Refrigerador Inverse Midea 416L MDRB593", url: "https://site.fastshop.com.br/refrigerador-inverse-midea-de-02-portas-frost-free-com-416-litros-inox-bivolt---mdrb593fgd463-1qmdrb593fgd4_prd-104834/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Forno de Embutir Elétrico Brastemp 84L BOC84AE", url: "https://site.fastshop.com.br/forno-de-embutir-eletrico-brastemp-84-litros-preto-com-conveccao-e-timer-touch---boc84ae-brboc84ae_prd-12521/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Cooktop a Gás Brastemp 4 Bocas BDS62AE", url: "https://site.fastshop.com.br/cooktop-a-gas-brastemp-em-vidro-temperado-com-04-bocas-preto---bds62ae-brbds62aeuna_prd-143729/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Micro-ondas Brastemp 32L BMG45AR", url: "https://site.fastshop.com.br/micro-ondas-brastemp-32-litros-cor-inox-espelhado-com-grill-e-painel-integrado---bmg45ar-brbmg45ar_prd-12503/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Refrigerador Bottom Freezer Panasonic 511L NR-BB71GV7B", url: "https://site.fastshop.com.br/refrigerador-bottom-freezer-inverter-panasonic-de-02-portas-frost-free-com-511-litros-black-glass---nr-bb71gv7b-panrbb71gv7ba_prd-157211/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Fogão Brastemp 5 Bocas Preto BFS5VCE", url: "https://site.fastshop.com.br/fogao-brastemp-5-bocas-preto-com-turbo-chama-com-mesa-de-vidro---bfs5vce-brbfs5vce_prd-4259/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Forno Elétrico Embutir Electrolux Expert 80L OE9XB", url: "https://site.fastshop.com.br/forno-eletrico-de-embutir-electrolux-expert-pro-series-com-80-litros--grill-e-painel-touch-preto---oe9xb-exoe9xb_prd-14989/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Coifa de Parede Brastemp 90cm BAE90AR", url: "https://site.fastshop.com.br/coifa-de-parede-brastemp-90-cm-tbox-com-03-velocidades---turbo--painel-touch--timer--inox---bae90ar-brbae90ar_prd-4087/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Lavadora de Roupas Brastemp 14kg BWJ14A9", url: "https://site.fastshop.com.br/lavadora-de-roupas-brastemp-14kg-cinza-platinum-com-12-programas-de-lavagem-com-smart-sensor-e-reduzir-tempo---bwj14a9-brbwj14a9_prd-143761/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Forno de Embutir Elétrico Brastemp 67L BO260AR", url: "https://site.fastshop.com.br/forno-de-embutir-eletrico-brastemp-67-litros-inox-com-funcao-ar-forcado-e-painel-touch---bo260ar-brbo260arbna_prd-12517/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Forno de Embutir Elétrico Brastemp 84L Inox BOC84AR", url: "https://site.fastshop.com.br/forno-de-embutir-eletrico-brastemp-84-litros-inox-espelhado-com-conveccao-e-timer-touch---boc84ar-brboc84ar_prd-12522/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Lava-louças Brastemp 8 Serviços BLF08B", url: "https://site.fastshop.com.br/lava-loucas-brastemp-cinza-metalico-com-08-servicos-e-05-programas-de-lavagem---blf08b-brblf08bsana_prd-2498/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Refrigerador Bottom Freezer Panasonic 475L NR-BB64PV2X", url: "https://site.fastshop.com.br/refrigerador-bottom-freezer-panasonic-inverter-de-02-portas-frost-free-com-475-litros-aco-escovado---nr-bb64pv2x-panrbb64pv2x_prd-156443/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Forno Elétrico Embutir Electrolux Experience 80L OE8EA", url: "https://site.fastshop.com.br/forno-eletrico-de-embutir-electrolux-experience-com-80-litros-de-capacidade--grill-e-painel-touch-preto---oe8ea-exoe8ea_prd-102467/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Micro-ondas de Embutir Electrolux 34L ME3BP", url: "https://site.fastshop.com.br/micro-ondas-de-embutir-electrolux-experience-com-34-litros-de-capacidade-preto---me3bp-exme3bp_prd-13761/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Lava-louças Midea Touch Plus 8 Serviços MDWTF08S", url: "https://site.fastshop.com.br/lava-loucas-midea-touch-plus-cinza-com-08-servicos-e-05-programas-de-lavagem---mdwtf08s-1qmdwtf08s_prd-155649/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Micro-ondas de Embutir Electrolux ME3HP 34L Inox", url: "https://site.fastshop.com.br/micro-ondas-de-embutir-electrolux-me3hp-com-34l-inox-com-grill-e-funcao-tira-odor-exme3hp_prd-100200/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Cooktop a Gás Electrolux Home Pro 5 Bocas KE5HP", url: "https://site.fastshop.com.br/cooktop-a-gas-electrolux-home-pro-em-vidro-com-05-bocas-preto---ke5hp-exke5hp_prd-98837/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Fogão de Piso Brastemp 4 Bocas BFO4XAE", url: "https://site.fastshop.com.br/fogao-de-piso-brastemp-de-04-piso-com-mesa-de-vidro-e-dupla-chama-preto---bfo4xae-brbfo4xaeuna_prd-12499/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Lava-louças Electrolux 10 Serviços LL10X", url: "https://site.fastshop.com.br/lava-loucas-electrolux-com-a-porta-inox--10-servicos--07-programas-de-lavagem-e-funcao-higienizar-compras---ll10x-exll10x_prd-4105/p", store: 'fastshop', category: 'casa', active: true },
  { name: "Fogão de Piso Electrolux 4 Bocas Duplo Forno FE4DG", url: "https://site.fastshop.com.br/fogao-de-piso-electrolux-de-04-bocas-experience-com-duplo-forno-e-mesa-de-vidro-cinza---fe4dg-exfe4dg_prd-122651/p", store: 'fastshop', category: 'casa', active: true },
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
