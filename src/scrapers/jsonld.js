// Scraper genérico para lojas que expõem preço via JSON-LD (Schema.org Product).
// Funciona em VTEX, Shopify e a maioria dos e-commerces brasileiros que seguem
// padrão Schema.org. Cobre 3 fallbacks na ordem:
//   1. JSON-LD <script type="application/ld+json"> com Product/offers.price
//   2. <meta itemprop="price" content="..."> (Sephora e similares)
//   3. <meta property="product:price:amount" content="..."> (Open Graph product)
const axios = require('axios');
const { parsePriceBR } = require('../utils/parsePrice');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
};

function findProduct(node) {
  if (!node || typeof node !== 'object') return null;
  const t = String(node['@type'] || '').toLowerCase();
  if (t === 'product') return node;
  const pt = String(node.product?.['@type'] || '').toLowerCase();
  if (pt === 'product') return node.product;
  return null;
}

function extractFromJsonLd(html) {
  const blocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of blocks) {
    try {
      const d = JSON.parse(m[1]);
      const candidates = Array.isArray(d) ? d : [d, ...(d['@graph'] || [])];

      for (const c of candidates) {
        const prod = findProduct(c);
        if (!prod) continue;

        const offers = Array.isArray(prod.offers) ? prod.offers[0] : prod.offers;
        if (offers) {
          const avail = String(offers.availability || '').toLowerCase();
          if (avail.includes('outofstock') || avail.includes('discontinued')) {
            return { unavailable: true };
          }
          const raw = offers.price ?? offers.lowPrice ?? offers.highPrice;
          if (raw !== undefined && raw !== null) {
            const price = parseFloat(String(raw).replace(',', '.'));
            if (!isNaN(price) && price > 0) {
              const rawImg = Array.isArray(prod.image) ? prod.image[0] : prod.image;
              return {
                price,
                name:     prod.name || null,
                imageUrl: typeof rawImg === 'string' ? rawImg : rawImg?.url || null,
              };
            }
          }
        }
      }
    } catch {}
  }
  return null;
}

function extractFromMeta(html) {
  const ogImage = html.match(/property="og:image"\s+content="([^"]+)"/)?.[1] ?? null;
  const ogTitle = html.match(/property="og:title"\s+content="([^"]+)"/)?.[1] ?? null;

  // <meta itemprop="price" content="323.0">
  const itempropPrice = html.match(/<meta[^>]+itemprop=["']price["'][^>]+content=["']([^"']+)["']/i)?.[1]
                     ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+itemprop=["']price["']/i)?.[1];
  if (itempropPrice) {
    const price = parseFloat(String(itempropPrice).replace(',', '.'));
    if (!isNaN(price) && price > 0) {
      return { price, name: ogTitle, imageUrl: ogImage };
    }
  }

  // Open Graph product:price:amount
  const ogPrice = html.match(/property=["']product:price:amount["']\s+content=["']([^"']+)["']/i)?.[1];
  if (ogPrice) {
    const price = parseFloat(String(ogPrice).replace(',', '.'));
    if (!isNaN(price) && price > 0) {
      return { price, name: ogTitle, imageUrl: ogImage };
    }
  }

  return null;
}

async function scrape(url) {
  let html;
  try {
    const r = await axios.get(url, { timeout: 20000, headers: HEADERS, maxRedirects: 5, validateStatus: () => true });
    if (r.status !== 200 || !r.data || r.data.length < 5000) {
      console.warn('[jsonld] Status inválido:', r.status, 'em', url);
      return null;
    }
    html = r.data;
  } catch (err) {
    console.error('[jsonld] Erro ao raspar:', err.message);
    return null;
  }

  // 1. JSON-LD
  const ld = extractFromJsonLd(html);
  if (ld?.unavailable) {
    console.log('[jsonld] Produto fora de estoque:', url);
    return null;
  }
  if (ld?.price) return ld;

  // 2/3. Meta tags como fallback
  const meta = extractFromMeta(html);
  if (meta) return meta;

  console.warn('[jsonld] Preço não encontrado em:', url);
  return null;
}

module.exports = { scrape };
