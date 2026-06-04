// Inferência de categoria a partir do NOME do produto (palavras-chave).
// Usada pra auto-cadastrar ofertas do ML na categoria certa.
//
// IMPORTANTE: retorna SOMENTE categorias canônicas que já existem no banco e
// têm tópico no grupo (via topicRouter). Inventar categoria nova não adianta —
// ela cairia no "geral" do roteamento. Categorias canônicas:
//   eletronicos, casa, hardware, beleza, calcados, vestuario,
//   smartphones, acessorios, audio, perfumaria
// Qualquer coisa fora disso → 'geral' (não será postada pelo mlDeals, que só
// posta nas categorias-foco).
//
// Mapeamento de conceitos amplos → categoria canônica:
//   cozinha/eletrodoméstico/limpeza/cama-mesa-banho/móveis → casa
//   suplemento/perfume/skincare/maquiagem                  → beleza/perfumaria
//   tv/tablet/smartwatch/câmera/console                    → eletronicos
//   notebook/monitor/ssd/placa/mouse/teclado               → hardware
//   tênis/sandália/bota                                    → calcados
//   roupa                                                  → vestuario
//   fone/caixa de som                                      → audio
//
// Ordem importa: regra mais específica primeiro. Primeiro match vence.
const RULES = [
  // perfumaria (antes de beleza — perfume é subcaso mais específico)
  ['perfumaria', ['perfume', 'eau de parfum', 'eau de toilette', 'eau de cologne', 'eau forte', ' edt ', ' edp ', 'colônia', 'colonia', 'body spray', 'body mist', 'deo colônia', 'deo colonia', 'parfum', 'coffret', 'fragrância', 'fragrancia',
    // linhas/marcas de perfume famosas (pegam nomes sem a palavra "perfume")
    'la vie est belle', 'sol de janeiro', 'sauvage', 'good girl', 'bad boy', '212 vip', 'le male', '1 million', 'club de nuit', 'acqua di gio', 'la nuit', 'invictus', 'phantom']],

  // áudio
  ['audio', ['fone de ouvido', 'fone bluetooth', 'fone sem fio', ' fone ', 'headset', 'headphone', 'earbud', 'earphone', 'caixa de som', 'soundbar', 'home theater', 'airpods', 'speaker bluetooth', 'galaxy buds', 'redmi buds', 'jbl', 'bose', 'soundcore', ' qcy ', 'wireless earphone', 'tws']],

  // TV — ANTES de hardware (nome de TV costuma ter "processador"/"monitor" que
  // a regra de hardware capturaria por engano). TV é sempre eletronicos.
  ['eletronicos', ['smart tv', 'smart-tv', 'smarttv', ' tv ', 'televisão', 'televisao', 'tv led', 'tv qled', 'tv oled', 'tv 4k', 'google tv', 'roku tv']],

  // hardware / informática (componentes e periféricos)
  ['hardware', ['notebook', 'laptop', 'ultrabook', 'macbook', 'chromebook', 'ideapad', 'thinkpad', 'inspiron', 'vivobook',
    'monitor', 'ultrawide',
    'ssd', 'hd externo', 'hd interno', 'hdd', 'memória ram', 'memoria ram', 'placa de vídeo', 'placa de video', 'processador', 'placa-mãe', 'placa mae', 'placa mãe', 'fonte atx', 'cooler', 'water cooler', 'gabinete', 'rtx', 'ryzen', 'geforce', 'radeon', 'intel core',
    'mouse', 'teclado', 'mousepad', 'webcam', 'cadeira gamer', 'headset gamer', 'hub usb', 'pen drive', 'pendrive', 'cartão de memória', 'cartao de memoria', 'roteador', 'nobreak', 'impressora']],

  // smartphones (celular e acessórios diretos)
  ['smartphones', ['smartphone', 'celular', 'iphone', 'galaxy s', 'galaxy a', 'galaxy m', 'redmi', 'poco ', 'moto g', 'moto e', 'motorola edge', 'xiaomi', 'realme', 'zenfone', 'galaxy z']],

  // calçados
  ['calcados', ['tênis', 'tenis', 'sapatênis', 'sapatenis', 'chuteira', 'sandália', 'sandalia', 'chinelo', 'sapato', ' bota ', 'sapatilha', 'mocassim', 'crocs', 'papete']],

  // vestuário (roupas — sem distinção de gênero aqui; inferGender cuida disso)
  ['vestuario', ['camiseta', 'camisa ', 'blusa', 'vestido', 'saia', 'calça', 'calca', 'bermuda', 'short', 'jaqueta', 'blazer', 'moletom', 'casaco', 'cueca', 'calcinha', 'sutiã', 'sutia', 'legging', 'biquíni', 'biquini', 'maiô', 'pijama', 'meia', 'jeans']],

  // acessórios
  ['acessorios', ['mochila', 'bolsa', 'carteira', 'óculos de sol', 'oculos de sol', 'relógio de pulso', 'relogio de pulso', 'cinto', 'boné', 'bone ', 'mala de viagem', 'necessaire']],

  // beleza (maquiagem, skincare, cabelo, suplementos de beleza/saúde)
  ['beleza', ['batom', 'maquiagem', 'base líquida', 'base liquida', 'corretivo', 'rímel', 'rimel', 'máscara de cílios', 'mascara de cilios', 'esmalte', 'shampoo', 'condicionador', 'hidratante', 'protetor solar', 'sérum', 'serum', 'creme facial', 'creme anti', 'ácido hialurônico', 'acido hialuronico', 'skincare', 'pó compacto', 'po compacto', 'paleta de sombra', 'sombra', 'gloss', 'delineador', 'barbeador', 'lâmina de barbear', 'lamina de barbear', 'aparador de pelos', 'secador de cabelo', 'chapinha', 'prancha de cabelo', 'escova alisadora',
    'creatina', 'whey', 'bcaa', 'glutamina', 'albumina', 'proteína', 'proteina', 'pré-treino', 'pre-treino', 'colágeno', 'colageno', 'termogênico', 'termogenico', 'vitamina', 'ômega 3', 'omega 3', 'multivitamínico', 'multivitaminico']],

  // eletrônicos (TVs, tablets, wearables, câmeras, consoles, casa-conectada)
  ['eletronicos', ['smart tv', 'smarttv', 'televisão', 'televisao', 'tv led', 'tv qled', 'tv oled', '4k uhd', 'smart watch', 'smartwatch', 'relógio inteligente', 'relogio inteligente', 'pulseira inteligente', 'smart band', 'tablet', 'kindle', 'e-reader', 'echo dot', 'alexa', 'chromecast', 'fire tv', 'tv box', 'carregador', 'power bank', 'powerbank', 'câmera', 'camera', 'gopro', 'drone', 'projetor', 'caixa de som jbl',
    'playstation', 'ps5', 'ps4', 'xbox', 'nintendo switch', 'console', 'controle sem fio',
    'fralda', 'cafeteira nespresso']],

  // casa (eletrodomésticos, cozinha, limpeza, cama-mesa-banho, móveis, clima)
  ['casa', ['air fryer', 'airfryer', 'fritadeira', 'panela', 'frigideira', 'liquidificador', 'batedeira', 'cafeteira', 'mixer', 'processador de alimentos', 'micro-ondas', 'microondas', 'forno', 'sanduicheira', 'grill', 'faqueiro', 'talheres', 'jogo de copos', 'jarra',
    'aspirador', 'ventilador', 'umidificador', 'purificador', 'climatizador', 'ar condicionado', 'ar-condicionado',
    'jogo de toalhas', 'toalha de banho', 'lençol', 'lencol', 'jogo de cama', 'edredom', 'cobertor', 'travesseiro', 'colchão', 'colchao', 'almofada',
    'luminária', 'luminaria', 'lâmpada', 'lampada', 'abajur', 'organizador', 'cortina', 'tapete', 'guarda-roupa', 'guarda roupa', 'estante', 'rack', 'cadeira de escritório', 'cadeira de escritorio', 'mesa ',
    'ferro de passar', 'máquina de lavar', 'maquina de lavar', 'lavadora', 'lava e seca', 'geladeira', 'refrigerador', 'fogão', 'fogao', 'cooktop', 'depurador', 'coifa', 'freezer', 'lava-louças', 'lava loucas',
    'detergente', 'amaciante', 'sabão', 'sabao', 'desinfetante']],
];

function inferCategory(name = '') {
  // Normaliza: minúsculas + espaços nas bordas pra casar regras com " bota "
  const text = ` ${String(name).toLowerCase()} `;

  // Override de prioridade: nome que COMEÇA com indicador de celular é
  // smartphone, mesmo que tenha "ssd"/"ram"/"processador" no meio (ML às vezes
  // enche o título do celular com specs que cairiam em hardware).
  if (/^\s*(smartphone|celular|iphone|smartphone gamer)\b/i.test(name)) {
    return 'smartphones';
  }

  for (const [category, keywords] of RULES) {
    if (keywords.some((k) => text.includes(k))) return category;
  }
  return 'geral';
}

module.exports = { inferCategory };
