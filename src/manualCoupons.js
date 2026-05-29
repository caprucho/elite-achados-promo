// Cupons MANUAIS (definidos pelo dono do canal) — diferente dos cupons
// automáticos da vitrine do ML. Aqui o dono gera um cupom de afiliado
// exclusivo (com CÓDIGO e VALIDADE) e vincula a produtos específicos.
//
// Comportamento (definido com o dono):
//   - Enquanto o cupom é válido (hoje <= expiresAt): produtos entram no rodízio
//     e são postados com o código + validade.
//   - Depois de vencido: o cupom SOME do rodízio, mas os produtos CONTINUAM
//     cadastrados em `products` sendo monitorados normalmente (o módulo
//     couponDeals.js cadastra os produtos no banco na 1ª passada).
//
// Pra adicionar/editar um cupom: edite COUPONS abaixo e faça deploy.
//   - url DEVE ser a URL canônica do produto no ML (.../p/MLB...), NÃO o link
//     social meli.la (esse esconde o produto e o scraper não lê o preço). O
//     ref de afiliado é aplicado automaticamente na hora de postar.
//   - expiresAt no formato 'YYYY-MM-DD' (vence no FIM desse dia, BRT).
//   - discountLabel é texto livre opcional (ex: 'R$ 30 OFF', '15% em perfumes').

const COUPONS = [
  {
    code: 'ELITEOF99PERFUME',
    expiresAt: '2026-06-01',          // vence no fim do dia 01/06 (BRT)
    discountLabel: '',                // opcional — preencha se quiser (ex: 'R$ 30 OFF')
    category: 'perfumaria',
    products: [
      // meli.la/1hghsXC — R$ ~748
      { name: 'Sauvage Dior Parfum - Perfume Masculino 100ml', url: 'https://www.mercadolivre.com.br/sauvage-dior-parfum-perfume-masculino-100ml/p/MLB17451754' },
      // meli.la/2q66hjH — R$ ~629
      { name: 'Bvlgari Man Rain Essence Masculino Eau de Parfum 100ml', url: 'https://www.mercadolivre.com.br/bvlgari-man-rain-essence-masculino-eau-de-parfum-100ml/p/MLB23908421' },
      // meli.la/2zvZ7nn — R$ ~570
      { name: 'Dolce & Gabbana Q EDP Floral Feminino 100ml', url: 'https://www.mercadolivre.com.br/perfume-dolcegabbana-q-edp-floral-feminino-100ml-travel-size/p/MLB41550652' },
    ],
  },
];

// Cupom válido se ainda não passou o FIM do dia expiresAt em BRT (UTC-3).
// Fim do dia 01/06 BRT = 02/06 02:59:59 UTC (≈ +1 dia às 03:00 UTC).
function isCouponValid(coupon, now = Date.now()) {
  if (!coupon.expiresAt) return true; // sem validade = sempre válido
  const [y, m, d] = coupon.expiresAt.split('-').map(Number);
  if (!y || !m || !d) return true;
  // fim do dia BRT = 23:59:59.999 BRT = +3h em UTC → 02:59:59.999 UTC do dia seguinte
  const expiryUtc = Date.UTC(y, m - 1, d, 23 + 3, 59, 59, 999);
  return now <= expiryUtc;
}

// Produto está pronto pra usar (URL canônica preenchida, não placeholder)?
function hasRealUrl(p) {
  return /\/(p\/MLB|up\/MLBU|MLB-)\d+/i.test(String(p.url || ''));
}

// Todos os cupons configurados (válidos ou não) — usado pra cadastrar os
// produtos no banco mesmo perto/depois de vencer (eles seguem monitorados).
function getAllCoupons() {
  return COUPONS;
}

// Só cupons válidos AGORA e com pelo menos 1 produto de URL real.
function getActiveCoupons(now = Date.now()) {
  return COUPONS
    .filter((c) => isCouponValid(c, now))
    .map((c) => ({ ...c, products: c.products.filter(hasRealUrl) }))
    .filter((c) => c.products.length > 0);
}

module.exports = { getAllCoupons, getActiveCoupons, isCouponValid, hasRealUrl };
