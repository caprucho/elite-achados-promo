-- ELITE Achados & Promo — migração 002
-- Suporte a usuários cadastrarem seus próprios produtos + sugestões.
-- Como rodar: cole esse SQL no Supabase Studio → SQL Editor → Run.
-- Idempotente: pode rodar múltiplas vezes sem efeito colateral.

-- 1. Quem cadastrou cada produto (NULL = adicionado pelo admin via seed)
ALTER TABLE products ADD COLUMN IF NOT EXISTS added_by_telegram_id TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS added_by_username    TEXT;

CREATE INDEX IF NOT EXISTS products_added_by_idx
  ON products(added_by_telegram_id)
  WHERE active = true;

-- 2. Tabela de sugestões (modo "pedido" — usuário sugere, admin aprova/rejeita)
CREATE TABLE IF NOT EXISTS suggestions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id TEXT NOT NULL,
  username    TEXT,
  url         TEXT NOT NULL,
  note        TEXT,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','approved','rejected','added')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS suggestions_status_idx ON suggestions(status);
CREATE INDEX IF NOT EXISTS suggestions_user_idx   ON suggestions(telegram_id);
