-- ELITE Achados & Promo — migração 008
-- Gênero binário (is_masc + is_fem) pra rotear produtos pros tópicos certos
-- quando houver split por gênero. Hoje os tópicos calçados/roupas são
-- unisex, mas a coluna fica pronta pra splitar no futuro sem migration.
-- Combinações:
--   is_masc=true,  is_fem=false → só masculino
--   is_masc=false, is_fem=true  → só feminino
--   is_masc=true,  is_fem=true  → unissex (posta nos dois quando splitado)
--   is_masc=false, is_fem=false → não-aplicável (eletrônicos, casa, etc) ou ambíguo

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_masc BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_fem  BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS products_gender_idx
  ON products(category, is_masc, is_fem)
  WHERE active = true;
