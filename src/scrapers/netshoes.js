const { newPage } = require('./browser');

async function scrape(url) {
  let page;
  try {
    page = await newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Aguarda renderização do conteúdo do produto
    await page.waitForFunction(
      () => document.querySelectorAll('script[type="application/ld+json"]').length > 0,
      { timeout: 12000 }
    ).catch(() => {});

    const imageUrl = await page.$eval('meta[property="og:image"]', (el) => el.getAttribute('content')).catch(() => null);
    const name = await page.$eval('meta[property="og:title"]', (el) => el.getAttribute('content')).catch(() => null)
      || await page.title().catch(() => null);

    // Estratégia 1: JSON-LD
    const ldPrice = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      for (const s of scripts) {
        try {
          const d = JSON.parse(s.textContent);
          if (d['@type'] === 'Product' && d.offers) {
            const p = d.offers.price ?? d.offers.lowPrice ?? d.offers[0]?.price;
            if (p !== undefined) return parseFloat(String(p).replace(',', '.'));
          }
        } catch {}
      }
      return null;
    });

    if (ldPrice !== null && !isNaN(ldPrice)) return { price: ldPrice, imageUrl, name };

    // Estratégia 2: estado global da aplicação (Next.js / Redux)
    const statePrice = await page.evaluate(() => {
      try {
        const nd = window.__NEXT_DATA__?.props?.pageProps;
        if (nd) {
          const p = nd?.product?.price ?? nd?.product?.offers?.price ?? nd?.initialState?.product?.price;
          if (p) return parseFloat(String(p).replace(',', '.'));
        }
      } catch {}
      return null;
    });

    if (statePrice !== null && !isNaN(statePrice)) return { price: statePrice, imageUrl, name };

    // Estratégia 3: seletores CSS expandidos
    const raw = await page.evaluate(() => {
      const selectors = [
        '[data-testid="price-value"]',
        '[data-testid="price-sales"]',
        '[class*="Price__price"]',
        '[class*="price-sales"]',
        '[class*="price-value"]',
        '[class*="sale-price"]',
        '[class*="current-price"]',
        '[class*="sellingPrice"]',
        '[itemprop="price"]',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const v = el.getAttribute('content') || el.textContent;
          if (v && /\d/.test(v)) return v.trim();
        }
      }
      return null;
    });

    if (!raw) {
      console.warn('[Netshoes] Preço não encontrado em:', url);
      return null;
    }

    const price = parseFloat(raw.replace(/[^\d,]/g, '').replace(',', '.'));
    if (isNaN(price)) {
      console.warn('[Netshoes] Preço inválido:', raw);
      return null;
    }

    return { price, imageUrl, name };
  } catch (err) {
    console.error('[Netshoes] Erro ao raspar:', err.message);
    return null;
  } finally {
    if (page) await page.close();
  }
}

module.exports = { scrape };
