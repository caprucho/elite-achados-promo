const mercadolivre = require('./mercadolivre');
const amazon       = require('./amazon');
const dafiti       = require('./dafiti');
const kabum        = require('./kabum');
const wap          = require('./wap');
const netshoes     = require('./netshoes');
const farmrio      = require('./farmrio');

const ROUTES = [
  { match: (h) => h.includes('mercadolivre.com'),                scraper: mercadolivre },
  { match: (h) => h.includes('amazon.com') || h === 'amzn.to',  scraper: amazon       },
  { match: (h) => h.includes('dafiti.com'),                      scraper: dafiti       },
  { match: (h) => h.includes('kabum.com'),                       scraper: kabum        },
  { match: (h) => h.includes('wap.ind.br'),                      scraper: wap          },
  { match: (h) => h.includes('netshoes.com'),                    scraper: netshoes     },
  { match: (h) => h.includes('farmrio.com'),                     scraper: farmrio      },
];

async function getPrice(productUrl) {
  let hostname;
  try {
    hostname = new URL(productUrl).hostname;
  } catch {
    console.error('[Router] URL inválida:', productUrl);
    return null;
  }

  const route = ROUTES.find((r) => r.match(hostname));

  if (!route) {
    console.warn('[Router] Loja não suportada:', hostname);
    return null;
  }

  return route.scraper.scrape(productUrl);
}

module.exports = { getPrice };
