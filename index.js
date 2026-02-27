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
  PermissionFlagsBits,
  ChannelType,
  AttachmentBuilder
} = require('discord.js');


const { montarEmbed, montarBotoes, gerarTranscript, menuPrincipal, menuConfig, menuBotoes } = require('./handlers2');
client.once(Events.ClientReady, async function(c) {
  console.log('Online: ' + c.user.tag);
  const cmds = [
    new SlashCommandBuilder()
      .setName('ticket')
      .setDescription('Gerencia paineis de ticket')
  ].map(function(x) { return x.toJSON(); });
  try {
    await new REST({ version: '10' })
      .setToken(process.env.TOKEN)
      .put(Routes.applicationCommands(c.user.id), { body: cmds });
    console.log('Comandos registrados.');
  } catch (e) { console.error(e); }
});

client.on(Events.InteractionCreate, async function(i) {

  // SLASH
  if (i.isChatInputCommand() && i.commandName === 'ticket') {
    if (!temPerm(i.member)) {
      return i.reply({ content: 'Sem permissao!', ephemeral: true });
    }
    return i.reply({
      content: '## Gerenciador de Tickets',
      components: [menuPrincipal()],
      ephemeral: true
    });
  }

  // BOTAO FECHAR TICKET
  if (i.isButton() && i.customId.startsWith('fechar_')) {
    const td = tickets.get(i.channel.id);
    const pode = temPerm(i.member) || (td && i.user.id === td.abrirPorId);
    if (!pode) return i.reply({ content: 'Sem permissao.', ephemeral: true });
    await i.reply({ content: 'Fechando ticket...' });
    try {
      const html = await gerarTranscript(i.channel, td || {});
      const att = new AttachmentBuilder(
        Buffer.from(html, 'utf-8'),
        { name: 'transcript-' + i.channel.name + '.html' }
      );
      if (td && td.logsId) {
        const lch = i.guild.channels.cache.get(td.logsId);
        if (lch) {
          const le = new EmbedBuilder()
            .setTitle('Ticket Fechado').setColor('#ff4444')
            .addFields(
              { name: 'Canal', value: '#' + i.channel.name, inline: true },
              { name: 'Aberto por', value: td.abrirPor || '?', inline: true },
              { name: 'Tipo', value: td.tipo || 'Geral', inline: true },
              { name: 'Fechado por', value: i.user.tag, inline: true }
            ).setTimestamp();
          await lch.send({ embeds: [le], files: [att] });
        }
      }
      tickets.delete(i.channel.id);
      await i.channel.delete();
    } catch (e) { console.error(e); }
    return;
  }

  // ABRIR TICKET (botoes do painel)
  if (i.isButton() && i.customId.startsWith('abrir_')) {
    const partes = i.customId.split('_');
    const pid = partes[1];
    const idx = parseInt(partes[2]);
    const painel = getPaineis(i.guild.id).get(pid);
    if (!painel) return i.reply({ content: 'Painel nao encontrado.', ephemeral: true });
    const jaAberto = Array.from(tickets.values()).find(function(t) {
      return t.abrirPorId === i.user.id && t.guildId === i.guild.id;
    });
    if (jaAberto) {
      return i.reply({ content: 'Voce ja tem ticket! <#' + jaAberto.channelId + '>', ephemeral: true });
    }
    await i.deferReply({ ephemeral: true });
    try {
      const botao = painel.botoes[idx];
      const num = getNum(i.guild.id);
      const nome = i.user.username.toLowerCase().replace(/[^a-z0-9]/g, '') + '-' + num;
      const perms = [
        { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: i.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        },
        {
          id: client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ReadMessageHistory
          ]
        }
      ];
      if (painel.cargoId) {
        perms.push({
          id: painel.cargoId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        });
      }
      const copts = { name: nome, type: ChannelType.GuildText, permissionOverwrites: perms };
      const catId = (botao && botao.categoriaId) ? botao.categoriaId : painel.categoriaId;
      if (catId) copts.parent = catId;
      const ch = await i.guild.channels.create(copts);
      const desc = 'Ola ' + i.user.toString() + '!\nAguarde a equipe responsavel lhe atender.';

      const te = new EmbedBuilder()
        .setTitle('Ticket #' + num + ' - ' + (botao ? botao.label : 'Suporte'))
        .setDescription(desc)
        .setFooter({ text: 'Aberto por ' + i.user.tag })
        .setTimestamp();
      try { if (painel.cor) te.setColor(painel.cor); } catch (_) {}
      const fb = new ButtonBuilder()
        .setCustomId('fechar_' + ch.id)
        .setLabel('Fechar Ticket')
        .setStyle(ButtonStyle.Danger);
      const mention = painel.cargoId ? '<@&' + painel.cargoId + '>' : null;
      await ch.send({ content: mention, embeds: [te], components: [new ActionRowBuilder().addComponents(fb)] });
      tickets.set(ch.id, {
        channelId: ch.id,
        guildId: i.guild.id,
        abrirPorId: i.user.id,
        abrirPor: i.user.tag,
        tipo: botao ? botao.label : 'Geral',
        logsId: painel.logsId
      });
      return i.editReply({ content: 'Ticket aberto! ' + ch.toString() });
    } catch (e) {
      console.error(e);
      return i.editReply({ content: 'Erro ao criar ticket: ' + e.message });
    }
  }

  // MENU PRINCIPAL
  if (i.isButton() && i.customId === 'tp_criar') {
    const s = novaSessao();
    sessoes.set(i.user.id, { s: s, id: null });
    return i.update({
      content: '## Criando Painel',
      embeds: [montarEmbed(s)],
      components: menuConfig()
    });
  }

  if (i.isButton() && i.customId === 'tp_editar') {
    const gp = getPaineis(i.guild.id);
    if (gp.size === 0) return i.reply({ content: 'Nenhum painel salvo.', ephemeral: true });
    const lista = Array.from(gp.entries()).map(function(e, idx) {
      return new ButtonBuilder()
        .setCustomId('tpe_' + e[0])
        .setLabel((idx + 1) + '. ' + (e[1].titulo || 'Sem titulo'))
        .setStyle(ButtonStyle.Primary);
    });
    const row = new ActionRowBuilder().addComponents(lista);
    return i.update({ content: '## Editar — escolha o painel:', embeds: [], components: [row] });
  }

  if (i.isButton() && i.customId === 'tp_excluir') {
    const gp = getPaineis(i.guild.id);
    if (gp.size === 0) return i.reply({ content: 'Nenhum painel salvo.', ephemeral: true });
    const lista = Array.from(gp.entries()).map(function(e, idx) {
      return new ButtonBuilder()
        .setCustomId('tpx_' + e[0])
        .setLabel((idx + 1) + '. ' + (e[1].titulo || 'Sem titulo'))
        .setStyle(ButtonStyle.Danger);
    });
    const row = new ActionRowBuilder().addComponents(lista);
    return i.update({ content: '## Excluir — escolha o painel:', embeds: [], components: [row] });
  }

  if (i.isButton() && i.customId.startsWith('tpe_')) {
    const pid = i.customId.replace('tpe_', '');
    const p = getPaineis(i.guild.id).get(pid);
    if (!p) return i.reply({ content: 'Nao encontrado.', ephemeral: true });
    sessoes.set(i.user.id, { s: Object.assign({}, p, { botoes: p.botoes.slice() }), id: pid });
    return i.update({
      content: '## Editando: ' + (p.titulo || '?'),
      embeds: [montarEmbed(p)],
      components: menuConfig()
    });
  }

  if (i.isButton() && i.customId.startsWith('tpx_')) {
    const pid = i.customId.replace('tpx_', '');
    const gp = getPaineis(i.guild.id);
    if (!gp.has(pid)) return i.reply({ content: 'Nao encontrado.', ephemeral: true });
    gp.delete(pid);
    return i.update({ content: 'Painel excluido!', embeds: [], components: [menuPrincipal()] });
  }

  // CONFIG PAINEL
  if (i.isButton() && i.customId === 'tc_cancelar') {
    sessoes.delete(i.user.id);
    return i.update({ content: 'Cancelado.', embeds: [], components: [menuPrincipal()] });
  }

  if (i.isButton() && i.customId === 'tc_salvar') {
    const d = sessoes.get(i.user.id);
    if (!d) return i.reply({ content: 'Sessao expirada.', ephemeral: true });
    const gp = getPaineis(i.guild.id);
    const pid = d.id || ('p_' + Date.now());
    gp.set(pid, Object.assign({}, d.s));
    sessoes.delete(i.user.id);
    return i.update({ content: 'Painel salvo!', embeds: [], components: [menuPrincipal()] });
  }

  if (i.isButton() && i.customId === 'tc_enviar') {
    const d = sessoes.get(i.user.id);
    if (!d) return i.reply({ content: 'Sessao expirada.', ephemeral: true });
    if (!d.s.botoes.length) return i.reply({ content: 'Adicione botoes antes de enviar.', ephemeral: true });
    const gp = getPaineis(i.guild.id);
    const pid = d.id || ('p_' + Date.now());
    gp.set(pid, Object.assign({}, d.s));
    const br = montarBotoes(d.s, pid);
    try {
      await i.channel.send({ embeds: [montarEmbed(d.s)], components: br ? [br] : [] });
      sessoes.delete(i.user.id);
      return i.update({ content: 'Painel enviado!', embeds: [], components: [menuPrincipal()] });
    } catch (e) {
      return i.reply({ content: 'Erro ao enviar: ' + e.message, ephemeral: true });
    }
  }

  if (i.isButton() && i.customId === 'tc_botoes') {
    const d = sessoes.get(i.user.id);
    if (!d) return i.reply({ content: 'Sessao expirada.', ephemeral: true });
    return i.update({ content: '## Gerenciar Botoes (' + d.s.botoes.length + '/5)', components: menuBotoes(d.s) });
  }

  if (i.isButton() && i.customId === 'tc_geral') {
    const d = sessoes.get(i.user.id);
    if (!d) return i.reply({ content: 'Sessao expirada.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('m_geral').setTitle('Config Gerais')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('log').setLabel('ID Canal de Logs')
            .setStyle(TextInputStyle.Short).setRequired(false).setValue(d.s.logsId || '')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('cargo').setLabel('ID do Cargo marcado')
            .setStyle(TextInputStyle.Short).setRequired(false).setValue(d.s.cargoId || '')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('cat').setLabel('ID Categoria padrao')
            .setStyle(TextInputStyle.Short).setRequired(false).setValue(d.s.categoriaId || '')
        )
      );
    return i.showModal(modal);
  }

  // Config campos texto
  const camposConfig = ['tc_titulo', 'tc_descricao', 'tc_cor', 'tc_autor', 'tc_imagem', 'tc_thumbnail', 'tc_rodape'];
  if (i.isButton() && camposConfig.includes(i.customId)) {
    const d = sessoes.get(i.user.id);
    if (!d) return i.reply({ content: 'Sessao expirada.', ephemeral: true });
    const campo = i.customId.replace('tc_', '');
    const lbls = {
      titulo: 'Titulo', descricao: 'Descricao', cor: 'Cor (#hex)',
      autor: 'Autor', imagem: 'Imagem URL', thumbnail: 'Thumbnail URL', rodape: 'Rodape'
    };
    const inp = new TextInputBuilder()
      .setCustomId('val').setLabel(lbls[campo] || campo)
      .setStyle(campo === 'descricao' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(false).setValue(d.s[campo] || '');
    return i.showModal(
      new ModalBuilder().setCustomId('m_campo_' + campo).setTitle(lbls[campo] || campo)
        .addComponents(new ActionRowBuilder().addComponents(inp))
    );
  }

  // BOTOES DO PAINEL
  if (i.isButton() && i.customId === 'tb_criar') {
    const d = sessoes.get(i.user.id);
    if (!d) return i.reply({ content: 'Sessao expirada.', ephemeral: true });
    if (d.s.botoes.length >= 5) return i.reply({ content: 'Limite de 5 botoes!', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('m_criar_botao').setTitle('Criar Botao')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('label').setLabel('Texto do botao')
            .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('emoji').setLabel('Emoji (opcional)')
            .setStyle(TextInputStyle.Short).setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('estilo').setLabel('Cor: Primary, Secondary, Success, Danger')
            .setStyle(TextInputStyle.Short).setRequired(false).setValue('Primary')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('cat').setLabel('ID da Categoria deste botao')
            .setStyle(TextInputStyle.Short).setRequired(false)
        )
      );
    return i.showModal(modal);
  }

  if (i.isButton() && i.customId === 'tb_voltar') {
    const d = sessoes.get(i.user.id);
    if (!d) return i.reply({ content: 'Sessao expirada.', ephemeral: true });
    return i.update({ content: '## Config Painel', embeds: [montarEmbed(d.s)], components: menuConfig() });
  }

  if (i.isButton() && i.customId.startsWith('tb_editar_')) {
    const d = sessoes.get(i.user.id);
    if (!d) return i.reply({ content: 'Sessao expirada.', ephemeral: true });
    const idx = parseInt(i.customId.replace('tb_editar_', ''));
    const b = d.s.botoes[idx];
    d.editBotaoIdx = idx;
    sessoes.set(i.user.id, d);
    const modal = new ModalBuilder().setCustomId('m_editar_botao').setTitle('Editar Botao')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('label').setLabel('Texto do botao')
            .setStyle(TextInputStyle.Short).setRequired(true).setValue(b.label || '')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('emoji').setLabel('Emoji (opcional)')
            .setStyle(TextInputStyle.Short).setRequired(false).setValue(b.emoji || '')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('estilo').setLabel('Cor: Primary, Secondary, Success, Danger')
            .setStyle(TextInputStyle.Short).setRequired(false).setValue(b.estilo || 'Primary')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('cat').setLabel('ID da Categoria deste botao')
            .setStyle(TextInputStyle.Short).setRequired(false).setValue(b.categoriaId || '')
        )
      );
    return i.showModal(modal);
  }

  if (i.isButton() && i.customId.startsWith('tb_remover_')) {
    const d = sessoes.get(i.user.id);
    if (!d) return i.reply({ content: 'Sessao expirada.', ephemeral: true });
    const idx = parseInt(i.customId.replace('tb_remover_', ''));
    const rem = d.s.botoes.splice(idx, 1)[0];
    sessoes.set(i.user.id, d);
    return i.update({
      content: '"' + rem.label + '" removido. (' + d.s.botoes.length + '/5)',
      components: menuBotoes(d.s)
    });
  }

  // MODALS
  if (i.isModalSubmit()) {

    if (i.customId.startsWith('m_campo_')) {
      const campo = i.customId.replace('m_campo_', '');
      const d = sessoes.get(i.user.id);
      if (!d) return i.reply({ content: 'Sessao expirada.', ephemeral: true });
      d.s[campo] = i.fields.getTextInputValue('val') || null;
      sessoes.set(i.user.id, d);
      let prev;
      try { prev = montarEmbed(d.s); } catch (_) {
        return i.reply({ content: 'Valor invalido.', ephemeral: true });
      }
      return i.update({ content: campo + ' atualizado!', embeds: [prev], components: menuConfig() });
    }

    if (i.customId === 'm_geral') {
      const d = sessoes.get(i.user.id);
      if (!d) return i.reply({ content: 'Sessao expirada.', ephemeral: true });
      d.s.logsId = i.fields.getTextInputValue('log') || null;
      d.s.cargoId = i.fields.getTextInputValue('cargo') || null;
      d.s.categoriaId = i.fields.getTextInputValue('cat') || null;
      sessoes.set(i.user.id, d);
      return i.update({ content: 'Config gerais salvas!', embeds: [montarEmbed(d.s)], components: menuConfig() });
    }

    if (i.customId === 'm_criar_botao') {
      const d = sessoes.get(i.user.id);
      if (!d) return i.reply({ content: 'Sessao expirada.', ephemeral: true });
      const estilos = ['Primary', 'Secondary', 'Success', 'Danger'];
      const estilo = i.fields.getTextInputValue('estilo').trim();
      const estiloFinal = estilos.find(function(e) {
        return e.toLowerCase() === estilo.toLowerCase();
      }) || 'Primary';
      d.s.botoes.push({
        label: i.fields.getTextInputValue('label'),
        emoji: i.fields.getTextInputValue('emoji') || null,
        estilo: estiloFinal,
        categoriaId: i.fields.getTextInputValue('cat') || null
      });
      sessoes.set(i.user.id, d);
      return i.update({
        content: 'Botao criado! (' + d.s.botoes.length + '/5)',
        components: menuBotoes(d.s)
      });
    }

    if (i.customId === 'm_editar_botao') {
      const d = sessoes.get(i.user.id);
      if (!d) return i.reply({ content: 'Sessao expirada.', ephemeral: true });
      const estilos = ['Primary', 'Secondary', 'Success', 'Danger'];
      const estilo = i.fields.getTextInputValue('estilo').trim();
      const estiloFinal = estilos.find(function(e) {
        return e.toLowerCase() === estilo.toLowerCase();
      }) || 'Primary';
      d.s.botoes[d.editBotaoIdx] = {
        label: i.fields.getTextInputValue('label'),
        emoji: i.fields.getTextInputValue('emoji') || null,
        estilo: estiloFinal,
        categoriaId: i.fields.getTextInputValue('cat') || null
      };
      sessoes.set(i.user.id, d);
      return i.update({
        content: 'Botao editado! (' + d.s.botoes.length + '/5)',
        components: menuBotoes(d.s)
      });
    }
  }
});

client.login(process.env.TOKEN);
