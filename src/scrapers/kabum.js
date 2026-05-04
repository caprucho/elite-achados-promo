const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Referer': 'https://www.kabum.com.br/',
};

function parsePrice(raw) {
  // "R$ 3.299,00" ou "3299.00" → 3299.00
  const cleaned = raw.replace(/[^\d,]/g, '').replace(',', '.');
  const price = parseFloat(cleaned);
  return isNaN(price) ? null : price;
}

async function scrape(url) {
  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 10000 });
    const $ = cheerio.load(data);

    // Estratégia 1: JSON-LD (mais confiável, independe de classe CSS)
    const jsonLdRaw = $('script[type="application/ld+json"]')
      .toArray()
      .map((el) => $(el).html())
      .find((raw) => raw && raw.includes('"offers"'));

    let imageUrl = $('meta[property="og:image"]').attr('content') || null;
    let name = $('meta[property="og:title"]').attr('content') || $('title').text().trim() || null;

    if (jsonLdRaw) {
      try {
        const jsonLd = JSON.parse(jsonLdRaw);
        const offerPrice = jsonLd?.offers?.price ?? jsonLd?.offers?.[0]?.price;
        if (!imageUrl) {
          const img = jsonLd?.image;
          imageUrl = Array.isArray(img) ? img[0] : (img || null);
        }
        if (!name && jsonLd?.name) name = jsonLd.name;
        if (offerPrice !== undefined) {
          const price = parseFloat(String(offerPrice));
          if (!isNaN(price)) return { price, imageUrl, name };
        }
      } catch {
        // JSON-LD malformado — tenta seletor CSS
      }
    }

    // Estratégia 2: seletor CSS do KaBuM (fallback)
    const raw =
      $('h4.sc-eDvSVe').first().text().trim() ||
      $('[class*="regularPrice"]').first().text().trim() ||
      $('[class*="priceCard"] h4').first().text().trim();

    if (!raw) {
      console.warn('[KaBuM] Nenhum seletor encontrou o preço em:', url);
      return null;
    }

    const price = parsePrice(raw);
    if (price === null) {
      console.warn('[KaBuM] Preço extraído não é um número válido:', raw);
    }

    return price !== null ? { price, imageUrl, name } : null;
  } catch (err) {
    console.error('[KaBuM] Erro ao raspar:', err.message);
    return null;
  }
}

module.exports = { scrape };
