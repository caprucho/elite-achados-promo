// Encurtador de URLs do Mercado Livre via API.
// Gera links meli.la/xyz com ref automático (OAuth).
// Cache em memória (TTL 24h) pra evitar rate limit.
const axios = require('axios');

const ML_APP_ID = process.env.ML_APP_ID;
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET;
const ML_SITE_ID = 'MLB'; // Brasil

let mlAccessToken = null;
let mlTokenExpiresAt = 0;
const shortUrlCache = new Map(); // { fullUrl → { shortUrl, expiresAt } }

async function getMLAccessToken() {
  const now = Date.now();
  if (mlAccessToken && mlTokenExpiresAt > now) {
    return mlAccessToken;
  }
  if (!ML_APP_ID || !ML_CLIENT_SECRET) {
    throw new Error('ML_APP_ID e ML_CLIENT_SECRET obrigatórios');
  }
  try {
    const r = await axios.post('https://api.mercadolibre.com/oauth/token', {
      grant_type: 'client_credentials',
      client_id: ML_APP_ID,
      client_secret: ML_CLIENT_SECRET,
    });
    mlAccessToken = r.data.access_token;
    mlTokenExpiresAt = now + (r.data.expires_in - 60) * 1000; // 60s buffer
    return mlAccessToken;
  } catch (err) {
    console.error('[MLShortUrl] Erro OAuth:', err.message);
    throw err;
  }
}

async function getMLShortUrl(fullUrl) {
  if (!fullUrl || !fullUrl.includes('mercadolivre.com')) {
    return fullUrl; // não é URL de ML
  }
  const now = Date.now();
  const cached = shortUrlCache.get(fullUrl);
  if (cached && cached.expiresAt > now) {
    return cached.shortUrl; // cache válido
  }
  try {
    const token = await getMLAccessToken();
    const r = await axios.post(
      `https://api.mercadolibre.com/sites/${ML_SITE_ID}/short_url`,
      { url: fullUrl },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const shortUrl = r.data.short_url;
    // Cache por 24h
    shortUrlCache.set(fullUrl, {
      shortUrl,
      expiresAt: now + 24 * 3600 * 1000,
    });
    console.log(`[MLShortUrl] ${fullUrl.slice(0, 60)}... → ${shortUrl}`);
    return shortUrl;
  } catch (err) {
    console.warn(`[MLShortUrl] Falha ao encurtar, usando fallback com utm_source:`, err.message);
    // Fallback: adiciona utm_source ao invés de chamar API
    try {
      const u = new URL(fullUrl);
      u.searchParams.set('utm_source', process.env.ML_AFFILIATE_ID || 'EliteOfertas99');
      return u.toString();
    } catch {
      return fullUrl; // URL inválida, retorna como está
    }
  }
}

module.exports = { getMLShortUrl };
