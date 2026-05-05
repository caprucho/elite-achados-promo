const { newPage } = require('./browser');
const { parsePriceBR } = require('../utils/parsePrice');

const PRICE_SELECTORS = [
  '[data-testid="pdp-price"]',
  '[class*="special-price"] [class*="price-value"]',
  '[class*="pdp-price"]',
  '[class*="product-price"] [class*="special"]',
  '[class*="product-price"]',
  '[class*="price-value"]',
  '[class*="sales-price"]',
];

async function scrape(url) {
  let page;
  try {
    page = await newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });

    // 1) Tenta JSON-LD (mais confiável — independe de classes CSS)
    const jsonLdPrice = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of scripts) {
        try {
          const d = JSON.parse(s.textContent);
          const list = Array.isArray(d) ? d : [d, ...(d['@graph'] || [])];
          for (const node of list) {
            if (node?.['@type'] !== 'Product') continue;
            const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
            const avail = String(offers?.availability || '').toLowerCase();
            if (avail.includes('outofstock') || avail.includes('discontinued')) {
              return { unavailable: true };
            }
            const raw = offers?.price ?? offers?.lowPrice;
            if (raw !== undefined && raw !== null) {
              const num = parseFloat(String(raw).replace(',', '.'));
              if (!isNaN(num) && num > 0) return { price: num, name: node.name };
            }
          }
        } catch {}
      }
      return null;
    });

    if (jsonLdPrice?.unavailable) {
      console.log('[Dafiti] Produto fora de estoque:', url);
      return null;
    }

    const imageUrl = await page.$eval('meta[property="og:image"]', (el) => el.getAttribute('content')).catch(() => null);
    const ogTitle  = await page.$eval('meta[property="og:title"]', (el) => el.getAttribute('content')).catch(() => null);

    if (jsonLdPrice?.price) {
      return { price: jsonLdPrice.price, imageUrl, name: jsonLdPrice.name || ogTitle };
    }

    // 2) Fallback: seletores CSS
    let raw = null;
    for (const selector of PRICE_SELECTORS) {
      try {
        raw = await page.$eval(selector, (el) => el.textContent.trim());
        if (raw && /\d/.test(raw)) break;
        raw = null;
      } catch {}
    }

    if (!raw) {
      console.warn('[Dafiti] Preço não encontrado em:', url);
      return null;
    }

    const price = parsePriceBR(raw);
    if (!price) {
      console.warn('[Dafiti] Preço não é número válido:', raw);
      return null;
    }

    return { price, imageUrl, name: ogTitle };
  } catch (err) {
    console.error('[Dafiti] Erro ao raspar:', err.message);
    return null;
  } finally {
    if (page) await page.close();
  }
}

module.exports = { scrape };
