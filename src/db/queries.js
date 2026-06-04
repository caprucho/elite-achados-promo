const { supabase } = require('./supabase');
const { inferGender } = require('../utils/inferGender');

// Dedup de alertas: não re-alertar o mesmo produto num preço ~igual dentro
// da janela. Janela de 3 dias + tolerância (2%) evita repetição chata mas
// deixa bons produtos reaparecerem mais (flexibilização pedida 2026-05-29;
// era 168h/7d).
const ALERT_DEDUP_HOURS         = parseInt(process.env.ALERT_DEDUP_HOURS || '72', 10);
const ALERT_DEDUP_TOLERANCE_PCT = parseFloat(process.env.ALERT_DEDUP_TOLERANCE_PCT || '2');

// Cooldown adaptativo: produto que disparou MUITO alerta em 7d entra em mute.
// Mata o flood de produto volátil (ex: Lancôme oscilando R$ 710 / 812 / 1015).
const COOLDOWN_THRESHOLD  = parseInt(process.env.COOLDOWN_THRESHOLD  || '3', 10); // ≥ N alertas
const COOLDOWN_WINDOW_DAYS = parseInt(process.env.COOLDOWN_WINDOW_DAYS || '7', 10); // nos últimos N dias
const COOLDOWN_MUTE_DAYS  = parseInt(process.env.COOLDOWN_MUTE_DAYS  || '3', 10); // → silencia por N dias

async function isInAdaptiveCooldown(productId) {
  const since = new Date(Date.now() - COOLDOWN_WINDOW_DAYS * 86400000).toISOString();
  const { data, error } = await supabase
    .from('alerts_sent')
    .select('sent_at')
    .eq('product_id', productId)
    .gte('sent_at', since)
    .order('sent_at', { ascending: false });
  if (error || !data || data.length < COOLDOWN_THRESHOLD) return false;
  const lastAt = new Date(data[0].sent_at).getTime();
  const ageDays = (Date.now() - lastAt) / 86400000;
  return ageDays < COOLDOWN_MUTE_DAYS;
}

async function getActiveProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('active', true);

  if (error) {
    console.error('[getActiveProducts] Erro ao buscar produtos:', error.message);
    return [];
  }

  return data;
}

async function savePrice(productId, price, isAvailable = true) {
  if (typeof price !== 'number' || isNaN(price) || price <= 0) {
    console.warn(`[savePrice] preço inválido recusado: ${price} para produto ${productId}`);
    return;
  }

  const { error } = await supabase
    .from('price_history')
    .insert({ product_id: productId, price, is_available: isAvailable });

  if (error) {
    console.error(`[savePrice] Erro ao salvar preço para produto ${productId}:`, error.message);
  }
}

// Mínimo "histórico absoluto" — useful pra `/preco` (mostrar o all-time low).
// NÃO USAR pra decisão de alerta — o preço normal de um produto pode mudar
// permanentemente (saiu, voltou mais caro). Use getLowestPriceRecent.
async function getLowestPrice(productId) {
  const { data, error } = await supabase
    .from('price_history')
    .select('price')
    .eq('product_id', productId)
    .eq('is_available', true)
    .order('price', { ascending: true })
    .limit(1)
    .single();

  if (error) {
    // PGRST116 = nenhuma linha encontrada — normal para produto novo
    if (error.code !== 'PGRST116') {
      console.error(`[getLowestPrice] Erro para produto ${productId}:`, error.message);
    }
    return null;
  }

  return data.price;
}

// Mínimo MÓVEL dos últimos N dias — adapta ao "preço normal" atual.
// Se um produto saiu de R$ 1000 (mín antigo) e voltou pra R$ 1500 pra sempre,
// depois de 90 dias o mínimo move pra ~R$ 1500. Aí quedas pra R$ 1300 voltam
// a disparar alerta como -13% legítimo.
const LOWEST_PRICE_WINDOW_DAYS = parseInt(process.env.LOWEST_PRICE_WINDOW_DAYS || '90', 10);

// Pega contexto pra enriquecer alerta: preço normal (mediana 30d, resistente
// a outliers vs média) + mínimo histórico absoluto. Usado pra mostrar
// "preço normal R$ X, mínimo R$ Y, agora R$ Z (-N%)" nos cards.
async function getPriceContext(productId) {
  const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const [lowAllTime, recent30] = await Promise.all([
    supabase.from('price_history')
      .select('price').eq('product_id', productId).eq('is_available', true)
      .order('price', { ascending: true }).limit(1).maybeSingle(),
    supabase.from('price_history')
      .select('price').eq('product_id', productId).eq('is_available', true)
      .gte('created_at', since30),
  ]);
  const allTimeLow = lowAllTime.data?.price ?? null;
  const prices = (recent30.data || []).map((r) => Number(r.price)).filter((p) => p > 0).sort((a, b) => a - b);
  let normalPrice = null;
  if (prices.length > 0) {
    // Mediana — resistente a outliers (promoção que disparou o alerta)
    const mid = Math.floor(prices.length / 2);
    normalPrice = prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  }
  return { allTimeLow, normalPrice };
}

// Score (0-10) + raridade da oferta pra dar contexto inteligente no card.
// Score baseado em: % abaixo da mediana 30d + bônus se é mínimo histórico
//                 + bônus por raridade.
// Raridade: quantas leituras nos últimos 90d ficaram dentro de ±2% do preço
// atual. Quanto menor a contagem, mais rara a oferta.
//
// IMPORTANTE: raridade e score-de-raridade só têm sentido com histórico
// suficiente. Produto recém-cadastrado tem 0-2 leituras → dizer "apareceu 0x,
// extremamente rara, 9.6/10 IMPERDÍVEL" é enganoso. Por isso, com menos de
// RARITY_MIN_READINGS leituras 90d, NÃO calculamos raridade (rarityCount=null,
// sem bônus de raridade no score) — o card omite a linha de raridade.
const RARITY_MIN_READINGS = parseInt(process.env.RARITY_MIN_READINGS || '15', 10);

async function getOfferIntelligence(productId, currentPrice) {
  const since90 = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
  const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const [allTime, recent30, recent90] = await Promise.all([
    supabase.from('price_history')
      .select('price').eq('product_id', productId).eq('is_available', true)
      .order('price', { ascending: true }).limit(1).maybeSingle(),
    supabase.from('price_history')
      .select('price').eq('product_id', productId).eq('is_available', true)
      .gte('created_at', since30),
    supabase.from('price_history')
      .select('price').eq('product_id', productId).eq('is_available', true)
      .gte('created_at', since90),
  ]);

  const allTimeLow = allTime.data?.price ?? null;
  const prices30 = (recent30.data || []).map((r) => Number(r.price)).filter((p) => p > 0).sort((a, b) => a - b);
  const prices90 = (recent90.data || []).map((r) => Number(r.price)).filter((p) => p > 0);

  // Confiança: precisa de histórico suficiente pra falar de raridade/mín.
  const enoughHistory = prices90.length >= RARITY_MIN_READINGS;

  // Mediana 30d
  let median30 = null;
  if (prices30.length) {
    const mid = Math.floor(prices30.length / 2);
    median30 = prices30.length % 2 ? prices30[mid] : (prices30[mid - 1] + prices30[mid]) / 2;
  }

  // Raridade — SÓ com histórico suficiente. Senão rarityCount=null (omitido).
  let rarityCount = null;
  let rarityLabel = null;
  if (enoughHistory) {
    const tol = currentPrice * 0.02;
    rarityCount = prices90.filter((p) => Math.abs(p - currentPrice) <= tol).length;
    if (rarityCount <= 1) rarityLabel = 'extremamente rara';
    else if (rarityCount <= 5) rarityLabel = 'rara';
    else if (rarityCount <= 15) rarityLabel = 'ocasional';
    else rarityLabel = 'frequente';
  }

  // Score 0-10:
  // - até 6 pontos: % abaixo da mediana 30d (0 a 30%+)
  // - até 3 pontos: bônus se está em/abaixo do mínimo histórico (só c/ histórico)
  // - até 2 pontos: bônus por raridade (só c/ histórico)
  let score = 0;
  if (median30 && median30 > currentPrice) {
    const offFromMedian = ((median30 - currentPrice) / median30) * 100;
    score += Math.min(6, offFromMedian / 5); // 30%+ off da mediana = 6 pts
  }
  if (enoughHistory && allTimeLow !== null) {
    if (currentPrice <= allTimeLow * 1.005) score += 3; // está no mín histórico
    else if (currentPrice <= allTimeLow * 1.05) score += 1; // até 5% acima
  }
  if (enoughHistory) {
    if (rarityCount <= 1) score += 2;
    else if (rarityCount <= 5) score += 1;
  }
  score = Math.min(10, Math.max(0, Math.round(score * 10) / 10));

  let scoreLabel;
  if (score >= 8.5) scoreLabel = 'IMPERDÍVEL';
  else if (score >= 7) scoreLabel = 'muito boa';
  else if (score >= 5) scoreLabel = 'boa';
  else if (score >= 3) scoreLabel = 'ok';
  else scoreLabel = 'fraca';

  return { score, scoreLabel, rarityCount, rarityLabel, median30, allTimeLow, enoughHistory };
}

async function getLowestPriceRecent(productId, days = LOWEST_PRICE_WINDOW_DAYS) {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('price_history')
    .select('price')
    .eq('product_id', productId)
    .eq('is_available', true)
    .gte('created_at', since)
    .order('price', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(`[getLowestPriceRecent] Erro para produto ${productId}:`, error.message);
    return null;
  }
  return data?.price ?? null;
}

async function getLastPrice(productId) {
  const { data, error } = await supabase
    .from('price_history')
    .select('price')
    .eq('product_id', productId)
    .eq('is_available', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(`[getLastPrice] Erro para produto ${productId}:`, error.message);
    return null;
  }

  return data?.price ?? null;
}

async function wasAlertRecentlySent(productId, price, windowHours = ALERT_DEDUP_HOURS) {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('alerts_sent')
    .select('price')
    .eq('product_id', productId)
    .gte('sent_at', since);

  if (error) {
    console.error(`[wasAlertRecentlySent] Erro para produto ${productId}:`, error.message);
    return false;
  }
  if (!data || data.length === 0) return false;

  // "Já alertado" se houver alerta recente com preço dentro da tolerância —
  // assim variação de centavos não burla o dedup.
  const tol = ALERT_DEDUP_TOLERANCE_PCT / 100;
  return data.some((a) => price > 0 && Math.abs(a.price - price) / price <= tol);
}

async function registerAlert(productId, price, discountPct) {
  // discount_pct é NOT NULL no banco. Alertas sem % de queda (ex: cupom manual,
  // back_in_stock) passam null/undefined — normaliza pra 0 pra não estourar a
  // constraint (o que faria o anti-repost NÃO gravar → flood do mesmo item).
  const pct = (discountPct == null || isNaN(discountPct)) ? 0 : discountPct;
  const { error } = await supabase
    .from('alerts_sent')
    .insert({ product_id: productId, price, discount_pct: pct });

  if (error) {
    console.error(`[registerAlert] Erro ao registrar alerta para produto ${productId}:`, error.message);
  }
}

async function getPriceHistory(productId, limit = 60) {
  const { data, error } = await supabase
    .from('price_history')
    .select('price, created_at')
    .eq('product_id', productId)
    .eq('is_available', true)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error(`[getPriceHistory] Erro para produto ${productId}:`, error.message);
    return [];
  }
  return data || [];
}

async function saveUnavailable(productId) {
  const { error } = await supabase
    .from('price_history')
    .insert({ product_id: productId, price: 0, is_available: false });

  if (error) {
    console.error(`[saveUnavailable] Erro para produto ${productId}:`, error.message);
  }
}

async function getConsecutiveUnavailableCount(productId) {
  const { data, error } = await supabase
    .from('price_history')
    .select('is_available')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error || !data) return 0;

  let count = 0;
  for (const entry of data) {
    if (!entry.is_available) count++;
    else break;
  }
  return count;
}

async function getLastScanAt(productId) {
  const { data, error } = await supabase
    .from('price_history')
    .select('created_at')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data.created_at;
}

async function getUnavailableStreakStart(productId) {
  const { data, error } = await supabase
    .from('price_history')
    .select('is_available, created_at')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error || !data || data.length === 0) return null;
  if (data[0].is_available) return null;

  let streakStart = data[0].created_at;
  for (const r of data) {
    if (r.is_available) break;
    streakStart = r.created_at;
  }
  return streakStart;
}

async function wasUnavailableAlertSent(productId) {
  const { data } = await supabase
    .from('products')
    .select('unavailable_alert_sent_at')
    .eq('id', productId)
    .maybeSingle();
  return !!data?.unavailable_alert_sent_at;
}

async function markUnavailableAlertSent(productId) {
  const { error } = await supabase
    .from('products')
    .update({ unavailable_alert_sent_at: new Date().toISOString() })
    .eq('id', productId);
  if (error) console.error('[markUnavailableAlertSent]', error.message);
}

async function clearUnavailableAlertSent(productId) {
  const { error } = await supabase
    .from('products')
    .update({ unavailable_alert_sent_at: null })
    .eq('id', productId);
  if (error) console.error('[clearUnavailableAlertSent]', error.message);
}

async function getNextShowcaseProduct(store) {
  // Próximo da fila: ativo, da loja, com last_showcased_at mais antigo
  // (nunca postado vem primeiro). Rotação circular natural.
  const { data, error } = await supabase
    .from('products')
    .select('id, name, url, store, category, image_url')
    .eq('store', store)
    .eq('active', true)
    .order('last_showcased_at', { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[getNextShowcaseProduct] Erro:', error.message);
    return null;
  }
  return data || null;
}

async function markShowcased(productId) {
  const { error } = await supabase
    .from('products')
    .update({ last_showcased_at: new Date().toISOString() })
    .eq('id', productId);
  if (error) console.error('[markShowcased] Erro:', error.message);
}

async function getUnavailableProducts() {
  const products = await getActiveProducts();
  const enriched = await Promise.all(products.map(async (p) => {
    const [count, lastAt, streakStart] = await Promise.all([
      getConsecutiveUnavailableCount(p.id),
      getLastScanAt(p.id),
      getUnavailableStreakStart(p.id),
    ]);
    return { ...p, unavailableCount: count, lastScanAt: lastAt, streakStart };
  }));
  return enriched
    .filter((p) => p.unavailableCount > 0 && p.streakStart)
    .sort((a, b) => new Date(a.streakStart) - new Date(b.streakStart)); // mais antigo primeiro
}

async function addProduct(name, url, store, opts = {}) {
  const { category = null, addedByTelegramId = null, addedByUsername = null } = opts;

  // Inferência de gênero pra rotear pro tópico certo no grupo
  const gender = inferGender(name, store, category);
  const isMasc = !gender.ambiguous && gender.masc;
  const isFem  = !gender.ambiguous && gender.fem;

  // Verifica se a URL já existe (ativa ou desativada)
  const { data: existing } = await supabase
    .from('products')
    .select('id, active')
    .eq('url', url)
    .maybeSingle();

  if (existing) {
    if (existing.active) {
      return { id: existing.id, status: 'already_active' };
    }
    // Reativa: assume novo dono, atualiza nome/categoria/gênero
    const { error } = await supabase
      .from('products')
      .update({
        name, store, category,
        is_masc: isMasc, is_fem: isFem,
        active: true,
        added_by_telegram_id: addedByTelegramId,
        added_by_username:    addedByUsername,
      })
      .eq('id', existing.id);
    if (error) throw new Error(error.message);
    return { id: existing.id, status: 'reactivated' };
  }

  // Insere novo
  const { data, error } = await supabase
    .from('products')
    .insert({
      name, url, store, category,
      is_masc: isMasc, is_fem: isFem,
      active: true,
      added_by_telegram_id: addedByTelegramId,
      added_by_username:    addedByUsername,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return { id: data.id, status: 'created' };
}

async function deactivateProduct(productId) {
  const { error } = await supabase
    .from('products')
    .update({ active: false })
    .eq('id', productId);

  if (error) throw new Error(error.message);
}

async function countProductsByUser(telegramId) {
  const { count, error } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('added_by_telegram_id', String(telegramId))
    .eq('active', true);
  if (error) {
    console.error('[countProductsByUser] Erro:', error.message);
    return 0;
  }
  return count || 0;
}

async function getProductsByUser(telegramId) {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, store, url')
    .eq('added_by_telegram_id', String(telegramId))
    .eq('active', true)
    .order('name', { ascending: true });
  if (error) {
    console.error('[getProductsByUser] Erro:', error.message);
    return [];
  }
  return data || [];
}

async function findProductByIdAndUser(productId, telegramId) {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, added_by_telegram_id')
    .eq('id', productId)
    .maybeSingle();
  if (error || !data) return null;
  if (String(data.added_by_telegram_id) !== String(telegramId)) return null;
  return data;
}

async function addSuggestion(telegramId, username, url, note = null) {
  // Dedup: usuário pode ter sugestão pendente da mesma URL
  const { data: existing } = await supabase
    .from('suggestions')
    .select('id')
    .eq('telegram_id', String(telegramId))
    .eq('url', url)
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) {
    return { id: existing.id, status: 'duplicate' };
  }

  const { data, error } = await supabase
    .from('suggestions')
    .insert({ telegram_id: String(telegramId), username, url, note })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id, status: 'created' };
}

async function getPendingSuggestions(limit = 50) {
  const { data, error } = await supabase
    .from('suggestions')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[getPendingSuggestions] Erro:', error.message);
    return [];
  }
  return data || [];
}

async function updateSuggestionStatus(id, status) {
  const { error } = await supabase
    .from('suggestions')
    .update({ status })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

async function recordReferral(referrerId, referredId) {
  if (String(referrerId) === String(referredId)) return false;
  const { error } = await supabase
    .from('referrals')
    .insert({ referrer_id: String(referrerId), referred_id: String(referredId) });
  if (error) {
    if (error.code === '23505') return false; // unique violation: já foi referido
    console.error('[recordReferral] Erro:', error.message);
    return false;
  }
  return true;
}

async function countReferrals(referrerId) {
  const { count, error } = await supabase
    .from('referrals')
    .select('*', { count: 'exact', head: true })
    .eq('referrer_id', String(referrerId));
  if (error) {
    console.error('[countReferrals] Erro:', error.message);
    return 0;
  }
  return count || 0;
}

async function hasBeenReferred(referredId) {
  const { count, error } = await supabase
    .from('referrals')
    .select('*', { count: 'exact', head: true })
    .eq('referred_id', String(referredId));
  if (error) return false;
  return (count || 0) > 0;
}

async function getWeeklyTopDrops(limit = 5) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [productsRes, historyRes] = await Promise.all([
    supabase.from('products').select('id, name, url, store, category').eq('active', true),
    supabase.from('price_history').select('product_id, price, created_at')
      .eq('is_available', true)
      .gte('created_at', since)
      .order('created_at', { ascending: true }),
  ]);

  if (productsRes.error || historyRes.error) {
    console.error('[getWeeklyTopDrops] Erro:', productsRes.error?.message || historyRes.error?.message);
    return [];
  }

  const products = Object.fromEntries((productsRes.data || []).map((p) => [p.id, p]));

  const byProduct = {};
  for (const row of historyRes.data || []) {
    if (!products[row.product_id]) continue;
    if (!byProduct[row.product_id]) byProduct[row.product_id] = [];
    byProduct[row.product_id].push(row.price);
  }

  const drops = [];
  for (const [pid, prices] of Object.entries(byProduct)) {
    if (prices.length < 2) continue;
    const weekStartPrice = prices[0];
    const currentPrice = prices[prices.length - 1];
    if (weekStartPrice <= 0 || currentPrice >= weekStartPrice) continue;
    const dropPct = (weekStartPrice - currentPrice) / weekStartPrice * 100;
    drops.push({ product: products[pid], weekStartPrice, currentPrice, dropPct });
  }

  drops.sort((a, b) => b.dropPct - a.dropPct);
  return drops.slice(0, limit);
}

// Lista telegram_ids únicos de quem é watcher de algum produto.
// Usado pelo cron de recomendações personalizadas.
async function getDistinctWatcherIds() {
  const { data, error } = await supabase
    .from('product_watchers')
    .select('telegram_id');
  if (error) return [];
  return [...new Set((data || []).map((r) => r.telegram_id))];
}

// ─── Watchers (alertas privados pra produtos individuais) ───────────────────

async function addWatcher(productId, telegramId, username = null) {
  const { data, error } = await supabase
    .from('product_watchers')
    .insert({ product_id: productId, telegram_id: String(telegramId), username })
    .select('product_id')
    .maybeSingle();
  if (error) {
    if (error.code === '23505') return { status: 'already_watching' }; // unique violation
    throw new Error(error.message);
  }
  return { status: 'added', productId: data?.product_id };
}

async function removeWatcher(productId, telegramId) {
  const { error } = await supabase
    .from('product_watchers')
    .delete()
    .eq('product_id', productId)
    .eq('telegram_id', String(telegramId));
  if (error) throw new Error(error.message);
}

// Retorna watchers de um produto OPCIONALMENTE filtrados por preço-alvo.
// Se currentPrice for passado, retorna só watchers que: (a) não têm target,
// ou (b) têm target >= currentPrice (preço bateu o alvo).
async function getWatchers(productId, currentPrice = null) {
  const { data, error } = await supabase
    .from('product_watchers')
    .select('telegram_id, target_price')
    .eq('product_id', productId);
  if (error) {
    console.error('[getWatchers]', error.message);
    return [];
  }
  if (currentPrice === null) return (data || []).map((r) => r.telegram_id);
  return (data || [])
    .filter((r) => !r.target_price || currentPrice <= Number(r.target_price))
    .map((r) => r.telegram_id);
}

async function isWatching(productId, telegramId) {
  const { count, error } = await supabase
    .from('product_watchers')
    .select('*', { count: 'exact', head: true })
    .eq('product_id', productId)
    .eq('telegram_id', String(telegramId));
  if (error) return false;
  return (count || 0) > 0;
}

async function countWatchedProducts(telegramId) {
  const { count, error } = await supabase
    .from('product_watchers')
    .select('*', { count: 'exact', head: true })
    .eq('telegram_id', String(telegramId));
  if (error) return 0;
  return count || 0;
}

async function getWatchedProducts(telegramId) {
  const { data, error } = await supabase
    .from('product_watchers')
    .select('product_id, products(id, name, store, url, active)')
    .eq('telegram_id', String(telegramId));
  if (error) {
    console.error('[getWatchedProducts]', error.message);
    return [];
  }
  return (data || [])
    .map((r) => r.products)
    .filter((p) => p && p.active);
}

// Procura produto ativo pela URL (independente de quem cadastrou). Usado
// pelo /addproduto pra detectar "já monitorado" antes de cobrar slot.
async function findActiveProductByUrl(url) {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, store, url, image_url')
    .eq('url', url)
    .eq('active', true)
    .maybeSingle();
  if (error) {
    console.error('[findActiveProductByUrl]', error.message);
    return null;
  }
  return data;
}

// ── Mensagens postadas (pra permitir apagar/gerenciar posts depois) ──────────
async function recordPostedMessage({ messageId, threadId, chatId, productId, kind, caption }) {
  if (!messageId) return;
  const { error } = await supabase.from('posted_messages').insert({
    message_id: messageId,
    thread_id: threadId || null,
    chat_id: String(chatId),
    product_id: productId || null,
    kind: kind || null,
    caption: caption ? String(caption).slice(0, 200) : null,
  });
  if (error) console.warn('[recordPostedMessage]', error.message);
}

// Últimas N mensagens postadas (pra /apagar_ultimos)
async function getRecentPostedMessages(limit = 5) {
  const { data, error } = await supabase
    .from('posted_messages')
    .select('id, message_id, thread_id, chat_id, kind, caption, posted_at')
    .order('posted_at', { ascending: false })
    .limit(limit);
  if (error) { console.warn('[getRecentPostedMessages]', error.message); return []; }
  return data || [];
}

// Remove o registro após apagar do Telegram (ou se a msg já não existe)
async function deletePostedMessageRecord(id) {
  await supabase.from('posted_messages').delete().eq('id', id);
}

// Acha registros de uma mensagem específica pelo message_id (todos os threads)
async function findPostedByMessageId(messageId) {
  const { data } = await supabase
    .from('posted_messages')
    .select('id, message_id, thread_id, chat_id')
    .eq('message_id', messageId);
  return data || [];
}

module.exports = {
  getActiveProducts,
  savePrice,
  getLowestPrice,
  recordPostedMessage,
  getRecentPostedMessages,
  deletePostedMessageRecord,
  findPostedByMessageId,
  getLowestPriceRecent,
  getPriceContext,
  getOfferIntelligence,
  getLastPrice,
  wasAlertRecentlySent,
  registerAlert,
  getPriceHistory,
  saveUnavailable,
  getConsecutiveUnavailableCount,
  addProduct,
  deactivateProduct,
  getWeeklyTopDrops,
  getDistinctWatcherIds,
  countProductsByUser,
  getProductsByUser,
  findProductByIdAndUser,
  addSuggestion,
  getPendingSuggestions,
  updateSuggestionStatus,
  recordReferral,
  countReferrals,
  hasBeenReferred,
  getLastScanAt,
  getUnavailableStreakStart,
  wasUnavailableAlertSent,
  markUnavailableAlertSent,
  clearUnavailableAlertSent,
  getUnavailableProducts,
  getNextShowcaseProduct,
  markShowcased,
  isInAdaptiveCooldown,
  addWatcher,
  removeWatcher,
  getWatchers,
  isWatching,
  countWatchedProducts,
  getWatchedProducts,
  findActiveProductByUrl,
};
