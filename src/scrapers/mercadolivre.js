const axios = require('axios');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

let _token = null;
let _tokenExpiry = 0;

async function getToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;

  const { ML_APP_ID, ML_CLIENT_SECRET } = process.env;
  if (!ML_APP_ID || !ML_CLIENT_SECRET) return null;

  try {
    const { data } = await axios.post(
      'https://api.mercadolibre.com/oauth/token',
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: ML_APP_ID,
        client_secret: ML_CLIENT_SECRET,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
    );

    _token = data.access_token;
    _tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
    return _token;
  } catch {
    return null;
  }
}

function extractMlId(url) {
  // /up/MLBU<num> — produto unificado (linha de variantes); mesmo endpoint que catálogo
  const unified = url.match(/\/up\/(MLBU\d+)/i);
  if (unified) return { type: 'product', id: unified[1] };

  // /p/MLB<num> — catálogo
  const catalog = url.match(/\/p\/(MLB\d+)/i);
  if (catalog) return { type: 'product', id: catalog[1] };

  // MLB-<num> — item direto (não-catálogo)
  const produto = url.match(/MLB-(\d+)/i);
  if (produto) return { type: 'item', id: `MLB${produto[1]}` };

  // MLB<num> dentro do path (fallback)
  const item = url.match(/(MLB\d+)/i);
  if (item) return { type: 'item', id: item[1] };

  return null;
}

async function scrapeViaApi(mlId) {
  const token = await getToken();
  if (!token) return null;
  const headers = { Authorization: `Bearer ${token}` };

  if (mlId.type === 'product') {
    // /products/{id}/items retorna lista de vendedores com preço — endpoint que funciona
    const { data: items } = await axios.get(
      `https://api.mercadolibre.com/products/${mlId.id}/items?limit=5`,
      { timeout: 10000, headers }
    );

    const list = items.results || items;
    if (!Array.isArray(list) || list.length === 0) return null;

    // Pega o item com menor preço entre os primeiros (proxy de "buy box")
    const valid = list.filter((i) => i?.price && !isNaN(parseFloat(i.price)));
    if (valid.length === 0) return null;
    const cheapest = valid.reduce((a, b) => (parseFloat(a.price) <= parseFloat(b.price) ? a : b));

    // Busca metadados do catálogo (nome e imagem oficiais)
    let name = cheapest.title;
    let imageUrl = cheapest.thumbnail || null;
    try {
      const { data: prod } = await axios.get(
        `https://api.mercadolibre.com/products/${mlId.id}`,
        { timeout: 10000, headers }
      );
      name = prod.name || name;
      imageUrl = prod.pictures?.[0]?.url || imageUrl;
    } catch {} // metadado é opcional

    return { price: parseFloat(cheapest.price), name, imageUrl };
  }

  // Item direto (não catálogo)
  const { data: item } = await axios.get(
    `https://api.mercadolibre.com/items/${mlId.id}`,
    { timeout: 10000, headers }
  );

  if (!item.price || isNaN(parseFloat(item.price))) return null;
  return {
    price:    parseFloat(item.price),
    name:     item.title,
    imageUrl: item.pictures?.[0]?.url || item.thumbnail || null,
  };
}

function parsePrice(raw) {
  if (raw === undefined || raw === null) return NaN;
  const s = String(raw).replace(/[^\d.,]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  return parseFloat(s);
}

async function scrapeViaHtml(url) {
  const { data: html } = await axios.get(url, { timeout: 15000, headers: HEADERS, maxRedirects: 5 });

  const ogImage = html.match(/property="og:image"\s+content="([^"]+)"/)?.[1] ?? null;
  const ogTitle = html.match(/property="og:title"\s+content="([^"]+)"/)?.[1] ?? null;

  // 1) JSON-LD Product schema
  const scripts = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const s of scripts) {
    try {
      const d = JSON.parse(s[1]);
      const candidates = Array.isArray(d) ? d : [d, ...(d['@graph'] || [])];
      for (const node of candidates) {
        if (!node || node['@type'] !== 'Product') continue;
        const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
        const raw = offers?.price ?? offers?.lowPrice;
        const price = parsePrice(raw);
        if (!isNaN(price) && price > 0) {
          const rawImg = Array.isArray(node.image) ? node.image[0] : node.image;
          return {
            price,
            name:     node.name || ogTitle,
            imageUrl: ogImage || rawImg || null,
          };
        }
      }
    } catch {}
  }

  // 2) Meta itemprop
  const metaPrice = html.match(/<meta\s+itemprop="price"\s+content="([^"]+)"/i)?.[1];
  if (metaPrice) {
    const price = parsePrice(metaPrice);
    if (!isNaN(price) && price > 0) {
      return { price, name: ogTitle, imageUrl: ogImage };
    }
  }

  // 3) andes-money-amount fraction + cents (estrutura visual do ML)
  const andesMatch = html.match(/<span[^>]*class="[^"]*andes-money-amount__fraction[^"]*"[^>]*>([\d.]+)<\/span>(?:[\s\S]{0,200}?<span[^>]*class="[^"]*andes-money-amount__cents[^"]*"[^>]*>(\d+)<\/span>)?/);
  if (andesMatch) {
    const fraction = andesMatch[1].replace(/\./g, '');
    const cents = andesMatch[2] || '00';
    const price = parseFloat(`${fraction}.${cents}`);
    if (!isNaN(price) && price > 0) {
      return { price, name: ogTitle, imageUrl: ogImage };
    }
  }

  return null;
}

async function scrape(url) {
  const mlId = extractMlId(url);

  if (mlId) {
    try {
      const result = await scrapeViaApi(mlId);
      if (result) return result;
    } catch (err) {
      console.warn('[MercadoLivre] API falhou:', err.response?.status || err.message, '— tentando HTML');
    }
  }

  try {
    const result = await scrapeViaHtml(url);
    if (result) return result;
  } catch (err) {
    console.warn('[MercadoLivre] HTML falhou:', err.response?.status || err.message);
  }

  console.warn('[MercadoLivre] Preço não encontrado em:', url);
  return null;
}

module.exports = { scrape };
