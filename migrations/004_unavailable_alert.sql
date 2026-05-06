-- ELITE Achados & Promo — migração 004
-- Suporte a notificação admin quando produto fica >7 dias indisponível.
-- Como rodar: cole no Supabase Studio → SQL Editor → Run.
-- Idempotente.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS unavailable_alert_sent_at TIMESTAMPTZ;
