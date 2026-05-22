// Inferência de gênero (is_masc, is_fem) a partir de nome + loja do produto.
// Retorna { masc, fem, ambiguous } onde `ambiguous=true` indica que NENHUMA
// regra confiou no resultado — tratar como caso a revisar.
//
// Estratégia em camadas (1ª que casar manda):
//   1. Override por loja (Farm Rio, Animale = sempre FEM)
//   2. Keywords explícitas no nome ("Feminino"/"Masculino"/"Unissex")
//   3. Categorias que não têm gênero (eletrônicos/casa/hardware) → ambos false, NÃO ambíguo
//   4. Fallback → ambíguo

const STORE_OVERRIDES = {
  farmrio: { masc: false, fem: true, ambiguous: false, reason: 'loja exclusivamente fem' },
  animale: { masc: false, fem: true, ambiguous: false, reason: 'loja exclusivamente fem' },
};

const FEM_KEYWORDS = [
  /\bfeminin[ao]\b/i,
  /\bmulher(es)?\b/i,
  /\bmamãe?\b/i,
  /\bvestido\b/i,
  /\bsaia\b/i,
  /\bblusinha\b/i,
  /\bsuti[aã]\b/i,
  /\bcalcinha\b/i,
  /\bcropped\b/i,
  /\bmacac[ãa]o\b/i,
  /\bkimono\b/i,
  /\bsalto\b/i,
  /\bsandália\b/i,
];

const MASC_KEYWORDS = [
  /\bmasculin[ao]\b/i,
  /\bhomem\b/i,
  /\bbermuda\b/i,
  /\bcueca\b/i,
  /\bsapato\s+social\b/i,
  /\bgrav[ae]ta\b/i,
];

const UNISEX_KEYWORDS = [
  /\bunissex\b/i,
  /\bunisex\b/i,
];

// Categorias onde gênero não faz sentido → flags ficam false mas não é ambíguo
const NON_GENDERED_CATEGORIES = new Set([
  'hardware', 'eletronicos', 'casa', 'smartphones', 'audio',
]);

function inferGender(name, store, category) {
  const safeName = String(name || '');
  const safeStore = String(store || '').toLowerCase();
  const safeCategory = String(category || '').toLowerCase();

  // 1. Override por loja
  if (STORE_OVERRIDES[safeStore]) {
    return { ...STORE_OVERRIDES[safeStore] };
  }

  // 2. Categorias sem gênero
  if (NON_GENDERED_CATEGORIES.has(safeCategory)) {
    return { masc: false, fem: false, ambiguous: false, reason: 'categoria sem gênero' };
  }

  // 3. Keywords no nome
  const hasUnisex = UNISEX_KEYWORDS.some((r) => r.test(safeName));
  if (hasUnisex) {
    return { masc: true, fem: true, ambiguous: false, reason: 'unissex no nome' };
  }
  const hasMasc = MASC_KEYWORDS.some((r) => r.test(safeName));
  const hasFem  = FEM_KEYWORDS.some((r) => r.test(safeName));
  if (hasMasc && hasFem) {
    return { masc: true, fem: true, ambiguous: false, reason: 'masc+fem no nome (unissex)' };
  }
  if (hasMasc) return { masc: true, fem: false, ambiguous: false, reason: 'keyword masc' };
  if (hasFem)  return { masc: false, fem: true, ambiguous: false, reason: 'keyword fem' };

  // 4. Beleza/perfumaria sem keyword: tratar como unissex (perfume "Sol de Janeiro" etc)
  if (safeCategory === 'beleza' || safeCategory === 'perfumaria') {
    return { masc: true, fem: true, ambiguous: false, reason: 'beleza sem marcador (unissex)' };
  }

  // 5. Acessórios sem keyword: tratar como unissex (mochila, óculos, etc)
  if (safeCategory === 'acessorios') {
    return { masc: true, fem: true, ambiguous: false, reason: 'acessório sem marcador (unissex)' };
  }

  // 6. Fallback: ambíguo (calçado/vestuário sem keyword nem loja-fem-only)
  return { masc: false, fem: false, ambiguous: true, reason: 'sem marcador identificável' };
}

module.exports = { inferGender };
