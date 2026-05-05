const { newPage } = require('./browser');

async function scrape(url) {
  let page;
  try {
    page = await newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    const imageUrl = await page.$eval('meta[property="og:image"]', (el) => el.getAttribute('content')).catch(() => null);
    const name = await page.$eval('meta[property="og:title"]', (el) => el.getAttribute('content')).catch(() => null)
      || await page.title().catch(() => null);

    // Estratégia 1: JSON-LD (mais confiável e independente de classe CSS)
    const ldPrice = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      for (const s of scripts) {
        try {
          const d = JSON.parse(s.textContent);
          if (d['@type'] === 'Product' && d.offers) {
            const p = d.offers.price ?? d.offers[0]?.price;
            if (p !== undefined) return parseFloat(String(p).replace(',', '.'));
          }
        } catch {}
      }
      return null;
    });

    if (ldPrice !== null && !isNaN(ldPrice)) return { price: ldPrice, imageUrl, name };

    // Estratégia 2: seletores CSS (fallback)
    const raw = await page.evaluate(() => {
      const selectors = [
        '[data-testid="price-value"]',
        '[data-testid="price-sales"]',
        '[class*="Price__price"]',
        '[class*="price-sales"]',
        '[class*="price-value"]',
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
