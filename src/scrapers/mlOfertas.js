// Scraper da PÁGINA DE OFERTAS do Mercado Livre (mercadolivre.com.br/ofertas).
// A API pública /sites/MLB/search foi bloqueada pelo ML em 2025 (403) e o
// programa de Afiliados não expõe API de catálogo. Então pra DESCOBRIR ofertas
// novas só sobra ler o HTML público da vitrine — que responde 200 com
// User-Agent de browser e traz os dados embutidos (não precisa de JS/headless).
//
// A vitrine usa "poly-card". Cada card tem:
//   - <a class="poly-component__title" href=".../p/MLB...?...deal%3AMLBxxxx-N">  → link + nome (+ deal id)
//   - <s class="andes-money-amount--previous" aria-label="Antes: X reais...">     → preço original
//   - <div class="poly-price__current"> ... aria-label="Agora: Y reais..."        → preço atual
//   - <span class="poly-component__highlight">OFERTA DO DIA</span>                → selo
//
// Os preços vêm em aria-label legível ("44 reais com 90 centavos") — mais
// robusto que os spans fragmentados.
//
// CUPOM (best-effort): o cupom NÃO fica dentro do card; vive num JSON de
// metadados de "deals" no topo do HTML, keyado pelo deal id (ex: MLB779362-1).
// O href de cada card carrega esse mesmo deal id (deal%3AMLB779362-1), então dá
// pra cruzar os dois. ~19% dos cards têm cupom detectável. Quando não casa,
// segue sem cupom. Essa parte é a mais frágil (some se o ML mudar o JSON).
//
// Frágil por natureza (ML pode mudar HTML / dar anti-bot). Nunca quebra:
// devolve { items, error }, items pode vir vazio.
//
// Retorna items: [{ url, name, price, originalPrice, discountPct, couponValue, imageUrl }]
const axios = require('axios');

const OFERTAS_URL = 'https://www.mercadolivre.com.br/ofertas';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Cache-Control': 'no-cache',
};

// "129 reais com 90 centavos" → 129.90 ; "44 reais" → 44
function parseAriaPrice(label) {
  if (!label) return NaN;
  const m = label.match(/([\d.]+)\s*reais(?:\s*com\s*(\d+)\s*centavos)?/i);
  if (!m) return NaN;
  const reais = m[1].replace(/\./g, '');
  const cents = m[2] || '00';
  return parseFloat(`${reais}.${cents.padStart(2, '0')}`);
}

// Extrai o deal id do href: ...pdp_filters=deal%3AMLB779362-1... ou deal:MLB779362-1
function extractDealId(href) {
  const m = String(href).match(/deal(?:%3A|:)(MLB\d+-\d+)/i);
  return m ? m[1] : null;
}

// Limpa URL: mantém só o link canônico do produto (tira query/tracking/hash)
function cleanProductUrl(href) {
  try {
    const u = new URL(href, 'https://www.mercadolivre.com.br');
    if (!u.hostname.includes('mercadolivre.com')) return null;
    if (!/\/(p\/MLB|up\/MLBU|MLB-)\d+/i.test(u.pathname)) return null;
    return `${u.origin}${u.pathname}`;
  } catch {
    return null;
  }
}

// Constrói mapa dealId -> valor do cupom (R$) a partir do JSON de metadados.
// Cada unidade de promoção tem o deal id seguido, em algumas centenas de chars,
// de um objeto {"type":"coupon"...,"value":N}. Capturamos o id mais PRÓXIMO
// que precede cada cupom (lazy) pra não casar um cupom com ids distantes.
function buildCouponMap(html) {
  const map = {};
  // Limita ao começo do doc (onde fica o JSON de deals) pra não varrer 600KB
  const head = html.slice(0, 120000);
  const re = /(MLB\d+-\d+)(?:(?!MLB\d+-\d+)[\s\S]){0,500}?"type":"coupon"[\s\S]{0,250}?"value":(\d+)/g;
  let m;
  while ((m = re.exec(head)) !== null) {
    const dealId = m[1];
    const value = parseInt(m[2], 10);
    if (value > 0 && !map[dealId]) map[dealId] = value;
  }
  return map;
}

// Quebra o HTML em blocos de poly-card.
function splitCards(html) {
  const cards = [];
  const re = /andes-card[^"]*poly-card[\s\S]*?(?=andes-card[^"]*poly-card|<\/body)/gi;
  let m;
  while ((m = re.exec(html)) !== null) cards.push(m[0]);
  return cards;
}

function parseCard(block, couponMap) {
  // Link + nome: <a ... class="poly-component__title" href="...">Nome</a>
  const linkMatch = block.match(/<a[^>]+class="[^"]*poly-component__title[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
                 || block.match(/href="([^"]+)"[^>]*class="[^"]*poly-component__title[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
  const rawHref = linkMatch?.[1] || '';
  const url = cleanProductUrl(rawHref);
  if (!url) return null;

  let name = (linkMatch[2] || '').replace(/<[^>]+>/g, '').trim() || null;
  if (!name) name = block.match(/class="poly-component__picture"[^>]*alt="([^"]{5,})"/i)?.[1] || null;

  // Preço atual: aria-label="Agora: ..." (dentro de poly-price__current)
  let price = parseAriaPrice(block.match(/aria-label="Agora:\s*([^"]+)"/i)?.[1]);
  // Preço original: aria-label="Antes: ..." (andes-money-amount--previous)
  let originalPrice = parseAriaPrice(block.match(/aria-label="Antes:\s*([^"]+)"/i)?.[1]);

  // Fallback se não houver aria "Agora": pega o 1º andes-money-amount
  if (isNaN(price)) {
    const generic = block.match(/aria-label="([^"]*reais[^"]*)"/i)?.[1];
    price = parseAriaPrice(generic);
  }
  if (isNaN(price) || price <= 0) return null;
  if (isNaN(originalPrice) || originalPrice <= price) originalPrice = null;

  // %OFF: selo "X% OFF" ou calculado
  let discountPct = null;
  const offMatch = block.match(/(\d{1,2})%\s*OFF/i);
  if (offMatch) discountPct = parseInt(offMatch[1], 10);
  else if (originalPrice) discountPct = Math.round((1 - price / originalPrice) * 100);

  // Cupom (best-effort): cruza deal id do href com o mapa de cupons
  const dealId = extractDealId(rawHref);
  const couponValue = (dealId && couponMap[dealId]) || null;

  const imageUrl = block.match(/class="poly-component__picture"[^>]+src="(https:\/\/http2\.mlstatic\.com[^"]+)"/i)?.[1]
                || block.match(/<img[^>]+src="(https:\/\/http2\.mlstatic\.com[^"]+)"/i)?.[1] || null;

  return { url, name, price, originalPrice, discountPct, couponValue, imageUrl };
}

function dedup(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    if (seen.has(it.url)) continue;
    seen.add(it.url);
    out.push(it);
  }
  return out;
}

// Busca ofertas da vitrine.
//   minDiscount — filtra por %OFF mínimo (cards sem desconto conhecido passam)
//   limit       — corta o resultado final
async function scrapeOfertas({ minDiscount = 0, limit = 30 } = {}) {
  let html;
  try {
    const r = await axios.get(OFERTAS_URL, { timeout: 20000, headers: HEADERS, maxRedirects: 5 });
    html = r.data;
  } catch (err) {
    const status = err.response?.status || err.message;
    console.warn('[MLOfertas] Falha ao buscar página de ofertas:', status);
    return { items: [], error: `HTTP ${status}` };
  }

  if (typeof html !== 'string' || html.length < 1000) {
    return { items: [], error: 'HTML vazio/curto (provável bloqueio)' };
  }

  const couponMap = buildCouponMap(html);
  const cards = splitCards(html);
  let items = dedup(cards.map((c) => parseCard(c, couponMap)).filter(Boolean));

  if (minDiscount > 0) {
    items = items.filter((it) => it.discountPct == null || it.discountPct >= minDiscount);
  }

  return {
    items: items.slice(0, limit),
    error: null,
    cardsFound: cards.length,
    couponsFound: Object.keys(couponMap).length,
  };
}

module.exports = { scrapeOfertas };
