-- ELITE Achados & Promo — migração 006
-- Suporte a imagem nos cards do canal (vitrine/achadinhos da Amazon).
-- O scraper já extrai imageUrl, mas até agora a vitrine ignorava — aqui
-- guardamos no produto pra usar mesmo quando o scraping da Amazon não
-- roda no Railway (depende do refresh-amazon local).
-- Como rodar: cole no Supabase Studio → SQL Editor → Run. Idempotente.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS image_url TEXT;
