// Rodízio de CUPONS MANUAIS (definidos pelo dono em src/manualCoupons.js).
// A cada N horas posta 1 produto de um cupom VÁLIDO no grupo, com o código do
// cupom + validade. Rotação circular pra cobrir todos os produtos antes de
// repetir.
//
// Comportamento (definido com o dono):
//   - Produtos são cadastrados em `products` na 1ª vez que aparecem (com preço
//     lido pelo scraper). A partir daí são monitorados pelo scan normal — e
//     CONTINUAM monitorados mesmo depois do cupom vencer.
//   - Só posta produtos de cupons válidos (hoje <= expiresAt). Cupom vencido
//     some do rodízio automaticamente (getActiveCoupons já filtra).
//   - Anti-repost: não reposta o mesmo produto+preço dentro da janela (alerts_sent).
//   - 1 post por rodada (mesma cadência conservadora das ofertas ML).
//
// Frágil só na 1ª resolução de preço (scraper). Nunca derruba o processo.
const { getActiveCoupons } = require('./manualCoupons');
const { getPrice } = require('./scrapers');
const { inferGender } = require('./utils/inferGender');
const {
  addProduct, savePrice, findActiveProductByUrl, getLastPrice,
  wasAlertRecentlySent, registerAlert,
} = require('./db/queries');
const { sendMlDeal } = require('./bot/telegram');

const RUN_EVERY_HOURS   = parseFloat(process.env.COUPON_DEALS_EVERY_HOURS || '2'); // a cada 2h
const MAX_POSTS_PER_RUN = parseInt(process.env.COUPON_DEALS_MAX_POSTS || '1', 10); // 1 por rodada

// Cursor de rotação em memória (avança a cada produto postado). Reinicia em
// deploy — tudo bem, no máximo repete um produto que já circulou.
let rotationCursor = 0;

// Formata 'YYYY-MM-DD' → 'DD/MM' pra exibir no card
function fmtExpiry(expiresAt) {
  const [, m, d] = String(expiresAt || '').split('-');
  return m && d ? `${d}/${m}` : null;
}

// Garante que o produto está cadastrado e tem preço.
// Lê o scraper SEMPRE (preço atualizado + imagem pro card — o card de cupom
// precisa da foto). Retorna { id, price, imageUrl }.
async function ensureProduct(p, category) {
  const prod = await findActiveProductByUrl(p.url);
  let id = prod?.id || null;
  let created = false;

  // Scraper: preço fresco + imagem. Best-effort (null se falhar).
  const scraped = await getPrice(p.url).catch(() => null);
  const imageUrl = scraped?.imageUrl || prod?.image_url || null;

  if (!id) {
    const { id: newId } = await addProduct(p.name, p.url, 'mercadolivre', {
      category,
      addedByUsername: 'cupom-manual',
    });
    id = newId;
    created = true;
  }

  // Preço: o do scraper agora; senão o último do banco
  let price = scraped?.price > 0 ? scraped.price : null;
  if (price) {
    await savePrice(id, price).catch(() => {});
  } else {
    price = await getLastPrice(id);
  }

  return { id, price: price > 0 ? price : null, imageUrl, created };
}

async function runCouponDeals({ force = false } = {}) {
  const coupons = getActiveCoupons();
  if (!coupons.length) {
    console.log('[CouponDeals] Nenhum cupom manual válido — nada a postar');
    return { registered: 0, posted: 0, candidates: 0 };
  }

  // Achata em lista [{ coupon, product, category }] e cadastra/garante preço.
  const items = [];
  let registered = 0;
  for (const c of coupons) {
    for (const p of c.products) {
      try {
        const info = await ensureProduct(p, c.category);
        if (info?.created) registered++;
        if (info?.id && info.price > 0) {
          items.push({ coupon: c, product: p, category: c.category, productId: info.id, price: info.price, imageUrl: info.imageUrl });
        } else {
          console.warn(`[CouponDeals] sem preço pra ${p.name.slice(0, 40)} — não posta (segue monitorando)`);
        }
      } catch (err) {
        console.warn('[CouponDeals] erro ao preparar produto:', err.message);
      }
    }
  }

  if (!items.length) {
    console.log('[CouponDeals] nenhum produto com preço disponível nesta rodada');
    return { registered, posted: 0, candidates: 0 };
  }

  // Rotação circular: começa no cursor e tenta os próximos até postar MAX.
  let posted = 0;
  const n = items.length;
  for (let step = 0; step < n && posted < MAX_POSTS_PER_RUN; step++) {
    const it = items[(rotationCursor + step) % n];
    try {
      if (!force && await wasAlertRecentlySent(it.productId, it.price)) continue;

      const gender = inferGender(it.product.name, 'mercadolivre', it.category);
      const ok = await sendMlDeal({
        productId: it.productId,
        name: it.product.name,
        url: it.product.url,
        category: it.category,
        price: it.price,
        coupon: {
          code: it.coupon.code,
          label: it.coupon.discountLabel || null,
          expiresLabel: fmtExpiry(it.coupon.expiresAt),
        },
        imageUrl: it.imageUrl,
        isMasc: !gender.ambiguous && gender.masc,
        isFem: !gender.ambiguous && gender.fem,
      });
      if (ok) {
        posted++;
        await registerAlert(it.productId, it.price, null).catch(() => {});
        console.log(`[CouponDeals] POSTADO: ${it.product.name.slice(0, 45)} (cupom ${it.coupon.code})`);
      }
    } catch (err) {
      console.warn('[CouponDeals] post falhou:', err.message);
    }
  }
  rotationCursor = (rotationCursor + 1) % n; // avança 1 por rodada

  if (!posted) console.log('[CouponDeals] nada postado (todos em cooldown ou já postados)');
  console.log(`[CouponDeals] rodada: ${registered} cadastrado(s), ${posted} postado(s), ${items.length} candidato(s)`);
  return { registered, posted, candidates: items.length };
}

function scheduleCouponDeals() {
  const delay = RUN_EVERY_HOURS * 3600 * 1000;
  console.log(`[CouponDeals] agendado a cada ${RUN_EVERY_HOURS}h`);
  setTimeout(async function tick() {
    try { await runCouponDeals(); }
    catch (err) { console.error('[CouponDeals]', err.message); }
    setTimeout(tick, delay);
  }, delay);
}

module.exports = { runCouponDeals, scheduleCouponDeals };
