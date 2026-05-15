// Vitrine rotativa — posta produtos de uma loja no canal em horários fixos.
// Uso atual: produtos Amazon (o scraping da Amazon é bloqueado no Railway,
// então a vitrine usa o último preço salvo no banco — atualizado pelo
// script local scripts/refresh-amazon.js).
const { getNextShowcaseProduct, markShowcased, getLastPrice } = require('./db/queries');
const { sendShowcase } = require('./bot/telegram');

const SHOWCASE_STORE = process.env.SHOWCASE_STORE || 'amazon';
// Horários UTC dos posts (default: 10h,13h,16h,19h,22h BRT = 13,16,19,22,1 UTC)
const SHOWCASE_HOURS_UTC = (process.env.SHOWCASE_HOURS_UTC || '13,16,19,22,1')
  .split(',').map((h) => parseInt(h.trim(), 10)).filter((h) => h >= 0 && h <= 23)
  .sort((a, b) => a - b);

async function postOne() {
  try {
    const product = await getNextShowcaseProduct(SHOWCASE_STORE);
    if (!product) {
      console.warn(`[Showcase] Nenhum produto ativo da loja ${SHOWCASE_STORE}`);
      return;
    }

    const price = await getLastPrice(product.id);
    if (!price || price <= 0) {
      // Sem preço no histórico — marca como mostrado pra não travar a fila
      console.warn(`[Showcase] ${product.name} sem preço no banco — pulando (rode refresh-amazon)`);
      await markShowcased(product.id);
      return;
    }

    const sent = await sendShowcase({
      name: product.name,
      url: product.url,
      store: product.store,
      category: product.category,
      price,
      imageUrl: null, // imagem opcional; o link já gera preview
    });

    if (sent) {
      await markShowcased(product.id);
      console.log(`[Showcase] Postado: ${product.name}`);
    }
  } catch (err) {
    console.error('[Showcase] Erro ao postar:', err.message);
  }
}

function msUntilNextSlot() {
  const now = new Date();
  const nowH = now.getUTCHours();
  // Acha a próxima hora da lista (hoje ou amanhã)
  let target = new Date(now);
  let slot = SHOWCASE_HOURS_UTC.find((h) => h > nowH);
  if (slot === undefined) {
    // Passou de todos os horários hoje — primeiro slot de amanhã
    slot = SHOWCASE_HOURS_UTC[0];
    target.setUTCDate(target.getUTCDate() + 1);
  }
  target.setUTCHours(slot, 0, 0, 0);
  return target.getTime() - now.getTime();
}

function scheduleShowcase() {
  if (!SHOWCASE_HOURS_UTC.length) {
    console.warn('[Showcase] SHOWCASE_HOURS_UTC vazio — vitrine desativada');
    return;
  }
  const delay = msUntilNextSlot();
  console.log(`[Showcase] Próximo post em ${(delay / 3600000).toFixed(1)}h (loja: ${SHOWCASE_STORE}, ${SHOWCASE_HOURS_UTC.length}x/dia)`);
  setTimeout(async () => {
    await postOne();
    scheduleShowcase();
  }, delay);
}

module.exports = { scheduleShowcase, postOne };
