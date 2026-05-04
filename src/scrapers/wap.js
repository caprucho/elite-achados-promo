const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Referer': 'https://loja.wap.ind.br/',
};

function parsePrice(raw) {
  const cleaned = raw.replace(/[^\d,]/g, '').replace(',', '.');
  const price = parseFloat(cleaned);
  return isNaN(price) ? null : price;
}

async function scrape(url) {
  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 10000 });
    const $ = cheerio.load(data);

    // Estratégia 1: JSON-LD (WAP usa VTEX que emite schema Product padrão)
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
        // JSON-LD malformado — tenta próxima estratégia
      }
    }

    // Estratégia 2: seletores VTEX (plataforma usada pela WAP)
    const raw =
      $('.skuBestPrice').first().text().trim()         ||
      $('.productPrice .price').first().text().trim()  ||
      $('[class*="bestPrice"]').first().text().trim()  ||
      $('[class*="sellingPrice"]').first().text().trim();

    if (!raw) {
      console.warn('[WAP] Nenhum seletor encontrou o preço em:', url);
      return null;
    }

    const price = parsePrice(raw);
    if (price === null) {
      console.warn('[WAP] Preço extraído não é um número válido:', raw);
    }

    return price !== null ? { price, imageUrl, name } : null;
  } catch (err) {
    console.error('[WAP] Erro ao raspar:', err.message);
    return null;
  }
}

module.exports = { scrape };
