require('dotenv').config();
const { scrape } = require('../src/scrapers/mercadolivre');

const URLS = [
  'https://www.mercadolivre.com.br/apple-iphone-16-pro-128-gb-titnio-branco/p/MLB40287849',
  'https://www.mercadolivre.com.br/splash-sol-de-janeiro-brazilian-crush-cheirosa-62-90ml-vegan/p/MLB24244614',
  'https://www.mercadolivre.com.br/steam-deck-oled-512gb/p/MLB27635201',
  'https://produto.mercadolivre.com.br/MLB-5907332540-estojo-de-carregamento-para-galaxy-buds-fe-_JM',
];

(async () => {
  for (const url of URLS) {
    const t0 = Date.now();
    const r = await scrape(url);
    const ms = Date.now() - t0;
    console.log(`[${ms}ms]`, r ? `R$ ${r.price} — ${r.name?.slice(0, 50)}` : 'NULL', '<<', url.slice(0, 70));
  }
})();
