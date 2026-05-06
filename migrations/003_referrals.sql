-- ELITE Achados & Promo — migração 003
-- Sistema de referrals: cada amigo indicado dá +1 slot extra ao indicador.
-- Como rodar: cole no Supabase Studio → SQL Editor → Run.
-- Idempotente.

CREATE TABLE IF NOT EXISTS referrals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id  TEXT NOT NULL,
  referred_id  TEXT NOT NULL UNIQUE,  -- cada usuário só pode ser referido 1x
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals(referrer_id);
