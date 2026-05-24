// Dicas rotativas adicionadas ao final das mensagens automáticas do canal.
// Rotação round-robin: cada chamada pega a próxima da lista (não aleatório),
// pra garantir que TODAS as dicas circulem antes de repetir. Índice inicial
// é random pra não começar sempre na primeira após restart.

// Strip qualquer "@" líder — usado em texto como @nome (o `@` é adicionado manualmente)
const BOT_USERNAME = (process.env.TELEGRAM_BOT_USERNAME || 'Elite_Achados_PromoBOT').replace(/^@/, '');

const TIPS = [
  `🔔 Ative as notificações do grupo pra ser o primeiro a ver as ofertas`,
  `📌 Fixe o grupo no topo do Telegram pra não perder nada`,
  `🎯 Silencie tópicos que não interessam (toque no nome → Mute)`,
  `💎 Toque em "💎 Monitorar produto" pra receber alerta desse item no privado`,
  `📦 Quer monitorar SEU produto? /addproduto no @${BOT_USERNAME}`,
  `🎯 Define um preço-alvo com /avisar <id> <preço> — só te aviso quando bater`,
  `📊 Veja o histórico de qualquer produto com /preco <id>`,
  `📋 Liste seus produtos com /meusprodutos`,
  `🤝 Indique amigos e ganhe slots extras — /convidar pega seu link`,
  `📤 O botão "Compartilhar" gera link com SEU ref — cada amigo = +1 slot`,
  `💡 Achou uma oferta? Manda pra mim com /sugerir <link>`,
  `🏆 TOP da semana sai todo domingo 16h — fique de olho`,
  `🎟️ Cupons KaBuM saem 13h e 19h todo dia`,
  `🛒 Monitoro 15+ lojas — veja todas em /lojas`,
  `ℹ️ /help mostra o guia completo do bot`,
];

let idx = Math.floor(Math.random() * TIPS.length);

function nextTip() {
  const t = TIPS[idx];
  idx = (idx + 1) % TIPS.length;
  return t;
}

module.exports = { nextTip };
