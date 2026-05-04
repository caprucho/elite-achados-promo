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

async function addProduct(name, url, store) {
  const { data, error } = await supabase
    .from('products')
    .insert({ name, url, store, active: true })
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
};
