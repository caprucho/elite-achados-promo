// Roteador categoria → message_thread_id do grupo com tópicos.
// Cada slot lê uma env; se a env não estiver setada, usa o fallback indicado.
// Assim você pode adicionar novos tópicos no Telegram e ativar setando 1 env
// no Railway, sem mexer no código.

const env = process.env;

function asThreadId(v) {
  if (!v) return null;
  const n = parseInt(String(v).trim(), 10);
  return isNaN(n) || n <= 0 ? null : n;
}

const TOPIC_IDS = {
  // Núcleo
  geral:          asThreadId(env.TG_TOPIC_GERAL),
  bugs:           asThreadId(env.TG_TOPIC_BUGS),
  top_semana:     asThreadId(env.TG_TOPIC_TOP_SEMANA),
  achadinhos:     asThreadId(env.TG_TOPIC_ACHADINHOS),
  cupons_kabum:   asThreadId(env.TG_TOPIC_CUPONS_KABUM),
  cupons_geral:   asThreadId(env.TG_TOPIC_CUPONS_GERAL),

  // Categorias gerais
  hardware:       asThreadId(env.TG_TOPIC_HARDWARE),
  eletronicos:    asThreadId(env.TG_TOPIC_ELETRONICOS),
  casa:           asThreadId(env.TG_TOPIC_CASA),

  // Beleza/Perfumes (juntos hoje, splitáveis depois)
  perfumes_beleza: asThreadId(env.TG_TOPIC_PERFUMES_BELEZA),
  perfumes:        asThreadId(env.TG_TOPIC_PERFUMES),    // split futuro
  cosmeticos:      asThreadId(env.TG_TOPIC_COSMETICOS),  // split futuro

  // Moda (unisex hoje, splitável por gênero)
  calcados:        asThreadId(env.TG_TOPIC_CALCADOS),
  calcados_masc:   asThreadId(env.TG_TOPIC_CALCADOS_MASC),
  calcados_fem:    asThreadId(env.TG_TOPIC_CALCADOS_FEM),
  roupas:          asThreadId(env.TG_TOPIC_ROUPAS),
  roupas_masc:     asThreadId(env.TG_TOPIC_ROUPAS_MASC),
  roupas_fem:      asThreadId(env.TG_TOPIC_ROUPAS_FEM),
};

// Resolve com fallback: hierarquia "specific → unisex → geral"
function topic(name) {
  return TOPIC_IDS[name] || null;
}

// Decide o(s) tópico(s) certo(s) pra um produto baseado em category + gênero.
// Retorna ARRAY de thread_ids (pode ser 1 ou 2 pra unissex splitado).
// Se nenhum tópico foi configurado, retorna [GERAL] como fallback final.
function topicsForProduct({ category, isMasc, isFem }) {
  const cat = String(category || '').toLowerCase();
  const ids = new Set();

  const addOrFallback = (specific, fallback) => {
    const t = topic(specific) || topic(fallback);
    if (t) ids.add(t);
  };

  if (['hardware', 'smartphones', 'audio'].includes(cat)) {
    addOrFallback('hardware', 'geral');
  } else if (cat === 'eletronicos') {
    addOrFallback('eletronicos', 'geral');
  } else if (cat === 'casa') {
    addOrFallback('casa', 'geral');
  } else if (cat === 'beleza' || cat === 'perfumaria') {
    // Tem split entre perfumes e cosméticos? Se sim, decide pelo nome (no caller).
    // Aqui só roteia pro perfumes_beleza unisex.
    addOrFallback('perfumes_beleza', 'geral');
  } else if (cat === 'calcados') {
    if (isMasc && isFem) {
      // Unissex: posta nos 2 (se split) ou no único (se unisex)
      if (TOPIC_IDS.calcados_masc && TOPIC_IDS.calcados_fem) {
        ids.add(TOPIC_IDS.calcados_masc);
        ids.add(TOPIC_IDS.calcados_fem);
      } else {
        addOrFallback('calcados', 'geral');
      }
    } else if (isMasc) {
      addOrFallback('calcados_masc', 'calcados');
      if (!ids.size) addOrFallback('calcados', 'geral');
    } else if (isFem) {
      addOrFallback('calcados_fem', 'calcados');
      if (!ids.size) addOrFallback('calcados', 'geral');
    } else {
      // sem flag: cai pro unisex
      addOrFallback('calcados', 'geral');
    }
  } else if (cat === 'vestuario' || cat === 'acessorios') {
    if (isMasc && isFem) {
      if (TOPIC_IDS.roupas_masc && TOPIC_IDS.roupas_fem) {
        ids.add(TOPIC_IDS.roupas_masc);
        ids.add(TOPIC_IDS.roupas_fem);
      } else {
        addOrFallback('roupas', 'geral');
      }
    } else if (isMasc) {
      addOrFallback('roupas_masc', 'roupas');
      if (!ids.size) addOrFallback('roupas', 'geral');
    } else if (isFem) {
      addOrFallback('roupas_fem', 'roupas');
      if (!ids.size) addOrFallback('roupas', 'geral');
    } else {
      addOrFallback('roupas', 'geral');
    }
  } else {
    // Sem categoria ou desconhecido → Geral
    addOrFallback('geral', 'geral');
  }

  if (!ids.size) {
    const g = topic('geral');
    if (g) ids.add(g);
  }
  return [...ids];
}

module.exports = { TOPIC_IDS, topic, topicsForProduct };
