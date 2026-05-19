// Cupons KaBuM — lê a planilha pública de cupons, abre cada promoção, junta os
// produtos, filtra lixo (peças/acessórios), ordena por desconto e posta os
// melhores no canal. Dispara automático 1x/dia + comando admin /postarcupons.
const axios = require('axios');
const { sendCouponDeal } = require('./bot/telegram');

const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/1Hi1d81MW60rycvtmE8jFaFdekrlgndbvXrWglu33RtA/gviz/tq?tqx=out:csv';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
};

const CUPONS_COUNT      = parseInt(process.env.KABUM_CUPONS_COUNT || '3', 10);   // produtos por rodada
const CUPONS_MIN_STOCK  = parseInt(process.env.KABUM_CUPONS_MIN_STOCK || '5', 10); // estoque mínimo
const CUPONS_MIN_DISC   = parseFloat(process.env.KABUM_CUPONS_MIN_DISCOUNT || '5'); // % desconto mínimo
const CUPONS_MAX_PROMOS = parseInt(process.env.KABUM_CUPONS_MAX_PROMOS || '15', 10); // máx de cupons a varrer
// Horários BRT em que a rotina dispara (vírgula-separados). Default: 13h e 19h.
const CUPONS_HOURS_BRT  = (process.env.KABUM_CUPONS_HOURS_BRT || '13,19')
  .split(',').map((h) => parseInt(h.trim(), 10)).filter((h) => !isNaN(h) && h >= 0 && h <= 23);

// Peças de reposição + acessórios — produto de verdade não casa com isso.
const JUNK_RE = /\b(cabo|cabos|adaptador|suporte|p[ée]licula|pel[íi]cula|m[óo]dulo|conector|flex|carca[çc]a|dock|hub|organizador|extensor|r[ée]gua de|filtro de linha|espelho|pulseira|carregador|bateria para|fonte para notebook|mouse ?pad|base para notebook|tela para|display para|touch para|protetor de tela|limpa ?tela|kit limpeza|cooler para notebook)\b/i;

function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

// Lê a planilha → cupons válidos (dentro da data) com link de promoção
async function fetchCoupons() {
  const { data } = await axios.get(SHEET_CSV, { headers: HEADERS, timeout: 15000 });
  const rows = parseCsv(data);
  const now = Date.now();
  const cupons = [];
  for (const r of rows.slice(1)) { // pula header
    const [, dtIni, dtFim, code, desconto, , link] = r;
    if (!code || !link) continue;
    const ini = Date.parse(dtIni), fim = Date.parse(dtFim);
    if (!isNaN(ini) && now < ini) continue;       // ainda não começou
    if (!isNaN(fim) && now > fim) continue;       // já encerrou
    const tag = link.match(/\/promocao\/([^/?#]+)/i)?.[1];
    if (!tag) continue;                           // só cupons com listagem
    cupons.push({ code: code.trim(), desconto: (desconto || '').trim(), tag });
  }
  return cupons;
}

// Abre a página da promoção e extrai os produtos (1ª página, ~60 itens)
async function fetchPromoProducts(tag) {
  const url = `https://www.kabum.com.br/promocao/${tag}`;
  const { data: html } = await axios.get(url, { headers: HEADERS, timeout: 20000 });
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  try {
    const d = JSON.parse(m[1]);
    return d.props?.pageProps?.data?.catalogServer?.data || [];
  } catch {
    return [];
  }
}

function isJunk(p) {
  const name = p.name || '';
  if (JUNK_RE.test(name)) return true;
  if (p.flags?.isOpenbox) return true;
  return false;
}

async function runKabumCupons() {
  let cupons;
  try {
    cupons = await fetchCoupons();
  } catch (err) {
    console.error('[Cupons] Erro ao ler planilha:', err.message);
    return { posted: 0, error: err.message };
  }
  if (!cupons.length) {
    console.log('[Cupons] Nenhum cupom de listagem ativo.');
    return { posted: 0 };
  }
  console.log(`[Cupons] ${cupons.length} cupom(ns) ativo(s) — varrendo...`);

  // Junta produtos de todos os cupons (cada produto guarda o cupom de origem)
  const candidatos = [];
  const vistos = new Set();
  for (const cupom of cupons.slice(0, CUPONS_MAX_PROMOS)) {
    let produtos;
    try {
      produtos = await fetchPromoProducts(cupom.tag);
    } catch (err) {
      console.warn(`[Cupons] Falha em ${cupom.tag}:`, err.message);
      continue;
    }
    for (const p of produtos) {
      if (vistos.has(p.code)) continue;            // dedup global
      if (!p.available) continue;
      if ((p.quantity || 0) < CUPONS_MIN_STOCK) continue;
      if ((p.discountPercentage || 0) < CUPONS_MIN_DISC) continue;
      if (isJunk(p)) continue;
      const price = p.priceWithDiscount || p.price;
      if (!price || price <= 0) continue;
      vistos.add(p.code);
      candidatos.push({
        code: p.code,
        name: p.name,
        url: `https://www.kabum.com.br/produto/${p.code}/${p.friendlyName}`,
        price,
        oldPrice: p.oldPrice || p.price,
        discountPct: p.discountPercentage || 0,
        stock: p.quantity || 0,
        image: p.thumbnail || p.photos?.g?.[0] || null,
        coupon: cupom.code,
        couponDiscount: cupom.desconto,
      });
    }
    await new Promise((r) => setTimeout(r, 800));
  }

  // Ordena por maior desconto e pega o top N
  candidatos.sort((a, b) => b.discountPct - a.discountPct);
  const top = candidatos.slice(0, CUPONS_COUNT);
  console.log(`[Cupons] ${candidatos.length} produtos válidos — postando top ${top.length}`);

  let posted = 0;
  for (const item of top) {
    try {
      await sendCouponDeal(item);
      posted++;
    } catch (err) {
      console.error('[Cupons] Erro ao postar:', err.message);
    }
  }
  return { posted, candidatos: candidatos.length, cupons: cupons.length };
}

// Agenda a próxima rodada no próximo horário BRT da lista (re-agenda a si mesmo).
function scheduleKabumCupons() {
  if (!CUPONS_HOURS_BRT.length) {
    console.warn('[Cupons] KABUM_CUPONS_HOURS_BRT vazio — rotina desativada');
    return;
  }
  const now = Date.now();
  // BRT = UTC-3. Pra um horário H em BRT hoje, o instante UTC é H+3.
  const candidates = [];
  for (const h of CUPONS_HOURS_BRT) {
    const hUtc = (h + 3) % 24;
    const d = new Date();
    d.setUTCHours(hUtc, 0, 0, 0);
    let t = d.getTime();
    if (t <= now) t += 24 * 3600 * 1000;
    candidates.push(t);
  }
  const next = Math.min(...candidates);
  const delay = next - now;
  const hStr = CUPONS_HOURS_BRT.map((h) => `${h}h`).join(', ');
  console.log(`[Cupons] Horários BRT: ${hStr} — próxima rodada em ${(delay / 3600000).toFixed(1)}h`);
  setTimeout(async () => {
    try { await runKabumCupons(); } catch (err) { console.error('[Cupons]', err.message); }
    scheduleKabumCupons();
  }, delay);
}

module.exports = { runKabumCupons, scheduleKabumCupons };
