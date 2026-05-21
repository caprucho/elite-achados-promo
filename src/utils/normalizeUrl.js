// Normaliza URLs antes de cadastrar produtos. Resolve encurtadores
// (a.co, amzn.to, amzn.eu) e limpa query strings de tracking pra evitar
// duplicatas no banco (mesmo produto com refs diferentes contava como 2).

const axios = require('axios');

const SHORT_URL_HOSTS = ['a.co', 'amzn.to', 'amzn.eu'];

function isShortUrl(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return SHORT_URL_HOSTS.includes(h);
  } catch { return false; }
}

// Extrai ASIN da Amazon e devolve URL canônica (sem tracking).
// Funciona com /dp/ASIN e /gp/product/ASIN. Mantém domínio original
// (.com.br, .com etc).
function cleanAmazonUrl(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    if (m) {
      return `https://${u.hostname}/dp/${m[1].toUpperCase()}`;
    }
    // Sem ASIN reconhecível: devolve sem query string mas com path intacto
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}

async function normalizeUrl(url) {
  if (!isShortUrl(url)) return { url, wasShort: false };
  try {
    const r = await axios.get(url, {
      maxRedirects: 10,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      timeout: 15000,
    });
    const finalUrl = r.request?.res?.responseUrl || r.config.url || url;
    const u = new URL(finalUrl);
    if (u.hostname.includes('amazon.com') || u.hostname.endsWith('amazon')) {
      return { url: cleanAmazonUrl(finalUrl), wasShort: true };
    }
    // Encurtador desconhecido apontando pra outro lugar: devolve URL sem query
    u.search = '';
    u.hash = '';
    return { url: u.toString(), wasShort: true };
  } catch (err) {
    console.warn('[normalizeUrl] erro ao expandir:', err.message);
    return { url, wasShort: false };
  }
}

module.exports = { normalizeUrl, isShortUrl, cleanAmazonUrl };
