// Descoberta automática de ofertas do Mercado Livre.
// A cada N horas: raspa a vitrine /ofertas, AUTO-CADASTRA as ofertas novas
// (categoria inferida pelo nome) e POSTA no grupo até MAX_POSTS_PER_RUN — as
// melhores ofertas ≥ MIN_POST_DISCOUNT, SÓ nas categorias que já existem no
// grupo. Se não houver oferta boa nas categorias-foco, NÃO posta nada.
//
// Decisões (definidas com o dono do canal):
//   - Cadastra TODAS as ofertas válidas (lista cresce sozinha, categorizada)
//   - Posta 2 por rodada a cada 2h, só ≥40% OFF e só categorias-foco
//   - Sem oferta de qualidade na rodada → não posta (não enche tabela)
//   - Cupom: best-effort (mostra quando o scraper detectou)
//   - Anti-lixo (preço mín/máx, nome válido, desconto plausível)
//   - Anti-repost: dedup por alerts_sent (janela de 7 dias)
//
// Frágil por depender de scraping → nunca derruba o processo (try/catch amplo).
const { scrapeOfertas } = require('./scrapers/mlOfertas');
const { inferCategory } = require('./utils/inferCategory');
const { inferGender } = require('./utils/inferGender');
const {
  addProduct, savePrice, findActiveProductByUrl,
  wasAlertRecentlySent, registerAlert,
} = require('./db/queries');
const { sendMlDeal } = require('./bot/telegram');

const RUN_EVERY_HOURS    = parseFloat(process.env.ML_DEALS_EVERY_HOURS    || '2');   // roda a cada 2h
const MIN_POST_DISCOUNT  = parseInt(process.env.ML_DEALS_MIN_POST_OFF     || '40', 10); // só posta ≥40% OFF
const MAX_POSTS_PER_RUN  = parseInt(process.env.ML_DEALS_MAX_POSTS        || '2', 10);  // 2 por rodada
const MIN_PRICE          = parseFloat(process.env.ML_DEALS_MIN_PRICE      || '30');  // < R$30 = provável tranqueira
const MAX_PRICE          = parseFloat(process.env.ML_DEALS_MAX_PRICE      || '15000'); // teto de sanidade
const SCRAPE_LIMIT       = parseInt(process.env.ML_DEALS_SCRAPE_LIMIT     || '60', 10);

// Categorias que JÁ existem no grupo (têm tópico). Só postamos nessas.
// Casa entra (é a 2ª maior do banco). 'geral' nunca é postada.
const FOCUS_CATEGORIES = new Set((process.env.ML_DEALS_FOCUS ||
  'eletronicos,casa,hardware,beleza,calcados,vestuario,smartphones,acessorios,audio,perfumaria'
).split(',').map((s) => s.trim()).filter(Boolean));

function isJunk(it) {
  if (!it.name || it.name.length < 8) return true;
  if (!(it.price >= MIN_PRICE && it.price <= MAX_PRICE)) return true;
  // desconto implausível (parser errado) — >95% quase sempre é lixo de parsing
  if (it.discountPct != null && it.discountPct > 95) return true;
  return false;
}

async function runMlDeals({ force = false } = {}) {
  const { items, error, cardsFound, couponsFound } = await scrapeOfertas({ minDiscount: 0, limit: SCRAPE_LIMIT });
  if (error) {
    console.warn('[MLDeals] scrape falhou:', error);
    return { registered: 0, posted: 0, error };
  }
  console.log(`[MLDeals] ${cardsFound} cards, ${items.length} ofertas, ${couponsFound} cupons no mapa`);

  // 1) AUTO-CADASTRO de todas as válidas (categoria inferida)
  let registered = 0;
  const enriched = [];
  for (const it of items) {
    if (isJunk(it)) continue;
    const category = inferCategory(it.name);
    enriched.push({ ...it, category });
    try {
      const existing = await findActiveProductByUrl(it.url);
      if (existing) continue; // já cadastrado → não duplica
      const { id, status } = await addProduct(it.name, it.url, 'mercadolivre', {
        category: category === 'geral' ? null : category,
        addedByUsername: 'auto-ofertas-ml',
      });
      if (status === 'created' || status === 'reactivated') {
        registered++;
        await savePrice(id, it.price).catch(() => {});
      }
    } catch (err) {
      console.warn('[MLDeals] cadastro falhou:', err.message);
    }
  }

  // 2) POST — candidatas ≥ MIN_POST_DISCOUNT, SÓ categorias-foco, maiores %OFF.
  // Se não houver candidata, não posta (não enche tabela).
  const candidates = enriched
    .filter((it) => it.discountPct != null && it.discountPct >= MIN_POST_DISCOUNT)
    .filter((it) => FOCUS_CATEGORIES.has(it.category))
    .sort((a, b) => b.discountPct - a.discountPct);

  let posted = 0;
  for (const it of candidates) {
    if (posted >= MAX_POSTS_PER_RUN) break;
    try {
      const prod = await findActiveProductByUrl(it.url);
      if (!prod) continue;
      // Anti-repost: já postou esse produto nesse preço recentemente? pula
      if (!force && await wasAlertRecentlySent(prod.id, it.price)) continue;

      const gender = inferGender(it.name, 'mercadolivre', it.category);
      const ok = await sendMlDeal({
        productId: prod.id,
        name: it.name,
        url: it.url,
        category: it.category,
        price: it.price,
        originalPrice: it.originalPrice,
        discountPct: it.discountPct,
        couponValue: it.couponValue,
        imageUrl: it.imageUrl,
        isMasc: !gender.ambiguous && gender.masc,
        isFem: !gender.ambiguous && gender.fem,
      });
      if (ok) {
        posted++;
        await registerAlert(prod.id, it.price, it.discountPct).catch(() => {});
        console.log(`[MLDeals] POSTADO: ${it.name.slice(0, 45)} (${it.discountPct}% OFF, ${it.category}${it.couponValue ? ', cupom R$' + it.couponValue : ''})`);
      }
    } catch (err) {
      console.warn('[MLDeals] post falhou:', err.message);
    }
  }

  if (!posted) console.log('[MLDeals] nenhuma oferta de qualidade nas categorias-foco — não postou');
  console.log(`[MLDeals] rodada: ${registered} cadastrado(s), ${posted} postado(s)`);
  return { registered, posted, error: null, candidates: candidates.length };
}

function scheduleMlDeals() {
  const delay = RUN_EVERY_HOURS * 3600 * 1000;
  console.log(`[MLDeals] agendado a cada ${RUN_EVERY_HOURS}h (próxima em ${RUN_EVERY_HOURS}h)`);
  setTimeout(async function tick() {
    try { await runMlDeals(); }
    catch (err) { console.error('[MLDeals]', err.message); }
    setTimeout(tick, delay); // re-agenda
  }, delay);
}

module.exports = { runMlDeals, scheduleMlDeals };
