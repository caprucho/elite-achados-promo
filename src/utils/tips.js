// Dicas rotativas adicionadas ao final das mensagens automáticas do canal.
// Rotação round-robin: cada chamada pega a próxima da lista (não aleatório),
// pra garantir que TODAS as dicas circulem antes de repetir. Índice inicial
// é random pra não começar sempre na primeira após restart.

// Strip qualquer "@" líder — usado em texto como @nome (o `@` é adicionado manualmente)
const BOT_USERNAME = (process.env.TELEGRAM_BOT_USERNAME || 'Elite_Achados_PromoBOT').replace(/^@/, '');

const TIPS = [
  `🔔 Ative as notificações do canal pra ser o primeiro a ver as ofertas`,
  `📌 Fixe o canal no topo do Telegram pra não perder nada`,
  `💎 Quer alerta no SEU produto? /addproduto no @${BOT_USERNAME}`,
  `🤝 Indique 1 amigo e ganhe +1 slot extra (/convidar)`,
  `💡 Encontrou uma oferta? Manda pra mim com /sugerir <link>`,
  `📋 Veja seus produtos cadastrados com /meusprodutos`,
  `🏆 TOP da semana sai todo domingo 16h — fique de olho`,
  `🎟️ Cupons KaBuM saem 13h e 19h todo dia`,
  `🛒 Monitoro 14+ lojas — veja todas em /lojas`,
];

let idx = Math.floor(Math.random() * TIPS.length);

function nextTip() {
  const t = TIPS[idx];
  idx = (idx + 1) % TIPS.length;
  return t;
}

module.exports = { nextTip };
