-- ELITE Achados & Promo — migração 007
-- Relação N:N usuário ↔ produto. Cada watcher recebe DM no privado a
-- cada notificação daquele produto. Adicionar watcher de produto já
-- monitorado pelo bot é grátis (não conta no limite de slots). Adicionar
-- produto NOVO via /addproduto conta no limite.
-- Como rodar: cole no Supabase Studio → SQL Editor → Run. Idempotente.

CREATE TABLE IF NOT EXISTS product_watchers (
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  telegram_id TEXT NOT NULL,
  username    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, telegram_id)
);

CREATE INDEX IF NOT EXISTS product_watchers_user_idx    ON product_watchers(telegram_id);
CREATE INDEX IF NOT EXISTS product_watchers_product_idx ON product_watchers(product_id);
