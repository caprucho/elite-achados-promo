-- ELITE Achados & Promo — migração 005
-- Suporte à vitrine rotativa (showcase) — ex: produtos Amazon postados 5x/dia.
-- Como rodar: cole no Supabase Studio → SQL Editor → Run. Idempotente.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS last_showcased_at TIMESTAMPTZ;

-- Índice pra pegar rápido o próximo da fila (mais antigo / nunca postado)
CREATE INDEX IF NOT EXISTS products_showcase_idx
  ON products(store, last_showcased_at)
  WHERE active = true;
