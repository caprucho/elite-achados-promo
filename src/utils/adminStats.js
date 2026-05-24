// Helpers de stats e health pra os comandos admin (/stats, /health, /buscar, etc).
// Usa pg direto pra agregações SQL — fica mais rápido que filtrar em JS.
const { Client } = require('pg');

const CONN = process.env.DATABASE_URL;

function pg() {
  return new Client({ connectionString: CONN, ssl: { rejectUnauthorized: false } });
}

// ─── STATS ──────────────────────────────────────────────────────────────────
async function getAdminStats() {
  const c = pg();
  await c.connect();
  try {
    // Sequencial — pg Client não suporta queries paralelas
    const products = await c.query("SELECT COUNT(*)::int AS n FROM products WHERE active=true");
    const alerts24h = await c.query("SELECT COUNT(*)::int AS n FROM alerts_sent WHERE sent_at >= NOW() - INTERVAL '24 hours'");
    const alertsByCat7d = await c.query(`
      SELECT p.category, COUNT(*)::int AS n
      FROM alerts_sent a
      JOIN products p ON p.id = a.product_id
      WHERE a.sent_at >= NOW() - INTERVAL '7 days'
      GROUP BY p.category ORDER BY n DESC LIMIT 6
    `);
    const topUsers = await c.query(`
      SELECT added_by_username, added_by_telegram_id, COUNT(*)::int AS n
      FROM products
      WHERE added_by_telegram_id IS NOT NULL AND active=true
      GROUP BY added_by_username, added_by_telegram_id
      ORDER BY n DESC LIMIT 5
    `);
    const watchers = await c.query("SELECT COUNT(*)::int AS total, COUNT(DISTINCT telegram_id)::int AS users FROM product_watchers");
    return {
      totalProducts: products.rows[0].n,
      alerts24h: alerts24h.rows[0].n,
      alertsByCategory7d: alertsByCat7d.rows,
      topUsers: topUsers.rows,
      totalWatchers: watchers.rows[0].total,
      uniqueWatchers: watchers.rows[0].users,
    };
  } finally {
    await c.end();
  }
}

// ─── HEALTH ─────────────────────────────────────────────────────────────────
async function getHealthChecks() {
  const c = pg();
  const t0 = Date.now();
  await c.connect();
  const dbLatency = Date.now() - t0;
  try {
    const lastScan = await c.query("SELECT MAX(created_at) AS last FROM price_history");
    const backoff = await c.query(`
      SELECT COUNT(*)::int AS n FROM (
        SELECT DISTINCT ON (product_id) product_id, is_available
        FROM price_history
        ORDER BY product_id, created_at DESC
      ) sub WHERE is_available = false
    `);
    const errors24h = await c.query(`
      SELECT COUNT(*)::int AS n FROM (
        SELECT product_id, is_available, created_at
        FROM price_history
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      ) sub WHERE is_available = false
    `);

    // Amazon fail rate 24h
    const azn = await c.query(`
      SELECT
        SUM(CASE WHEN is_available THEN 1 ELSE 0 END)::int AS ok,
        SUM(CASE WHEN NOT is_available THEN 1 ELSE 0 END)::int AS fail
      FROM price_history ph
      JOIN products p ON p.id = ph.product_id
      WHERE p.store = 'amazon' AND ph.created_at >= NOW() - INTERVAL '24 hours'
    `);
    const aznRow = azn.rows[0];
    const aznTotal = (aznRow.ok || 0) + (aznRow.fail || 0);
    const aznFailPct = aznTotal > 0 ? ((aznRow.fail / aznTotal) * 100) : 0;

    return {
      dbLatency,
      lastScanAt: lastScan.rows[0].last,
      productsInBackoff: backoff.rows[0].n,
      failedScans24h: errors24h.rows[0].n,
      amazonFailPct24h: aznFailPct.toFixed(0),
      amazonOk24h: aznRow.ok || 0,
      amazonFail24h: aznRow.fail || 0,
    };
  } finally {
    await c.end();
  }
}

// ─── PRODUCT PRICE STATS ────────────────────────────────────────────────────
async function getProductPriceStats(productId) {
  const c = pg();
  await c.connect();
  try {
    // SQL único com subqueries (Postgres aceita queries paralelas em subqueries)
    const r = await c.query(`
      SELECT
        (SELECT name  FROM products WHERE id = $1) AS name,
        (SELECT url   FROM products WHERE id = $1) AS url,
        (SELECT store FROM products WHERE id = $1) AS store,
        (SELECT price FROM price_history WHERE product_id = $1 AND is_available = true ORDER BY created_at DESC LIMIT 1) AS current_price,
        (SELECT MIN(price) FROM price_history WHERE product_id = $1 AND is_available = true) AS min_price,
        (SELECT MAX(price) FROM price_history WHERE product_id = $1 AND is_available = true) AS max_price,
        (SELECT AVG(price) FROM price_history WHERE product_id = $1 AND is_available = true AND created_at >= NOW() - INTERVAL '30 days') AS avg_30d,
        (SELECT created_at FROM price_history WHERE product_id = $1 AND is_available = true ORDER BY price ASC, created_at DESC LIMIT 1) AS min_at,
        (SELECT COUNT(*) FROM price_history WHERE product_id = $1 AND is_available = true) AS count
    `, [productId]);
    return r.rows[0];
  } finally {
    await c.end();
  }
}

// ─── BUSCA POR NOME ─────────────────────────────────────────────────────────
async function searchProducts(query, limit = 10) {
  const c = pg();
  await c.connect();
  try {
    const r = await c.query(`
      SELECT id, name, store, category, active
      FROM products
      WHERE name ILIKE $1
      ORDER BY active DESC, name
      LIMIT $2
    `, [`%${query}%`, limit]);
    return r.rows;
  } finally {
    await c.end();
  }
}

// ─── UPDATE TARGET PRICE ────────────────────────────────────────────────────
async function setWatcherTargetPrice(productId, telegramId, targetPrice) {
  const c = pg();
  await c.connect();
  try {
    const r = await c.query(`
      UPDATE product_watchers
      SET target_price = $3
      WHERE product_id = $1 AND telegram_id = $2
      RETURNING product_id
    `, [productId, String(telegramId), targetPrice]);
    return r.rowCount > 0;
  } finally {
    await c.end();
  }
}

module.exports = {
  getAdminStats,
  getHealthChecks,
  getProductPriceStats,
  searchProducts,
  setWatcherTargetPrice,
};
