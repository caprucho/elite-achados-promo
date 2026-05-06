// Animale (Soma Group, mesma stack VTEX do Farm Rio).
// JSON-LD usa schema ProductDetailsPage com .product aninhado.
const axios = require('axios');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

async function scrape(url) {
  try {
    const { data: html } = await axios.get(url, { timeout: 15000, headers: HEADERS, maxRedirects: 5 });

    const ogImage = html.match(/property="og:image"\s+content="([^"]+)"/)?.[1] ?? null;

    const scripts = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
    for (const s of scripts) {
      try {
        const d = JSON.parse(s[1]);
        const prod = d['@type'] === 'Product' ? d : d.product;
        if (!prod?.offers) continue;

        const price = prod.offers.price ?? prod.offers.lowPrice ?? prod.offers[0]?.price;
        if (price === undefined || isNaN(parseFloat(price))) continue;

        const name = d.seo?.title ?? prod.name;
        const rawImg = Array.isArray(prod.image) ? prod.image[0]?.url ?? prod.image[0] : prod.image;
        const imageUrl = ogImage ?? rawImg ?? null;

        return { price: parseFloat(price), name, imageUrl };
      } catch {}
    }

    console.warn('[Animale] Preço não encontrado em:', url);
    return null;
  } catch (err) {
    console.error('[Animale] Erro ao raspar:', err.message);
    return null;
  }
}

module.exports = { scrape };
