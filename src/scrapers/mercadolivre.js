const axios = require('axios');

let _token = null;
let _tokenExpiry = 0;

async function getToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;

  const { ML_APP_ID, ML_CLIENT_SECRET } = process.env;
  if (!ML_APP_ID || !ML_CLIENT_SECRET) return null;

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
}

function extractMlId(url) {
  const catalog = url.match(/\/p\/(MLB\d+)/i);
  if (catalog) return { type: 'product', id: catalog[1] };

  const produto = url.match(/MLB-(\d+)/i);
  if (produto) return { type: 'item', id: `MLB${produto[1]}` };

  const item = url.match(/(MLB\d+)/i);
  if (item) return { type: 'item', id: item[1] };

  return null;
}

async function scrapeViaApi(mlId) {
  const token = await getToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  if (mlId.type === 'product') {
    // Busca metadados do catálogo (nome e imagem)
    const { data: prod } = await axios.get(
      `https://api.mercadolibre.com/products/${mlId.id}`,
      { timeout: 10000, headers }
    );
    const name     = prod.name;
    const imageUrl = prod.pictures?.[0]?.url || null;

    // buy_box_winner é o preço direto quando disponível
    if (prod.buy_box_winner?.price) {
      return { price: parseFloat(prod.buy_box_winner.price), name, imageUrl };
    }

    // Fallback: busca itens associados ao catálogo via search API
    const { data: search } = await axios.get(
      `https://api.mercadolibre.com/sites/MLB/search?catalog_product_id=${mlId.id}&limit=1`,
      { timeout: 10000, headers }
    );

    const firstItem = search.results?.[0];
    if (!firstItem?.price) return null;

    return {
      price:    parseFloat(firstItem.price),
      name:     name || firstItem.title,
      imageUrl: imageUrl || firstItem.thumbnail || null,
    };
  }

  // Item direto (não catálogo)
  const { data: item } = await axios.get(
    `https://api.mercadolibre.com/items/${mlId.id}`,
    { timeout: 10000, headers }
  );

  const price    = item.price;
  const name     = item.title;
  const imageUrl = item.pictures?.[0]?.url || item.thumbnail || null;

  if (!price || isNaN(parseFloat(price))) return null;
  return { price: parseFloat(price), name, imageUrl };
}

async function scrape(url) {
  const mlId = extractMlId(url);
  if (mlId) {
    try {
      const result = await scrapeViaApi(mlId);
      if (result) return result;
    } catch (err) {
      console.warn('[MercadoLivre] API falhou:', err.message);
    }
  }

  console.warn('[MercadoLivre] Preço não encontrado em:', url);
  return null;
}

module.exports = { scrape };
