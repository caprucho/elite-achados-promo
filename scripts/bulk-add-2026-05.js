// Bulk-add de produtos — script ad-hoc pra cadastrar lote do user.
// Cada URL é limpa (sem query), scraped, categorizada por keyword e salva
// via addProduct (que já aplica inferGender).
require('dotenv').config();
const { addProduct } = require('../src/db/queries');
const { getPrice } = require('../src/scrapers');

const URLS = [
  'https://www.mercadolivre.com.br/celular-samsung-galaxy-a17-5g-com-ia-128gb-4gb-ram-cm-de-50mp-tela-de-67-nfc-ip54-preto/p/MLB55027309',
  'https://www.mercadolivre.com.br/smart-tv-aoc-dled-32-wi-fi-roku-tv-quad-core-32s515578g/p/MLB60728265',
  'https://www.mercadolivre.com.br/cmera-inteligente-im7-3mp-de-resoluco-branca-intelbras/p/MLB47535705',
  'https://www.mercadolivre.com.br/monitor-gamer-lg-ultragear-24-24gs60f-b-ips-full-hd-180hz-1ms-gtg-nvidia-g-sync-amd-freesync-hdr10-srgb-99-hdmi-displayport/p/MLB38947984',
  'https://www.mercadolivre.com.br/notebook-acer-aspire-go-15-ag15-51p-55ll-intel-core-i5-1334u-153-8gb-256gb-ssd-windows-11-home/p/MLB58365219',
  'https://www.mercadolivre.com.br/smart-tv-profissional-lg-43-full-hd-processador-a5-ger6-ai-alexa-integrada-webos-23-43lr671c-b/p/MLB41106126',
  'https://www.mercadolivre.com.br/smartphone-infinix-smart-10-4gb-ram-256gb-ssd-cmera-8mp-ia-tela-667-hd-120hz-bateria-5000mah-processador-t7250-android-15-go-dual-chip-preto/p/MLB56327005',
  'https://www.mercadolivre.com.br/smartphone-motorola-moto-g35-5g-128gb-12gb-4gb-ram8gb-ram-boost-e-camera-50mp-com-ai-nfc-tela-67-com-superbrilho-verde-vegan-leather/p/MLB41541670',
  'https://www.mercadolivre.com.br/smart-tv-lg-43full-hd-processador-a5-ger6-ai-alexa-e-webos-23-43lr6700psa/p/MLB39205913',
  'https://www.mercadolivre.com.br/celular-samsung-galaxy-a07-256gb-8gb-cmera-50mp-verde/p/MLB54963045',
  'https://www.mercadolivre.com.br/smart-tv-43-aoc-led-roku-full-hd-wi-fi-60hz-hdmi-usb-43s515578g/p/MLB59090080',
  'https://www.mercadolivre.com.br/perfume-sedutor-arabe-sabah-100ml-original-feminino/up/MLBU3054985330',
  'https://www.mercadolivre.com.br/smart-tv-philco-58-p58vik-4k-uhd-led-roku-dolby-audio-wi-fi-hdr10-110220v/p/MLB67275824',
  'https://www.mercadolivre.com.br/smart-tv-philips-50-4k-50pug7300-comando-de-voz-bluetooth/p/MLB57723340',
  'https://www.mercadolivre.com.br/smart-tv-philco-50-p50vik-4k-uhd-led-roku-dolby-audio-wi-fi-hdr10-110220v/p/MLB67267597',
  'https://www.mercadolivre.com.br/parafusadeira-furadeira-c-2-baterias-maleta-kit-completo-led-eixo-flexivel-varios-niveis-torque/p/MLB50181290',
  'https://www.mercadolivre.com.br/caixa-de-som-boombox-plus-aiwa-bbs-01-b-200w-bt-30h-ip66-usb-preto/p/MLB46439669',
  'https://www.mercadolivre.com.br/smart-tv-philco-40-p40vik-led-roku-dolby-audio-wi-fi-hdmi-hdr-full-hd-110220v/p/MLB67270079',
  'https://www.mercadolivre.com.br/extratora-e-higienizadora-portatil-wap-spot-cleaner-w2-1600w-pulveriza-esfrega-e-extrai/p/MLB22511802',
  'https://www.mercadolivre.com.br/projetor-hy320-davely-smart-tv-android-wifi-6-390-ansi-lumens-full-hd-suporte-4k-hdmi-bluetooth-85-200-polegadas-alto-falante-com-controle-remoto-bivolt-portatil/p/MLB48959123',
  'https://www.mercadolivre.com.br/smart-tv-lg-uhd-ai-ua75-43-polegadas-hdr10-pro-processador-7-ai-ger8-webos-25/p/MLB51227508',
  'https://www.mercadolivre.com.br/micro-ondas-electrolux-de-bancada-branco-com-funco-tira-odor-e-manter-aquecido-34l-meo44/p/MLB8742310',
  'https://www.mercadolivre.com.br/impressora-multifuncional-hp-deskjet-ink-advantage-2975-colorida-1-usb-20-de-alta-velocidade-wi-fi-de-banda-dupla-100-a-240-vca-aj4y4aak4/p/MLB62998911',
  'https://www.mercadolivre.com.br/notebook-acer-aspire-go-15-ag15-51p-55c8-intel-core-i5-13-ger-8gb-ram-512gb-ssd-w11-153-ips-full-hd/p/MLB63466429',
  'https://www.mercadolivre.com.br/smart-tv-lg-uhd-ai-ua75-50-polegadas-hdr10-pro-processador-7-ai-ger8-webos-25/p/MLB53201474',
  'https://www.mercadolivre.com.br/prancha-lizze-chapinha-profissional-480-extreme/p/MLB24027627',
  'https://www.mercadolivre.com.br/jogo-de-panelas-inducao-antiaderente-cermica-10-pecas-ppg-pfoa-free-baunilha/p/MLB62276296',
  'https://www.mercadolivre.com.br/smart-tv-samsung-led-65-lh65befh4ggxzd-led-crystal-processor-4k-uhd-tizen-110v220v/p/MLB58375066',
  'https://www.mercadolivre.com.br/celular-samsung-galaxy-s25-fe-5g-128gb-8gb-ram-cmera-tripla-de-50128-tela-grande-de-67-azul-marinho/p/MLB61655019',
  'https://www.mercadolivre.com.br/maquina-de-lavar-consul-10kg-branca-com-dosagem-econmica-cwb10bb/p/MLB67841910',
  'https://www.mercadolivre.com.br/lavadora-de-alta-presso-krcher-pratica-black-1500-psilibras-1400w-300lh-com-aplicador-de-detergente-e-lanca-regulavel-127v/p/MLB47945119',
  'https://www.mercadolivre.com.br/monitor-gamer-aoc-agon-g42-24-200hz-03ms-ips-24g42he/p/MLB61497487',
];

function cleanUrl(url) {
  try {
    const u = new URL(url);
    u.search = ''; u.hash = '';
    return u.toString();
  } catch { return url; }
}

function inferCategory(name) {
  const n = name.toLowerCase();
  // Ordem importa — checks mais específicos primeiro
  if (/\bperfume|colon[ií]a|eau de|edt\b|edp\b/.test(n)) return 'perfumaria';
  if (/\bprancha|secador|chapinha|babyliss|escova alisad/.test(n)) return 'beleza';
  if (/\bcelular|smartphone|moto g|galaxy a|galaxy s|iphone|infinix/.test(n)) return 'smartphones';
  if (/\bsmart tv|smart-tv|\btv led|\btv 4k|television/.test(n)) return 'eletronicos';
  if (/\bcaixa de som|boombox|\bfone\b|headset|alto-falante|home theater|soundbar/.test(n)) return 'audio';
  if (/c[âa]mera|projetor/.test(n)) return 'eletronicos';
  if (/\bmonitor\b|\bnotebook\b|\bteclado\b|\bmouse\b|impressora|placa de v[ií]deo|placa-m[ãa]e|processador/.test(n)) return 'hardware';
  if (/parafusadeira|furadeira|micro-ondas|microondas|geladeira|fog[ãa]o|lavadora|m[áa]quina de lavar|jogo de panelas|panela|extratora|aspirador|cafeteira|liquidificador|batedeira/.test(n)) return 'casa';
  return null;
}

(async () => {
  console.log(`Processando ${URLS.length} URLs...\n`);
  const ADMIN = process.env.TELEGRAM_ADMIN_USER_ID;
  let ok = 0, fail = 0, skipped = 0;
  const failures = [];

  for (const rawUrl of URLS) {
    const url = cleanUrl(rawUrl);
    try {
      const r = await getPrice(url);
      if (!r || !r.price || !r.name) {
        console.log(`  ❌ NULL ${url.slice(0,70)}`);
        fail++;
        failures.push({ url, reason: 'scrape null' });
        continue;
      }
      const category = inferCategory(r.name) || '(sem categoria)';
      const cat = category === '(sem categoria)' ? null : category;
      const { id, status } = await addProduct(r.name, url, 'mercadolivre', {
        category: cat,
        addedByTelegramId: ADMIN,
        addedByUsername: 'admin-bulk',
      });
      if (status === 'already_active') {
        console.log(`  ⏭️  já existe — ${r.name.slice(0,55)}`);
        skipped++;
      } else {
        const tag = status === 'reactivated' ? '♻️ ' : '✅ ';
        console.log(`  ${tag}[${category.padEnd(11)}] R$ ${String(r.price).padStart(8)}  ${r.name.slice(0,55)}`);
        ok++;
      }
    } catch (err) {
      console.log(`  ❌ ERR ${err.message.slice(0,40)} ${url.slice(0,40)}`);
      fail++;
      failures.push({ url, reason: err.message });
    }
    await new Promise((res) => setTimeout(res, 1500));
  }

  console.log(`\n=== ${ok} cadastrados / ${skipped} já existiam / ${fail} falharam ===`);
  if (failures.length) {
    console.log('\nFalhas:');
    for (const f of failures) console.log(' ', f.reason, '—', f.url);
  }
  process.exit(0);
})();
