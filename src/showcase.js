// Vitrine rotativa — posta produtos de uma loja no canal em horários
// ALEATÓRIOS dentro de uma janela diária (default: 5x/dia entre 09h-22h BRT).
// Uso atual: produtos Amazon (o scraping da Amazon é bloqueado no Railway,
// então a vitrine usa o último preço salvo no banco — atualizado pelo
// script local scripts/refresh-amazon.js).
const { getNextShowcaseProduct, markShowcased, getLastPrice } = require('./db/queries');
const { sendShowcase } = require('./bot/telegram');

const SHOWCASE_STORE       = process.env.SHOWCASE_STORE || 'amazon';
const SHOWCASE_COUNT       = parseInt(process.env.SHOWCASE_COUNT || '5', 10);
const SHOWCASE_START_BRT   = parseInt(process.env.SHOWCASE_START_BRT || '9', 10);  // 09h
const SHOWCASE_END_BRT     = parseInt(process.env.SHOWCASE_END_BRT || '22', 10);   // 22h

// Brasil é UTC-3 (sem horário de verão). Converte um minuto-do-dia em BRT
// no Date (UTC absoluto) correspondente a HOJE no fuso de Brasília.
function brtMinuteToDate(brtMinute) {
  const now = new Date();
  const brtNow = new Date(now.getTime() - 3 * 3600 * 1000);
  const y = brtNow.getUTCFullYear(), mo = brtNow.getUTCMonth(), d = brtNow.getUTCDate();
  return new Date(Date.UTC(y, mo, d, 0, brtMinute, 0) + 3 * 3600 * 1000);
}

async function postOne() {
  try {
    const product = await getNextShowcaseProduct(SHOWCASE_STORE);
    if (!product) {
      console.warn(`[Showcase] Nenhum produto ativo da loja ${SHOWCASE_STORE}`);
      return;
    }

    const price = await getLastPrice(product.id);
    if (!price || price <= 0) {
      console.warn(`[Showcase] ${product.name} sem preço no banco — pulando (rode refresh-amazon)`);
      await markShowcased(product.id);
      return;
    }

    const sent = await sendShowcase({
      productId: product.id,
      name: product.name,
      url: product.url,
      store: product.store,
      category: product.category,
      price,
      imageUrl: product.image_url || null,
    });

    if (sent) {
      await markShowcased(product.id);
      console.log(`[Showcase] Postado: ${product.name}`);
    }
  } catch (err) {
    console.error('[Showcase] Erro ao postar:', err.message);
  }
}

// Planeja os posts de hoje: N horários aleatórios únicos na janela BRT.
// Reagenda a si mesmo logo após a meia-noite BRT pra planejar o dia seguinte.
function planDay() {
  const startMin = SHOWCASE_START_BRT * 60;
  const endMin   = SHOWCASE_END_BRT * 60;

  const slots = new Set();
  let guard = 0;
  while (slots.size < SHOWCASE_COUNT && guard++ < 1000) {
    slots.add(startMin + Math.floor(Math.random() * (endMin - startMin + 1)));
  }
  const sorted = [...slots].sort((a, b) => a - b);

  const now = Date.now();
  let scheduled = 0;
  const horarios = [];
  for (const min of sorted) {
    const when = brtMinuteToDate(min).getTime();
    if (when <= now) continue; // horário já passou hoje
    setTimeout(postOne, when - now);
    horarios.push(`${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`);
    scheduled++;
  }

  // Fallback: se nada foi agendado (boot tardio) mas ainda há janela hoje,
  // garante pelo menos 1 post 5-15 min depois — assim o dia não passa em
  // branco quando o Railway reinicia à noite.
  if (scheduled === 0) {
    const brtNow = new Date(now - 3 * 3600 * 1000);
    const brtNowMin = brtNow.getUTCHours() * 60 + brtNow.getUTCMinutes();
    if (brtNowMin < endMin) {
      const offsetMin = 5 + Math.floor(Math.random() * 10);
      const fallbackMin = Math.min(brtNowMin + offsetMin, endMin);
      const when = brtMinuteToDate(fallbackMin).getTime();
      setTimeout(postOne, Math.max(when - now, 1000));
      horarios.push(`${String(Math.floor(fallbackMin / 60)).padStart(2, '0')}:${String(fallbackMin % 60).padStart(2, '0')} (fallback)`);
      scheduled = 1;
    }
  }

  console.log(`[Showcase] ${scheduled} achadinho(s) hoje (BRT): ${horarios.join(', ') || '(nenhum — janela já passou)'}`);

  // Replaneja logo após a próxima meia-noite BRT
  const nextPlan = brtMinuteToDate(0).getTime() + 24 * 3600 * 1000 + 2 * 60 * 1000 - now;
  setTimeout(planDay, nextPlan);
}

function scheduleShowcase() {
  if (SHOWCASE_COUNT < 1) {
    console.warn('[Showcase] SHOWCASE_COUNT < 1 — vitrine desativada');
    return;
  }
  console.log(`[Showcase] Vitrine ativa: ${SHOWCASE_COUNT}x/dia, ${SHOWCASE_START_BRT}h-${SHOWCASE_END_BRT}h BRT, loja: ${SHOWCASE_STORE}`);
  planDay();
}

module.exports = { scheduleShowcase, postOne };
