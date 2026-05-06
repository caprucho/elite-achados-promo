// Amazon BR — axios + regex (sem Puppeteer).
// Preço fica em <span class="a-offscreen">R$ X,YY</span> (1º match = preço principal).
// Nome em <span id="productTitle">. Imagem em og:image.
const axios = require('axios');
const { parsePriceBR } = require('../utils/parsePrice');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
};

async function scrape(url) {
  let html;
  try {
    const r = await axios.get(url, { headers: HEADERS, timeout: 20000, maxRedirects: 5, validateStatus: () => true });
    if (r.status !== 200) {
      console.warn('[Amazon] Status:', r.status, 'em', url);
      return null;
    }
    html = r.data;
  } catch (err) {
    console.error('[Amazon] Erro de fetch:', err.message);
    return null;
  }

  // Detecta página de captcha/anti-bot da Amazon
  if (!html || html.length < 50000 || /To discuss automated access|api-services-support@amazon/i.test(html)) {
    console.warn('[Amazon] Página de anti-bot detectada em:', url);
    return null;
  }

  // Detecta produto fora de estoque
  if (/Indispon[íi]vel\s*<\/span>|Atualmente, este item est[áa] indispon[íi]vel/i.test(html)) {
    console.log('[Amazon] Produto indisponível:', url);
    return null;
  }

  // Preço — <span class="a-offscreen">R$ X,YY</span> (1º match)
  const priceMatch = html.match(/<span class="a-offscreen">([^<]+)<\/span>/);
  const rawPrice = priceMatch?.[1];
  const price = parsePriceBR(rawPrice);
  if (!price || price <= 0) {
    console.warn('[Amazon] Preço não encontrado em:', url);
    return null;
  }

  // Nome — <span id="productTitle">name</span>
  const nameMatch = html.match(/<span id="productTitle"[^>]*>([\s\S]*?)<\/span>/);
  const name = nameMatch?.[1]?.trim().replace(/\s+/g, ' ') || null;

  // Imagem — og:image; fallback hi-res
  const ogImage = html.match(/property="og:image"\s+content="([^"]+)"/)?.[1] ?? null;
  const hiRes   = html.match(/"hiRes":"([^"]+)"/)?.[1] ?? null;
  const imageUrl = ogImage || hiRes || null;

  return { price, name, imageUrl };
}

module.exports = { scrape };
