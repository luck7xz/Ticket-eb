const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  REST,
  Routes,
  SlashCommandBuilder,
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
  Collection
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration
  ]
});

const DONO_ID = '1280969207042801755';
const PREFIX = '.';

// admins por guild: guildId -> Set de userIds
const admins = new Map();
// warns por guild: guildId -> Map de userId -> array de warns
const warns = new Map();
// config de log: guildId -> channelId
const logChannels = new Map();
// sessoes de embed
const sessoesEmbed = new Map();

function getAdmins(gid) {
  if (!admins.has(gid)) admins.set(gid, new Set());
  return admins.get(gid);
}

function getWarns(gid) {
  if (!warns.has(gid)) warns.set(gid, new Map());
  return warns.get(gid);
}

function temPerm(member) {
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

async function enviarLog(guild, embed) {
  const chId = logChannels.get(guild.id);
  if (!chId) return;
  try {
    const ch = guild.channels.cache.get(chId);
    if (ch) await ch.send({ embeds: [embed] });
  } catch (_) {}
}

async function getMutedRole(guild) {
  let role = guild.roles.cache.find(function(r) { return r.name === 'Muted'; });
  if (!role) {
    role = await guild.roles.create({
      name: 'Muted',
      color: '#808080',
      permissions: []
    });
    guild.channels.cache.forEach(async function(ch) {
      try {
        await ch.permissionOverwrites.edit(role, {
          SendMessages: false,
          AddReactions: false,
          Speak: false
        });
      } catch (_) {}
    });
  }
  return role;
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

function botoesEmbed(s) {
  if (!s.botoes || !s.botoes.length) return null;
  const row = new ActionRowBuilder();
  s.botoes.forEach(function(b) {
    row.addComponents(
      new ButtonBuilder().setLabel(b.label).setStyle(ButtonStyle.Link).setURL(b.url)
    );
  });
  return row;
}

function menuEmbed() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('embed_menu')
      .setPlaceholder('Configure a embed')
      .addOptions([
        { label: 'Titulo', value: 'titulo', emoji: '📝' },
        { label: 'Descricao', value: 'descricao', emoji: '📄' },
        { label: 'Cor', value: 'cor', emoji: '🎨' },
        { label: 'Imagem', value: 'imagem', emoji: '🖼️' },
        { label: 'Thumbnail', value: 'thumbnail', emoji: '🔲' },
        { label: 'Rodape', value: 'rodape', emoji: '📋' },
        { label: 'Autor', value: 'autor', emoji: '✍️' },
        { label: 'Adicionar Botao', value: 'botao', emoji: '🔘' },
        { label: 'Remover Botao', value: 'rm_botao', emoji: '🗑️' },
        { label: 'Enviar', value: 'enviar', emoji: '✅' },
        { label: 'Cancelar', value: 'cancelar', emoji: '❌' }
      ])
  );
}

// Registro de slash commands
client.once(Events.ClientReady, async function(c) {
  console.log('Online: ' + c.user.tag);
  const cmds = [
    new SlashCommandBuilder()
      .setName('embed')
      .setDescription('Cria uma embed personalizada'),
    new SlashCommandBuilder()
      .setName('admins')
      .setDescription('Gerencia admins do bot')
      .addSubcommand(function(s) {
        return s.setName('add')
          .setDescription('Adiciona admin')
          .addUserOption(function(o) {
            return o.setName('user').setDescription('Usuario').setRequired(true);
          });
      })
      .addSubcommand(function(s) {
        return s.setName('remove')
          .setDescription('Remove admin')
          .addUserOption(function(o) {
            return o.setName('user').setDescription('Usuario').setRequired(true);
          });
      })
      .addSubcommand(function(s) {
        return s.setName('lista').setDescription('Lista admins');
      }),
    new SlashCommandBuilder()
      .setName('setlog')
      .setDescription('Define canal de logs')
      .addChannelOption(function(o) {
        return o.setName('canal').setDescription('Canal').setRequired(true);
      })
  ].map(function(x) { return x.toJSON(); });
  try {
    await new REST({ version: '10' })
      .setToken(process.env.TOKEN)
      .put(Routes.applicationCommands(c.user.id), { body: cmds });
    console.log('Comandos registrados.');
  } catch (e) { console.error(e); }
});

// Mensagens (prefixo)
client.on(Events.MessageCreate, async function(msg) {
  if (msg.author.bot) return;
  if (!msg.content.startsWith(PREFIX)) return;
  if (!msg.guild) return;

  const args = msg.content.slice(PREFIX.length).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();

  if (!temPerm(msg.member)) {
    return msg.reply({ embeds: [new EmbedBuilder().setColor('#ff4444').setDescription('Sem permissao!')] });
  }

  // BAN
  if (cmd === 'ban') {
    const alvo = msg.mentions.members.first();
    if (!alvo) return msg.reply('Use: `.ban @user motivo`');
    const motivo = args.slice(1).join(' ') || 'Sem motivo';
    try {
      await alvo.ban({ reason: motivo });
      const e = new EmbedBuilder()
        .setColor('#ff4444').setTitle('Membro Banido')
        .addFields(
          { name: 'Usuario', value: alvo.user.tag, inline: true },
          { name: 'Motivo', value: motivo, inline: true },
          { name: 'Moderador', value: msg.author.tag, inline: true }
        ).setTimestamp();
      await msg.reply({ embeds: [e] });
      await enviarLog(msg.guild, e);
    } catch (e) { msg.reply('Erro ao banir: ' + e.message); }
    return;
  }

  // KICK
  if (cmd === 'kick') {
    const alvo = msg.mentions.members.first();
    if (!alvo) return msg.reply('Use: `.kick @user motivo`');
    const motivo = args.slice(1).join(' ') || 'Sem motivo';
    try {
      await alvo.kick(motivo);
      const e = new EmbedBuilder()
        .setColor('#ff8800').setTitle('Membro Expulso')
        .addFields(
          { name: 'Usuario', value: alvo.user.tag, inline: true },
          { name: 'Motivo', value: motivo, inline: true },
          { name: 'Moderador', value: msg.author.tag, inline: true }
        ).setTimestamp();
      await msg.reply({ embeds: [e] });
      await enviarLog(msg.guild, e);
    } catch (e) { msg.reply('Erro ao expulsar: ' + e.message); }
    return;
  }

  // MUTE
  if (cmd === 'mute') {
    const alvo = msg.mentions.members.first();
    if (!alvo) return msg.reply('Use: `.mute @user tempo motivo` (tempo em minutos)');
    const tempo = parseInt(args[1]) || 0;
    const motivo = args.slice(2).join(' ') || 'Sem motivo';
    try {
      const role = await getMutedRole(msg.guild);
      await alvo.roles.add(role);
      const e = new EmbedBuilder()
        .setColor('#808080').setTitle('Membro Mutado')
        .addFields(
          { name: 'Usuario', value: alvo.user.tag, inline: true },
          { name: 'Tempo', value: tempo ? tempo + ' min' : 'Indefinido', inline: true },
          { name: 'Motivo', value: motivo, inline: true },
          { name: 'Moderador', value: msg.author.tag, inline: true }
        ).setTimestamp();
      await msg.reply({ embeds: [e] });
      await enviarLog(msg.guild, e);
      if (tempo > 0) {
        setTimeout(async function() {
          try { await alvo.roles.remove(role); } catch (_) {}
        }, tempo * 60 * 1000);
      }
    } catch (e) { msg.reply('Erro ao mutar: ' + e.message); }
    return;
  }

  // UNMUTE
  if (cmd === 'unmute') {
    const alvo = msg.mentions.members.first();
    if (!alvo) return msg.reply('Use: `.unmute @user`');
    try {
      const role = msg.guild.roles.cache.find(function(r) { return r.name === 'Muted'; });
      if (!role) return msg.reply('Cargo Muted nao encontrado.');
      await alvo.roles.remove(role);
      const e = new EmbedBuilder()
        .setColor('#00ff00').setTitle('Membro Desmutado')
        .addFields(
          { name: 'Usuario', value: alvo.user.tag, inline: true },
          { name: 'Moderador', value: msg.author.tag, inline: true }
        ).setTimestamp();
      await msg.reply({ embeds: [e] });
      await enviarLog(msg.guild, e);
    } catch (e) { msg.reply('Erro ao desmutar: ' + e.message); }
    return;
  }

  // WARN
  if (cmd === 'warn') {
    const alvo = msg.mentions.members.first();
    if (!alvo) return msg.reply('Use: `.warn @user motivo`');
    const motivo = args.slice(1).join(' ') || 'Sem motivo';
    const gw = getWarns(msg.guild.id);
    if (!gw.has(alvo.id)) gw.set(alvo.id, []);
    gw.get(alvo.id).push({ motivo: motivo, mod: msg.author.tag, data: new Date().toLocaleString('pt-BR') });
    const total = gw.get(alvo.id).length;
    const e = new EmbedBuilder()
      .setColor('#ffff00').setTitle('Aviso Aplicado')
      .addFields(
        { name: 'Usuario', value: alvo.user.tag, inline: true },
        { name: 'Avisos', value: String(total), inline: true },
        { name: 'Motivo', value: motivo, inline: true },
        { name: 'Moderador', value: msg.author.tag, inline: true }
      ).setTimestamp();
    await msg.reply({ embeds: [e] });
    await enviarLog(msg.guild, e);
    return;
  }

  // WARNINGS
  if (cmd === 'warnings') {
    const alvo = msg.mentions.members.first();
    if (!alvo) return msg.reply('Use: `.warnings @user`');
    const gw = getWarns(msg.guild.id);
    const lista = gw.get(alvo.id) || [];
    if (!lista.length) return msg.reply(alvo.user.tag + ' nao tem avisos.');
    const desc = lista.map(function(w, i) {
      return '**' + (i + 1) + '.** ' + w.motivo + ' — ' + w.mod + ' (' + w.data + ')';
    }).join('\n');
    const e = new EmbedBuilder()
      .setColor('#ffff00')
      .setTitle('Avisos de ' + alvo.user.tag)
      .setDescription(desc);
    return msg.reply({ embeds: [e] });
  }

  // CLEARWARNS
  if (cmd === 'clearwarns') {
    const alvo = msg.mentions.members.first();
    if (!alvo) return msg.reply('Use: `.clearwarns @user`');
    const gw = getWarns(msg.guild.id);
    gw.set(alvo.id, []);
    return msg.reply('Avisos de ' + alvo.user.tag + ' limpos!');
  }

  // CLEAR
  if (cmd === 'clear') {
    const qtd = parseInt(args[0]);
    if (!qtd || qtd < 1 || qtd > 100) return msg.reply('Use: `.clear 1-100`');
    try {
      await msg.delete();
      await msg.channel.bulkDelete(qtd, true);
      const m = await msg.channel.send(qtd + ' mensagens deletadas!');
      setTimeout(function() { m.delete().catch(function() {}); }, 3000);
    } catch (e) { msg.reply('Erro: ' + e.message); }
    return;
  }
});

// Slash commands e interacoes
client.on(Events.InteractionCreate, async function(i) {

  // /admins
  if (i.isChatInputCommand() && i.commandName === 'admins') {
    if (i.user.id !== DONO_ID) {
      return i.reply({ content: 'Apenas o dono pode usar esse comando!', ephemeral: true });
    }
    const sub = i.options.getSubcommand();
    const a = getAdmins(i.guild.id);
    if (sub === 'add') {
      const u = i.options.getUser('user');
      a.add(u.id);
      return i.reply({ content: u.tag + ' adicionado como admin!', ephemeral: true });
    }
    if (sub === 'remove') {
      const u = i.options.getUser('user');
      a.delete(u.id);
      return i.reply({ content: u.tag + ' removido dos admins!', ephemeral: true });
    }
    if (sub === 'lista') {
      if (!a.size) return i.reply({ content: 'Nenhum admin cadastrado.', ephemeral: true });
      const lista = Array.from(a).map(function(id) { return '<@' + id + '>'; }).join('\n');
      return i.reply({ content: '**Admins do bot:**\n' + lista, ephemeral: true });
    }
  }

  // /setlog
  if (i.isChatInputCommand() && i.commandName === 'setlog') {
    if (!temPerm(i.member)) {
      return i.reply({ content: 'Sem permissao!', ephemeral: true });
    }
    const ch = i.options.getChannel('canal');
    logChannels.set(i.guild.id, ch.id);
    return i.reply({ content: 'Canal de logs definido: ' + ch.toString(), ephemeral: true });
  }

  // /embed
  if (i.isChatInputCommand() && i.commandName === 'embed') {
    if (!temPerm(i.member)) {
      return i.reply({ content: 'Sem permissao!', ephemeral: true });
    }
    sessoesEmbed.set(i.user.id, {
      titulo: null, descricao: null, cor: '#2b2d31',
      imagem: null, thumbnail: null, rodape: null,
      autor: null, botoes: []
    });
    const prev = new EmbedBuilder()
      .setTitle('Criador de Embed')
      .setDescription('Use o menu abaixo para configurar.')
      .setColor('#2b2d31');
    return i.reply({
      content: '## Configurador de Embed',
      embeds: [prev],
      components: [menuEmbed()],
      ephemeral: true
    });
  }

  // Menu embed
  if (i.isStringSelectMenu() && i.customId === 'embed_menu') {
    const v = i.values[0];
    const s = sessoesEmbed.get(i.user.id);
    if (!s) return i.reply({ content: 'Sessao expirada.', ephemeral: true });

    if (v === 'cancelar') {
      sessoesEmbed.delete(i.user.id);
      return i.update({ content: 'Cancelado.', embeds: [], components: [] });
    }
    if (v === 'rm_botao') {
      if (!s.botoes.length) return i.reply({ content: 'Sem botoes.', ephemeral: true });
      s.botoes.pop();
      sessoesEmbed.set(i.user.id, s);
      const br = botoesEmbed(s);
      const comps = [menuEmbed()];
      if (br) comps.push(br);
      return i.update({ content: 'Botao removido.', embeds: [montarEmbed(s)], components: comps });
    }
    if (v === 'enviar') {
      const br = botoesEmbed(s);
      try {
        await i.channel.send({ embeds: [montarEmbed(s)], components: br ? [br] : [] });
        sessoesEmbed.delete(i.user.id);
        return i.update({ content: 'Embed enviada!', embeds: [], components: [] });
      } catch (e) { return i.reply({ content: 'Erro ao enviar.', ephemeral: true }); }
    }
    if (v === 'botao') {
      if (s.botoes.length >= 5) return i.reply({ content: 'Limite 5 botoes!', ephemeral: true });
      const modal = new ModalBuilder().setCustomId('em_botao').setTitle('Adicionar Botao')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('lbl').setLabel('Texto do botao')
              .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('url').setLabel('URL')
              .setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('https://...')
          )
        );
      return i.showModal(modal);
    }
    const lbls = {
      titulo: 'Titulo', descricao: 'Descricao', cor: 'Cor (#hex)',
      imagem: 'Imagem URL', thumbnail: 'Thumbnail URL', rodape: 'Rodape', autor: 'Autor'
    };
    const inp = new TextInputBuilder()
      .setCustomId('val').setLabel(lbls[v] || v)
      .setStyle(v === 'descricao' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(false).setValue(s[v] || '');
    const modal = new ModalBuilder()
      .setCustomId('em_campo_' + v).setTitle(lbls[v] || v)
      .addComponents(new ActionRowBuilder().addComponents(inp));
    return i.showModal(modal);
  }

  // Modals embed
  if (i.isModalSubmit()) {
    if (i.customId.startsWith('em_campo_')) {
      const campo = i.customId.replace('em_campo_', '');
      const s = sessoesEmbed.get(i.user.id);
      if (!s) return i.reply({ content: 'Sessao expirada.', ephemeral: true });
      s[campo] = i.fields.getTextInputValue('val') || null;
      sessoesEmbed.set(i.user.id, s);
      let prev;
      try { prev = montarEmbed(s); } catch (_) {
        return i.reply({ content: 'Valor invalido.', ephemeral: true });
      }
      const br = botoesEmbed(s);
      const comps = [menuEmbed()];
      if (br) comps.push(br);
      return i.update({ content: campo + ' atualizado!', embeds: [prev], components: comps });
    }
    if (i.customId === 'em_botao') {
      const s = sessoesEmbed.get(i.user.id);
      if (!s) return i.reply({ content: 'Sessao expirada.', ephemeral: true });
      const url = i.fields.getTextInputValue('url');
      if (!url.startsWith('http')) return i.reply({ content: 'URL invalida.', ephemeral: true });
      s.botoes.push({ label: i.fields.getTextInputValue('lbl'), url: url });
      sessoesEmbed.set(i.user.id, s);
      const br = botoesEmbed(s);
      const comps = [menuEmbed()];
      if (br) comps.push(br);
      return i.update({
        content: 'Botao adicionado! (' + s.botoes.length + '/5)',
        embeds: [montarEmbed(s)],
        components: comps
      });
    }
  }
});

client.login(process.env.TOKEN);
