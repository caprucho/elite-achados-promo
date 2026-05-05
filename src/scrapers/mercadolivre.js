const axios = require('axios');
const { newPage } = require('./browser');

function extractMlId(url) {
  // Catálogo: /p/MLB123456
  const catalog = url.match(/\/p\/(MLB\d+)/i);
  if (catalog) return { type: 'product', id: catalog[1] };

  // produto.mercadolivre.com.br/MLB-6691770124-...
  const produto = url.match(/MLB-(\d+)/i);
  if (produto) return { type: 'item', id: `MLB${produto[1]}` };

  // Página de item: MLB123456 na URL
  const item = url.match(/(MLB\d+)/i);
  if (item) return { type: 'item', id: item[1] };

  return null;
}

async function scrapeViaApi(mlId) {
  const endpoint = mlId.type === 'product'
    ? `https://api.mercadolivre.com.br/products/${mlId.id}`
    : `https://api.mercadolivre.com.br/items/${mlId.id}`;

  const { data } = await axios.get(endpoint, { timeout: 10000 });

  const price = mlId.type === 'product'
    ? (data.buy_box_winner?.price ?? data.lowest_price)
    : data.price;
  const name      = mlId.type === 'product' ? data.name  : data.title;
  const imageUrl  = data.pictures?.[0]?.url || data.thumbnail || null;

  if (!price || isNaN(parseFloat(price))) return null;
  return { price: parseFloat(price), name, imageUrl };
}

async function scrape(url) {
  // Estratégia 1: API pública ML (sem Puppeteer, sem bot detection)
  const mlId = extractMlId(url);
  if (mlId) {
    try {
      const result = await scrapeViaApi(mlId);
      if (result) return result;
    } catch (err) {
      console.warn('[MercadoLivre] API falhou, tentando Puppeteer:', err.message);
    }
  }

  // Estratégia 2: Puppeteer + JSON-LD (fallback)
  let page;
  try {
    page = await newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    const imageUrl = await page.$eval('meta[property="og:image"]', (el) => el.getAttribute('content')).catch(() => null);
    const name     = await page.$eval('meta[property="og:title"]',  (el) => el.getAttribute('content')).catch(() => null)
      || await page.title().catch(() => null);

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
