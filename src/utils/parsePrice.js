// Extrai um preço em BRL de uma string. Pega APENAS o primeiro padrão "X,YY"
// (ou "X.XXX,YY") para evitar concatenação quando o texto contém múltiplos
// números — caso comum quando seletor pega "R$ 99,99 12x R$ 8,33".
function parsePriceBR(raw) {
  if (!raw || typeof raw !== 'string') return null;

  // Padrão "1.234,56" ou "12,34"
  const match = raw.match(/(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})/);
  if (match) {
    const integer = match[1].replace(/\./g, '');
    const cents   = match[2];
    const price   = parseFloat(`${integer}.${cents}`);
    return isNaN(price) ? null : price;
  }

  // Fallback: número inteiro só ("R$ 99")
  const intMatch = raw.match(/(\d{1,3}(?:\.\d{3})+|\d+)(?!\d)/);
  if (intMatch) {
    const price = parseFloat(intMatch[1].replace(/\./g, ''));
    return isNaN(price) ? null : price;
  }

  return null;
}

module.exports = { parsePriceBR };
