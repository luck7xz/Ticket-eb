const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const DONOS = ['1457424883645550815', '1280969207042801755'];
const paineis = new Map();
const tickets = new Map();
const contadores = new Map();
const sessoes = new Map();

function temPerm(member) {
  return DONOS.includes(member.user.id);
}

function getPaineis(gid) {
  if (!paineis.has(gid)) paineis.set(gid, new Map());
  return paineis.get(gid);
}

function getNum(gid) {
  const n = (contadores.get(gid) || 0) + 1;
  contadores.set(gid, n);
  return String(n).padStart(4, '0');
}

function novaSessao() {
  return {
    titulo: 'Suporte',
    descricao: 'Clique em um botao para abrir seu ticket.',
    cor: '#2b2d31',
    autor: null,
    imagem: null,
    thumbnail: null,
    rodape: null,
    botoes: [],
    logsId: null,
    cargoId: null
  };
}

function montarEmbed(s) {
  const e = new EmbedBuilder();
  if (s.titulo) e.setTitle(s.titulo);
  if (s.descricao) e.setDescription(s.descricao);
  if (s.autor) e.setAuthor({ name: s.autor });
  if (s.imagem) e.setImage(s.imagem);
  if (s.thumbnail) e.setThumbnail(s.thumbnail);
  if (s.rodape) e.setFooter({ text: s.rodape });
  try { if (s.cor) e.setColor(s.cor); } catch (_) { e.setColor('#2b2d31'); }
  return e;
}

function montarBotoes(s, pid) {
  if (!s.botoes || !s.botoes.length) return null;
  const row = new ActionRowBuilder();
  s.botoes.forEach(function(b, i) {
    const btn = new ButtonBuilder()
      .setCustomId('abrir_' + pid + '_' + i)
      .setLabel(b.label)
      .setStyle(ButtonStyle[b.estilo] || ButtonStyle.Primary);
    if (b.emoji) {
      try { btn.setEmoji(b.emoji); } catch (_) {}
    }
    row.addComponents(btn);
  });
  return row;
}

async function gerarTranscript(channel, td) {
  let msgs = [];
  try {
    const f = await channel.messages.fetch({ limit: 100 });
    msgs = Array.from(f.values()).reverse();
  } catch (_) {}
  const linhas = msgs.map(function(m) {
    const t = new Date(m.createdTimestamp).toLocaleString('pt-BR');
    const c = (m.content || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return '<div class="m"><span class="t">' + t
      + '</span> <span class="a">' + m.author.tag
      + '</span>: ' + c + '</div>';
  }).join('\n');
  return '<!DOCTYPE html><html><head><meta charset="UTF-8">'
    + '<title>Transcript</title><style>'
    + 'body{background:#36393f;color:#dcddde;font-family:sans-serif;padding:20px}'
    + 'h1{color:#fff}.info{background:#2f3136;padding:10px;border-radius:8px;margin-bottom:20px}'
    + '.m{padding:4px 0;border-bottom:1px solid #2f3136;font-size:14px}'
    + '.t{color:#72767d;font-size:12px}.a{font-weight:bold;color:#7289da}'
    + '</style></head><body><h1>Transcript</h1><div class="info">'
    + '<b>Canal:</b> #' + channel.name + '<br>'
    + '<b>Aberto por:</b> ' + (td.abrirPor || '?') + '<br>'
    + '<b>Tipo:</b> ' + (td.tipo || 'Geral') + '<br>'
    + '<b>Fechado:</b> ' + new Date().toLocaleString('pt-BR')
    + '</div>' + linhas + '</body></html>';
}

function menuPrincipal() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tp_criar').setLabel('Criar Painel').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('tp_editar').setLabel('Editar Painel').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('tp_excluir').setLabel('Excluir Painel').setStyle(ButtonStyle.Danger)
  );
  return row;
}

function menuConfig() {
  const r1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tc_titulo').setLabel('Titulo').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tc_descricao').setLabel('Descricao').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tc_cor').setLabel('Cor').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tc_autor').setLabel('Autor').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tc_imagem').setLabel('Imagem').setStyle(ButtonStyle.Secondary)
  );
  const r2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tc_thumbnail').setLabel('Thumbnail').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tc_rodape').setLabel('Rodape').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tc_geral').setLabel('Config Gerais').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tc_botoes').setLabel('Botoes').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('tc_enviar').setLabel('Salvar e Enviar').setStyle(ButtonStyle.Success)
  );
  const r3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tc_salvar').setLabel('Salvar').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('tc_cancelar').setLabel('Cancelar').setStyle(ButtonStyle.Danger)
  );
  return [r1, r2, r3];
}

function menuBotoes(s) {
  const rows = [];
  const r1 = new ActionRowBuilder();
  r1.addComponents(
    new ButtonBuilder().setCustomId('tb_criar').setLabel('+ Botao').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('tb_voltar').setLabel('Voltar').setStyle(ButtonStyle.Secondary)
  );
  rows.push(r1);
  if (s.botoes && s.botoes.length > 0) {
    const r2 = new ActionRowBuilder();
    s.botoes.forEach(function(b, i) {
      r2.addComponents(
        new ButtonBuilder()
          .setCustomId('tb_editar_' + i)
          .setLabel('Editar: ' + b.label)
          .setStyle(ButtonStyle.Primary)
      );
    });
    rows.push(r2);
    const r3 = new ActionRowBuilder();
    s.botoes.forEach(function(b, i) {
      r3.addComponents(
        new ButtonBuilder()
          .setCustomId('tb_remover_' + i)
          .setLabel('Remover: ' + b.label)
          .setStyle(ButtonStyle.Danger)
      );
    });
    rows.push(r3);
  }
  return rows;
}


module.exports = { montarEmbed, montarBotoes, gerarTranscript, menuPrincipal, menuConfig, menuBotoes };
