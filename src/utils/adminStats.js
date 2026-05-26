// Helpers de stats e health pra os comandos admin (/stats, /health, /buscar, etc).
// Usa o supabase client (HTTPS) — funciona em qualquer rede, inclusive Railway
// (que não tem IPv6 outbound — pg direto pelo hostname db.xxx.supabase.co falha
// com ENETUNREACH).
const { supabase } = require('../db/supabase');

// ─── STATS ──────────────────────────────────────────────────────────────────
async function getAdminStats() {
  const since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const [
    productsRes,
    alerts24hRes,
    alerts7dRes,
    productsByUserRes,
    watchersRes,
  ] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }).eq('active', true),
    supabase.from('alerts_sent').select('*', { count: 'exact', head: true }).gte('sent_at', since24),
    supabase.from('alerts_sent').select('product_id, products!inner(category)').gte('sent_at', since7d),
    supabase.from('products').select('added_by_telegram_id, added_by_username').not('added_by_telegram_id', 'is', null).eq('active', true),
    supabase.from('product_watchers').select('telegram_id'),
  ]);

  // Agrega alertas por categoria (em JS, já que supabase não tem GROUP BY nativo via REST)
  const catCount = {};
  for (const row of alerts7dRes.data || []) {
    const c = row.products?.category || '(sem)';
    catCount[c] = (catCount[c] || 0) + 1;
  }
  const alertsByCategory7d = Object.entries(catCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([category, n]) => ({ category, n }));

  // Agrega top users por count de produtos cadastrados
  const userCount = {};
  for (const row of productsByUserRes.data || []) {
    const key = row.added_by_telegram_id;
    if (!userCount[key]) userCount[key] = { added_by_telegram_id: key, added_by_username: row.added_by_username, n: 0 };
    userCount[key].n++;
  }
  const topUsers = Object.values(userCount).sort((a, b) => b.n - a.n).slice(0, 5);

  // Watchers
  const watchersData = watchersRes.data || [];
  const uniqueUsers = new Set(watchersData.map((w) => w.telegram_id));

  return {
    totalProducts: productsRes.count || 0,
    alerts24h: alerts24hRes.count || 0,
    alertsByCategory7d,
    topUsers,
    totalWatchers: watchersData.length,
    uniqueWatchers: uniqueUsers.size,
  };
}

// ─── HEALTH ─────────────────────────────────────────────────────────────────
async function getHealthChecks() {
  const since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const t0 = Date.now();
  const [lastScanRes, backoffRes, amazon24hRes] = await Promise.all([
    supabase.from('price_history').select('created_at').order('created_at', { ascending: false }).limit(1),
    supabase.from('products').select('id, active').eq('active', true),
    supabase.from('price_history').select('is_available, products!inner(store)').eq('products.store', 'amazon').gte('created_at', since24),
  ]);
  const dbLatency = Date.now() - t0;

  // Contagem de produtos em backoff = produtos cuja última leitura foi is_available=false.
  // Mais barato fazer no JS: pega últimos 1000 price_history de produtos ativos.
  const { data: recentHistory } = await supabase
    .from('price_history')
    .select('product_id, is_available, created_at')
    .order('created_at', { ascending: false })
    .limit(3000);
  const lastByProduct = new Map();
  for (const row of recentHistory || []) {
    if (!lastByProduct.has(row.product_id)) lastByProduct.set(row.product_id, row.is_available);
  }
  let backoffCount = 0;
  for (const isAvail of lastByProduct.values()) if (!isAvail) backoffCount++;

  // Amazon stats 24h
  let aznOk = 0, aznFail = 0;
  for (const row of amazon24hRes.data || []) {
    if (row.is_available) aznOk++; else aznFail++;
  }
  const aznTotal = aznOk + aznFail;
  const aznFailPct = aznTotal > 0 ? ((aznFail / aznTotal) * 100) : 0;

  return {
    dbLatency,
    lastScanAt: lastScanRes.data?.[0]?.created_at || null,
    productsInBackoff: backoffCount,
    failedScans24h: aznFail, // só Amazon por enquanto — fora dela quase não tem falha
    amazonFailPct24h: aznFailPct.toFixed(0),
    amazonOk24h: aznOk,
    amazonFail24h: aznFail,
  };
}

// ─── PRODUCT PRICE STATS ────────────────────────────────────────────────────
async function getProductPriceStats(productId) {
  const { data: product } = await supabase
    .from('products')
    .select('name, url, store')
    .eq('id', productId)
    .maybeSingle();
  if (!product) return null;

  const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const [allPricesRes, recent30Res] = await Promise.all([
    supabase.from('price_history').select('price, created_at').eq('product_id', productId).eq('is_available', true).order('price', { ascending: true }),
    supabase.from('price_history').select('price').eq('product_id', productId).eq('is_available', true).gte('created_at', since30),
  ]);

  const allPrices = allPricesRes.data || [];
  if (allPrices.length === 0) {
    return { ...product, current_price: null, min_price: null, max_price: null, avg_30d: null, min_at: null, count: 0 };
  }

  // current = última (ordem desc por created_at)
  const { data: currentRes } = await supabase
    .from('price_history').select('price, created_at')
    .eq('product_id', productId).eq('is_available', true)
    .order('created_at', { ascending: false }).limit(1);
  const current = currentRes?.[0];

  const prices = allPrices.map((r) => r.price);
  const min_price = prices[0]; // já ordenado asc
  const max_price = Math.max(...prices);
  const min_at = allPrices[0].created_at;

  const recent = (recent30Res.data || []).map((r) => r.price);
  const avg_30d = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : null;

  return {
    name: product.name,
    url: product.url,
    store: product.store,
    current_price: current?.price || null,
    min_price,
    max_price,
    avg_30d,
    min_at,
    count: allPrices.length,
  };
}

// ─── BUSCA POR NOME ─────────────────────────────────────────────────────────
async function searchProducts(query, limit = 10) {
  const term = `%${query}%`;
  const { data, error } = await supabase
    .from('products')
    .select('id, name, store, category, active')
    .ilike('name', term)
    .order('active', { ascending: false })
    .order('name', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('[searchProducts]', error.message);
    return [];
  }
  return data || [];
}

// ─── UPDATE TARGET PRICE ────────────────────────────────────────────────────
async function setWatcherTargetPrice(productId, telegramId, targetPrice) {
  const { error, count } = await supabase
    .from('product_watchers')
    .update({ target_price: targetPrice }, { count: 'exact' })
    .eq('product_id', productId)
    .eq('telegram_id', String(telegramId));
  if (error) throw new Error(error.message);
  return (count || 0) > 0;
}

module.exports = {
  getAdminStats,
  getHealthChecks,
  getProductPriceStats,
  searchProducts,
  setWatcherTargetPrice,
};
