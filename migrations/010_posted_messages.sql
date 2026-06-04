-- ELITE Achados & Promo — migração 010
-- Registra cada mensagem postada pelo bot no grupo (message_id), pra permitir
-- apagar/gerenciar posts depois. Antes o bot não guardava o ID → não dava pra
-- apagar nada pelo código.
-- Como rodar: cole no Supabase Studio → SQL Editor → Run. Idempotente.

CREATE TABLE IF NOT EXISTS posted_messages (
  id          BIGSERIAL PRIMARY KEY,
  message_id  BIGINT NOT NULL,
  thread_id   BIGINT,                 -- tópico (message_thread_id), null = topo do grupo
  chat_id     TEXT NOT NULL,          -- id do grupo/canal de destino
  product_id  UUID REFERENCES products(id) ON DELETE SET NULL,
  kind        TEXT,                   -- 'alert' | 'ml_deal' | 'coupon' | 'showcase' | 'cupom_kabum' | etc
  caption     TEXT,                   -- primeiros chars do texto (pra identificar no /apagar)
  posted_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS posted_messages_posted_at_idx ON posted_messages(posted_at DESC);
CREATE INDEX IF NOT EXISTS posted_messages_product_idx   ON posted_messages(product_id);
