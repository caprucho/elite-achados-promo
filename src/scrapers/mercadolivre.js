const { newPage } = require('./browser');

async function scrape(url) {
  let page;
  try {
    page = await newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });

    const imageUrl = await page.$eval('meta[property="og:image"]', (el) => el.getAttribute('content')).catch(() => null);
    const name = await page.$eval('meta[property="og:title"]', (el) => el.getAttribute('content')).catch(() => null)
      || await page.title().catch(() => null);

    // Estratégia 1: JSON-LD (mais estável que seletores CSS)
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

    // Estratégia 2: meta itemprop
    const metaPrice = await page.$eval('meta[itemprop="price"]', (el) => el.getAttribute('content')).catch(() => null);
    if (metaPrice) {
      const p = parseFloat(metaPrice.replace(',', '.'));
      if (!isNaN(p) && p > 0) return { price: p, imageUrl, name };
    }

    // Estratégia 3: seletores CSS (aguarda até 8s)
    await page.waitForSelector('.andes-money-amount__fraction', { timeout: 8000 }).catch(() => {});

    const price = await page.evaluate(() => {
      const fractionEl = document.querySelector('.ui-pdp-price .andes-money-amount__fraction, .andes-money-amount__fraction');
      if (!fractionEl) return null;
      const fraction = fractionEl.textContent.trim().replace(/\./g, '').replace(',', '');
      const centsEl = document.querySelector('.ui-pdp-price .andes-money-amount__cents, .andes-money-amount__cents');
      const cents = centsEl ? centsEl.textContent.trim() : '00';
      const num = parseFloat(`${fraction}.${cents}`);
      return isNaN(num) || num <= 0 ? null : num;
    });

    if (price) return { price, imageUrl, name };

    console.warn('[MercadoLivre] Preço não encontrado em:', url);
    return null;
  } catch (err) {
    console.error('[MercadoLivre] Erro ao raspar:', err.message);
    return null;
  } finally {
    if (page) await page.close();
  }
}

module.exports = { scrape };
