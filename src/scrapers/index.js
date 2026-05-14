const mercadolivre = require('./mercadolivre');
const amazon       = require('./amazon');
const dafiti       = require('./dafiti');
const kabum        = require('./kabum');
const wap          = require('./wap');
const netshoes     = require('./netshoes');
const farmrio      = require('./farmrio');
const animale      = require('./animale');
const zattini      = require('./zattini');
const jsonld       = require('./jsonld');

const ROUTES = [
  { match: (h) => h.includes('mercadolivre.com'),                scraper: mercadolivre },
  { match: (h) => h.includes('amazon.com') || h === 'amzn.to',  scraper: amazon       },
  // Dafiti hoje só tem <meta itemprop="price"> (sem JSON-LD Product) — jsonld.js cobre
  { match: (h) => h.includes('dafiti.com'),                      scraper: jsonld       },
  { match: (h) => h.includes('kabum.com'),                       scraper: kabum        },
  // WAP usa VTEX com AggregateOffer (lowPrice) — jsonld.js cobre
  { match: (h) => h.includes('wap.ind.br'),                      scraper: jsonld       },
  { match: (h) => h.includes('netshoes.com'),                    scraper: netshoes     },
  { match: (h) => h.includes('farmrio.com'),                     scraper: farmrio      },
  { match: (h) => h.includes('animale.com'),                     scraper: animale      },
  { match: (h) => h.includes('zattini.com'),                     scraper: zattini      },
  // Lojas com JSON-LD padrão Schema.org — usam scraper genérico
  { match: (h) => h.includes('apple.com'),                       scraper: jsonld       },
  { match: (h) => h.includes('lg.com'),                          scraper: jsonld       },
  { match: (h) => h.includes('keychronbrasil.com'),              scraper: jsonld       },
  { match: (h) => h.includes('fastshop.com'),                    scraper: jsonld       },
  { match: (h) => h.includes('infocellshop.com'),                scraper: jsonld       },
  { match: (h) => h.includes('iceloshop.com'),                   scraper: jsonld       },
  { match: (h) => h.includes('sephora.com'),                     scraper: jsonld       },
  { match: (h) => h.includes('pichau.com'),                      scraper: jsonld       },
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
