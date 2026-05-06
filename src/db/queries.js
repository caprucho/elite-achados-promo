const { supabase } = require('./supabase');

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

async function wasAlertRecentlySent(productId, price, windowHours = 24) {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('alerts_sent')
    .select('id')
    .eq('product_id', productId)
    .eq('price', price)
    .gte('sent_at', since)
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error(`[wasAlertRecentlySent] Erro para produto ${productId}:`, error.message);
  }

  return !!data;
}

async function registerAlert(productId, price, discountPct) {
  const { error } = await supabase
    .from('alerts_sent')
    .insert({ product_id: productId, price, discount_pct: discountPct });

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

async function addProduct(name, url, store, opts = {}) {
  const { category = null, addedByTelegramId = null, addedByUsername = null } = opts;
  const { data, error } = await supabase
    .from('products')
    .insert({
      name, url, store, category,
      active: true,
      added_by_telegram_id: addedByTelegramId,
      added_by_username:    addedByUsername,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return data.id;
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
  const { data, error } = await supabase
    .from('suggestions')
    .insert({ telegram_id: String(telegramId), username, url, note })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id;
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
    supabase.from('products').select('id, name, url, store').eq('active', true),
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

module.exports = {
  getActiveProducts,
  savePrice,
  getLowestPrice,
  getLastPrice,
  wasAlertRecentlySent,
  registerAlert,
  getPriceHistory,
  saveUnavailable,
  getConsecutiveUnavailableCount,
  addProduct,
  deactivateProduct,
  getWeeklyTopDrops,
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
};
