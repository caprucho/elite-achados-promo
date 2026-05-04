const { newPage } = require('./browser');

const PRICE_SELECTORS = [
  '[class*="special-price"] [class*="price-value"]',
  '[data-testid="pdp-price"]',
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

    // Tenta cada seletor até encontrar um com texto de preço válido
    let raw = null;
    for (const selector of PRICE_SELECTORS) {
      try {
        raw = await page.$eval(selector, (el) => el.textContent.trim());
        if (raw && /\d/.test(raw)) break;
        raw = null;
      } catch { /* seletor não encontrado, tenta próximo */ }
    }

    if (!raw) {
      // Último recurso: procura qualquer texto que pareça "R$ X.XXX,XX"
      raw = await page.evaluate(() => {
        const pattern = /R\$\s*[\d.,]+/;
        const els = Array.from(document.querySelectorAll('*'));
        for (const el of els) {
          if (el.children.length === 0 && pattern.test(el.textContent)) {
            return el.textContent.trim();
          }
        }
        return null;
      });
    }

    if (!raw) {
      console.warn('[Dafiti] Preço não encontrado em:', url);
      return null;
    }

    const price = parseFloat(raw.replace(/[^\d,]/g, '').replace(',', '.'));
    if (isNaN(price)) {
      console.warn('[Dafiti] Preço não é número válido:', raw);
      return null;
    }

    const imageUrl = await page.$eval('meta[property="og:image"]', (el) => el.getAttribute('content')).catch(() => null);
    const name = await page.$eval('meta[property="og:title"]', (el) => el.getAttribute('content')).catch(() => null)
      || await page.title().catch(() => null);

    return { price, imageUrl, name };
  } catch (err) {
    console.error('[Dafiti] Erro ao raspar:', err.message);
    return null;
  } finally {
    if (page) await page.close();
  }
}

module.exports = { scrape };
