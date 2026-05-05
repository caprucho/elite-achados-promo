const axios = require('axios');

// Token OAuth2 em memória (válido por 6h)
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
  _tokenExpiry = Date.now() + (data.expires_in - 300) * 1000; // renova 5 min antes
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

  const endpoint = mlId.type === 'product'
    ? `https://api.mercadolibre.com/products/${mlId.id}`
    : `https://api.mercadolibre.com/items/${mlId.id}`;

  const { data } = await axios.get(endpoint, { timeout: 10000, headers });

  const price = mlId.type === 'product'
    ? (data.buy_box_winner?.price ?? data.lowest_price)
    : data.price;
  const name     = mlId.type === 'product' ? data.name : data.title;
  const imageUrl = data.pictures?.[0]?.url || data.thumbnail || null;

  if (!price || isNaN(parseFloat(price))) {
    console.warn(`[MercadoLivre] DEBUG ${mlId.id}: buy_box=${data.buy_box_winner?.price} lowest=${data.lowest_price} price=${data.price} keys=${Object.keys(data).join(',')}`);
    return null;
  }
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
