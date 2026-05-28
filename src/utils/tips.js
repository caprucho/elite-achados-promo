// Dicas rotativas adicionadas ao final das mensagens automáticas do canal.
// Rotação round-robin: cada chamada pega a próxima da lista (não aleatório),
// pra garantir que TODAS as dicas circulem antes de repetir. Índice inicial
// é random pra não começar sempre na primeira após restart.

// Strip qualquer "@" líder — usado em texto como @nome (o `@` é adicionado manualmente)
const BOT_USERNAME = (process.env.TELEGRAM_BOT_USERNAME || 'Elite_Achados_PromoBOT').replace(/^@/, '');

// Dicas — sempre que mencionar comando, incluir o @bot pra deixar claro
// que o user precisa enviar no privado do bot (não no grupo).
const BOT = `@${BOT_USERNAME}`;

const TIPS = [
  `🔔 Ative as notificações do grupo pra ser o primeiro a ver as ofertas`,
  `📌 Fixe o grupo no topo do Telegram pra não perder nada`,
  `🎯 Silencie tópicos que não interessam (toque no nome do tópico → Mute)`,
  `💎 Toque em "💎 Monitorar produto" nos cards pra receber DM desse item no seu privado`,
  `📦 Envie /addproduto <link> para ${BOT} e ele monitora pra você`,
  `🎯 Use /avisar <id> <preço> no ${BOT} — só te avisa quando bater o preço-alvo`,
  `📊 Envie /preco <id> para ${BOT} pra ver mínimo histórico, máximo e média`,
  `📋 Liste seus produtos com /meusprodutos no ${BOT}`,
  `🤝 Envie /convidar para ${BOT} e ganhe +1 slot por amigo cadastrado`,
  `📤 O botão "Compartilhar" gera link com SEU ref — cada amigo cadastrado = +1 slot`,
  `💡 Achou uma oferta? Envie /sugerir <link> para ${BOT} que eu avalio`,
  `🏆 TOP da semana sai todo domingo 16h — fique de olho`,
  `🎟️ Cupons KaBuM saem 13h e 19h todo dia`,
  `🛒 Monitoro 15+ lojas — envie /lojas para ${BOT} pra ver a lista completa`,
  `ℹ️ Envie /help para ${BOT} pra ver o guia completo`,
];

let idx = Math.floor(Math.random() * TIPS.length);

function nextTip() {
  const t = TIPS[idx];
  idx = (idx + 1) % TIPS.length;
  return t;
}

module.exports = { nextTip };
