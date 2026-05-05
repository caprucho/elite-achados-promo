const { newPage } = require('./browser');
const { parsePriceBR } = require('../utils/parsePrice');

async function scrape(url) {
  let page;
  try {
    page = await newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForSelector('.a-price .a-offscreen', { timeout: 8000 });

    const raw = await page.$eval('.a-price .a-offscreen', (el) => el.textContent.trim());

    if (!raw) {
      console.warn('[Amazon] Seletor de preço não encontrou valor em:', url);
      return null;
    }

    const price = parsePriceBR(raw);
    if (!price) {
      console.warn('[Amazon] Preço extraído não é um número válido:', raw);
      return null;
    }

    const imageUrl = await page.$eval('meta[property="og:image"]', (el) => el.getAttribute('content')).catch(() => null);
    const name = await page.$eval('meta[property="og:title"]', (el) => el.getAttribute('content')).catch(() => null)
      || await page.title().catch(() => null);

    return { price, imageUrl, name };
  } catch (err) {
    console.error('[Amazon] Erro ao raspar:', err.message);
    return null;
  } finally {
    if (page) await page.close();
  }
}

module.exports = { scrape };
