const { newPage } = require('./browser');

async function scrape(url) {
  let page;
  try {
    page = await newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // Aguarda o preço renderizar (catálogo e página de produto usam o mesmo componente)
    await page.waitForSelector('.andes-money-amount__fraction', { timeout: 10000 });

    const fraction = await page.$eval(
      '.ui-pdp-price .andes-money-amount__fraction, .andes-money-amount__fraction',
      (el) => el.textContent.trim()
    );

    const cents = await page.$eval(
      '.ui-pdp-price .andes-money-amount__cents, .andes-money-amount__cents',
      (el) => el.textContent.trim()
    ).catch(() => '00');

    // "1.299" → "1299", depois "1299" + ".90" → 1299.90
    const cleanFraction = fraction.replace(/\./g, '').replace(',', '');
    const price = parseFloat(`${cleanFraction}.${cents || '00'}`);

    if (isNaN(price)) {
      console.warn('[MercadoLivre] Preço não é número válido:', raw);
      return null;
    }

    const imageUrl = await page.$eval('meta[property="og:image"]', (el) => el.getAttribute('content')).catch(() => null);
    const name = await page.$eval('meta[property="og:title"]', (el) => el.getAttribute('content')).catch(() => null)
      || await page.title().catch(() => null);

    return { price, imageUrl, name };
  } catch (err) {
    console.error('[MercadoLivre] Erro ao raspar:', err.message);
    return null;
  } finally {
    if (page) await page.close();
  }
}

module.exports = { scrape };
