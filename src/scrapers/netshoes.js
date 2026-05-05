const axios = require('axios');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

async function scrape(url) {
  try {
    const { data: html } = await axios.get(url, { timeout: 15000, headers: HEADERS });

    const ogImage = html.match(/property="og:image"\s+content="([^"]+)"/)?.[1] ?? null;

    // JSON-LD: Netshoes usa @graph com @type Product
    const scripts = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
    for (const s of scripts) {
      try {
        const d = JSON.parse(s[1]);
        const prod = d['@type'] === 'Product'
          ? d
          : d['@graph']?.find((x) => x['@type'] === 'Product')
          ?? d.product;

        if (!prod?.offers) continue;

        const raw = prod.offers.price ?? prod.offers.lowPrice ?? prod.offers[0]?.price;
        if (raw === undefined) continue;
        const price = parseFloat(String(raw).replace(',', '.'));
        if (isNaN(price)) continue;

        const name = prod.name;
        const rawImg = Array.isArray(prod.image) ? prod.image[0] : prod.image;
        const imageUrl = ogImage ?? rawImg ?? null;

        return { price, name, imageUrl };
      } catch {}
    }

    console.warn('[Netshoes] Preço não encontrado em:', url);
    return null;
  } catch (err) {
    console.error('[Netshoes] Erro ao raspar:', err.message);
    return null;
  }
}

module.exports = { scrape };
