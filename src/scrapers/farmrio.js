const { newPage } = require('./browser');

async function scrape(url) {
  let page;
  try {
    page = await newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Aguarda o estado VTEX ser populado
    await page.waitForFunction(
      () => document.querySelectorAll('script[type="application/ld+json"]').length > 0
        || window.__STATE__ != null,
      { timeout: 15000 }
    ).catch(() => {});

    const imageUrl = await page.$eval('meta[property="og:image"]', (el) => el.getAttribute('content')).catch(() => null);
    const name = await page.$eval('meta[property="og:title"]', (el) => el.getAttribute('content')).catch(() => null)
      || await page.title().catch(() => null);

    // Estratégia 1: JSON-LD (VTEX io expõe Product schema)
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

    // Estratégia 2: __STATE__ global (VTEX io armazena produtos aqui)
    const statePrice = await page.evaluate(() => {
      try {
        const state = window.__STATE__;
        if (!state) return null;
        for (const key of Object.keys(state)) {
          const node = state[key];
          if (node && node.__typename === 'Offer' && typeof node.price === 'number' && node.price > 0) {
            return node.price;
          }
        }
      } catch {}
      return null;
    });

    if (statePrice !== null && !isNaN(statePrice)) return { price: statePrice, imageUrl, name };

    // Estratégia 3: seletores VTEX (fallback)
    const raw = await page.evaluate(() => {
      const selectors = [
        '[class*="sellingPriceValue"]',
        '[class*="sellingPrice"]',
        '[class*="currencyContainer"]',
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
      console.warn('[FarmRio] Preço não encontrado em:', url);
      return null;
    }

    const price = parseFloat(raw.replace(/[^\d,]/g, '').replace(',', '.'));
    if (isNaN(price)) {
      console.warn('[FarmRio] Preço inválido:', raw);
      return null;
    }

    return { price, imageUrl, name };
  } catch (err) {
    console.error('[FarmRio] Erro ao raspar:', err.message);
    return null;
  } finally {
    if (page) await page.close();
  }
}

module.exports = { scrape };
