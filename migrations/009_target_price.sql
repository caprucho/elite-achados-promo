-- ELITE Achados & Promo — migração 009
-- Preço-alvo opcional por watcher. Quando setado, o watcher só recebe DM
-- se o preço atual estiver IGUAL OU ABAIXO do target. Útil pra usuário que
-- só quer alerta quando o produto bater um valor específico de compra.
-- Como rodar: idempotente, OK chamar várias vezes.

ALTER TABLE product_watchers
  ADD COLUMN IF NOT EXISTS target_price NUMERIC;
