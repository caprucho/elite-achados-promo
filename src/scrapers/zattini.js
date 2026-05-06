// Zattini (Dafiti Group). JSON-LD em @graph com AggregateOffer (offers.lowPrice).
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
        const list = Array.isArray(d) ? d : [d, ...(d['@graph'] || [])];
        for (const node of list) {
          if (node?.['@type'] !== 'Product') continue;

          const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
          const avail = String(offers?.availability || '').toLowerCase();
          if (avail.includes('outofstock') || avail.includes('discontinued')) {
            console.log('[Zattini] Produto fora de estoque:', url);
            return null;
          }

          const raw = offers?.price ?? offers?.lowPrice ?? offers?.[0]?.price;
          if (raw === undefined) continue;
          const price = parseFloat(String(raw).replace(',', '.'));
          if (isNaN(price) || price <= 0) continue;

          const rawImg = Array.isArray(node.image) ? node.image[0] : node.image;
          return {
            price,
            name:     node.name,
            imageUrl: ogImage ?? rawImg ?? null,
          };
        }
      } catch {}
    }

    console.warn('[Zattini] Preço não encontrado em:', url);
    return null;
  } catch (err) {
    console.error('[Zattini] Erro ao raspar:', err.message);
    return null;
  }
}

module.exports = { scrape };
