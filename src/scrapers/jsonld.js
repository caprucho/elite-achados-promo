// Scraper genérico para lojas que expõem dados via JSON-LD (Schema.org Product)
// e/ou meta tags. Extrai preço, nome e imagem independentemente — o preço pode
// vir de uma fonte (ex: meta itemprop) e a imagem de outra (ex: Product.image).
const axios = require('axios');

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

function findProduct(node) {
  if (!node || typeof node !== 'object') return null;
  const t = String(node['@type'] || '').toLowerCase();
  if (t === 'product') return node;
  const pt = String(node.product?.['@type'] || '').toLowerCase();
  if (pt === 'product') return node.product;
  return null;
}

function collectProducts(html) {
  const found = [];
  const blocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of blocks) {
    try {
      const d = JSON.parse(m[1]);
      const candidates = Array.isArray(d) ? d : [d, ...(d['@graph'] || [])];
      for (const c of candidates) {
        const prod = findProduct(c);
        if (prod) found.push(prod);
      }
    } catch {}
  }
  return found;
}

function offerAvailable(o) {
  // Sem availability declarada → assume disponível (muitas lojas omitem).
  const avail = String(o?.availability || '').toLowerCase();
  if (!avail) return true;
  return !(avail.includes('outofstock') || avail.includes('soldout') || avail.includes('discontinued'));
}

// Fora de estoque SÓ se TODAS as ofertas de TODOS os Products estiverem
// esgotadas. Um produto com variantes (ex: Keychron: switch X esgotado, switch
// Y disponível) NÃO deve ser tratado como indisponível só porque a 1ª variante
// listada está sem estoque.
function allOutOfStock(products) {
  let sawAnyOffer = false;
  for (const prod of products) {
    const offersArr = Array.isArray(prod.offers) ? prod.offers : [prod.offers];
    for (const o of offersArr) {
      if (!o) continue;
      sawAnyOffer = true;
      if (offerAvailable(o)) return false; // achou uma comprável → disponível
    }
  }
  return sawAnyOffer; // só "fora de estoque" se vimos ofertas e nenhuma disponível
}

function extractPriceFromProduct(prod) {
  // Página pode ter múltiplas ofertas pro mesmo produto (variantes, pacotes).
  // Pegamos o MENOR preço ENTRE AS DISPONÍVEIS — é o preço de entrada que dá
  // pra comprar de fato. Ignora variantes esgotadas (não adianta postar preço
  // de algo que não está à venda).
  const offersArr = Array.isArray(prod.offers) ? prod.offers : [prod.offers];
  const prices = [];
  for (const o of offersArr) {
    if (!o || !offerAvailable(o)) continue;
    const raw = o.price ?? o.lowPrice ?? o.highPrice;
    if (raw === undefined || raw === null) continue;
    const p = parseFloat(String(raw).replace(',', '.'));
    if (!isNaN(p) && p > 0) prices.push(p);
  }
  return prices.length ? Math.min(...prices) : null;
}

function extractPriceFromMeta(html) {
  const itemprop = html.match(/<meta[^>]+itemprop=["']price["'][^>]+content=["']([^"']+)["']/i)?.[1]
                ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+itemprop=["']price["']/i)?.[1];
  if (itemprop) {
    const p = parseFloat(String(itemprop).replace(',', '.'));
    if (!isNaN(p) && p > 0) return p;
  }
  const og = html.match(/property=["']product:price:amount["']\s+content=["']([^"']+)["']/i)?.[1];
  if (og) {
    const p = parseFloat(String(og).replace(',', '.'));
    if (!isNaN(p) && p > 0) return p;
  }
  return null;
}

function extractImage(html, products) {
  // 1. og:image (mais confiável)
  const og = html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1];
  if (og) return og;

  // 2. Product.image do JSON-LD
  for (const p of products) {
    const img = Array.isArray(p.image) ? p.image[0] : p.image;
    if (typeof img === 'string') return img;
    if (img?.url) return img.url;
    if (img?.contentUrl) return img.contentUrl;
  }

  // 3. <meta itemprop="image">
  const meta = html.match(/<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (meta) return meta;

  return null;
}

function extractName(html, products) {
  for (const p of products) {
    if (p.name && typeof p.name === 'string') return p.name;
  }
  const og = html.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1];
  return og || null;
}

async function scrape(url) {
  let html;
  try {
    const r = await axios.get(url, { timeout: 20000, headers: HEADERS, maxRedirects: 5, validateStatus: () => true });
    if (r.status !== 200 || !r.data || r.data.length < 5000) {
      console.warn('[jsonld] Status inválido:', r.status, 'em', url);
      return null;
    }
    html = r.data;
  } catch (err) {
    console.error('[jsonld] Erro ao raspar:', err.message);
    return null;
  }

  const products = collectProducts(html);

  // Indisponível só se TODAS as ofertas estiverem esgotadas (variante esgotada
  // não derruba o produto se há outra disponível).
  if (allOutOfStock(products)) {
    console.log('[jsonld] Produto fora de estoque (todas as variantes):', url);
    return null;
  }

  // Tenta preço via JSON-LD primeiro, depois meta tags
  let price = null;
  for (const p of products) {
    price = extractPriceFromProduct(p);
    if (price) break;
  }
  if (!price) price = extractPriceFromMeta(html);

  if (!price) {
    console.warn('[jsonld] Preço não encontrado em:', url);
    return null;
  }

  return {
    price,
    name:     extractName(html, products),
    imageUrl: extractImage(html, products),
  };
}

module.exports = { scrape };
