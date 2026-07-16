import { isWhitelisted } from '../whitelist.js';
import { statements } from '../db.js';
import {
  register, raidscan, raidmanual, raidticket, raidstart, raidstats, loa,
  promorole, channels, activity, profile, whitelistCmd, ticketpanel,
  verify, vetting, boostprotect, backup, lookup,
} from '../commandRegistry.js';
import { config } from '../config.js';
import {
  TICKET_OPEN_BUTTON_ID, TICKET_MODAL_ID,
  buildVerificationModal, createTicketChannel, createRaidTicketChannel,
  runVerificationChecks, buildTicketReviewPayload, buildAwardPanel, sendTranscript,
} from '../tickets.js';
import { RAID_APPROVE_ID, RAID_REJECT_ID, RAID_EXPORT_ID, exportRaidScanCsv } from '../commands/raidscan.js';
import { RAID_MANUAL_MODAL_ID, processManualModal } from '../commands/raidmanual.js';
import { RAID_TICKET_PANEL_BUTTON_ID, RAID_TICKET_MODAL_ID } from '../commands/raidticket.js';
import { KICK_CONFIRM_ID, KICK_CANCEL_ID, kickNonReactors } from '../commands/activity.js';
import { applyPromoRoles } from '../services/promo.js';
import { buildContainer, componentsV2Payload, Colors } from '../components.js';
import { refreshMissedChannel, setGateChannel, getGateChannelId, setTranscriptChannel } from '../commands/channels.js';
import { pendingKicks } from '../pendingKicks.js';
import { pendingAwards } from '../pendingAwards.js';

function denyMessage() {
  return componentsV2Payload(
    buildContainer({ accentColor: Colors.danger, heading: 'Access Denied', lines: ['You are not whitelisted to use this bot.'] })
  );
}

async function dmMissedWarning(guild, discordId, missed, threshold) {
  try {
    const member = await guild.members.fetch(discordId).catch(() => null);
    if (!member) return;
    await member.send(
      `heads up — you've missed **${missed}** raid${missed !== 1 ? 's' : ''} and the limit is **${threshold}**.\nyou're 1 away from being flagged for removal. make sure to attend the next one.`
    ).catch(() => {});
  } catch {}
}

export default function registerInteractionHandler(client) {
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) await handleSlashCommand(interaction);
      else if (interaction.isButton()) await handleButton(interaction);
      else if (interaction.isModalSubmit()) await handleModal(interaction);
    } catch (err) {
      console.error('Interaction error:', err);
      const payload = componentsV2Payload(
        buildContainer({ accentColor: Colors.danger, heading: 'Error', lines: [`Something went wrong: ${err.message}`] })
      );
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => {});
      else await interaction.reply({ ...payload, ephemeral: true }).catch(() => {});
    }
  });
}

async function handleSlashCommand(interaction) {
  const name = interaction.commandName;

  // Open to everyone
  if (name === 'register') {
    const username = interaction.options.getString('username', true);
    await register.run({ discordId: interaction.user.id, robloxUsername: username, reply: (p) => interaction.reply(p) });
    return;
  }

  // Non-whitelisted members can view their own profile
  if (name === 'profile') {
    const target = interaction.options.getUser('member', true);
    if (!isWhitelisted(interaction.user.id) && target.id !== interaction.user.id) {
      await interaction.reply({ ...denyMessage(), ephemeral: true });
      return;
    }
    await interaction.reply(profile.buildProfilePayload(target.id));
    return;
  }

  // All other commands are staff-only
  if (!isWhitelisted(interaction.user.id)) {
    await interaction.reply({ ...denyMessage(), ephemeral: true });
    return;
  }

  if (name === 'raid_scan') {
    await interaction.deferReply();
    const attachment = interaction.options.getAttachment('video', true);
    await raidscan.runRaidScan({
      guildId: interaction.guildId, createdBy: interaction.user.id,
      videoUrl: attachment.url, videoName: attachment.name,
      reply: (p) => interaction.editReply(p), editReply: (p) => interaction.editReply(p),
    });
    return;
  }

  if (name === 'raid_groupscan') {
    await interaction.deferReply();
    const groupId = interaction.options.getInteger('group_id', true);
    await raidscan.runGroupScan({
      guildId: interaction.guildId, createdBy: interaction.user.id, groupId,
      reply: (p) => interaction.editReply(p), editReply: (p) => interaction.editReply(p),
    });
    return;
  }

  if (name === 'raid_addattendee') {
    const scanId = interaction.options.getInteger('scan_id', true);
    const user = interaction.options.getUser('user', true);
    const result = raidscan.addAttendeToScan(scanId, user.id);
    await interaction.reply(result.ok
      ? componentsV2Payload(buildContainer({ accentColor: Colors.success, heading: 'Attendee Added', lines: [`${result.username} (<@${user.id}>) marked as attended on scan #${scanId}.`] }))
      : { ...componentsV2Payload(buildContainer({ accentColor: Colors.warning, heading: 'Could Not Add Attendee', lines: [result.reason] })), ephemeral: true }
    );
    return;
  }

  if (name === 'raid_manual') {
    await interaction.showModal(raidmanual.buildRaidManualModal());
    return;
  }

  if (name === 'raid-ticket') {
    const channel = interaction.options.getChannel('channel', true);
    const { postRaidTicketPanel } = await import('../commands/raidticket.js');
    await postRaidTicketPanel(channel);
    await interaction.reply({ ...componentsV2Payload(buildContainer({ accentColor: Colors.success, heading: 'Raid Ticket Panel Posted', lines: [`Posted in <#${channel.id}>.`] })), ephemeral: true });
    return;
  }

  if (name === 'raid-start') {
    await interaction.deferReply();
    const channel = interaction.options.getChannel('channel', true);
    await raidstart.runRaidStart({
      guild: interaction.guild, channel,
      startedBy: interaction.user.id,
      reply: (p) => interaction.editReply(p),
    });
    return;
  }

  if (name === 'raidstats') {
    await interaction.reply(raidstats.buildRaidStatsPayload(interaction.guildId));
    return;
  }

  if (name === 'raidhistory') {
    await interaction.reply(raidstats.buildRaidHistoryPayload(interaction.guildId));
    return;
  }

  if (name === 'adjustpoints') {
    const user = interaction.options.getUser('member', true);
    const amount = interaction.options.getInteger('amount', true);
    await interaction.reply(raidstats.buildAdjustPointsPayload(user.id, amount));
    return;
  }

  if (name === 'setkickthreshold') {
    const threshold = interaction.options.getInteger('threshold', true);
    await interaction.reply(raidstats.buildSetKickThresholdPayload(interaction.guildId, threshold, interaction.user.id));
    return;
  }

  if (name === 'loa') {
    const user = interaction.options.getUser('member', true);
    const reason = interaction.options.getString('reason', true);
    loa.addLoa(interaction.guildId, user.id, reason, interaction.user.id);
    await interaction.reply(loa.buildLoaPayload(interaction.guildId, user.id, reason, interaction.user.id));
    return;
  }

  if (name === 'loa-end') {
    const user = interaction.options.getUser('member', true);
    loa.removeLoa(interaction.guildId, user.id);
    await interaction.reply(loa.buildLoaEndPayload(user.id));
    return;
  }

  if (name === 'check-loa') {
    await interaction.reply(loa.buildCheckLoaPayload(interaction.guildId));
    return;
  }

  if (name === 'promorole_add') {
    const points = interaction.options.getInteger('points', true);
    const role = interaction.options.getRole('role', true);
    promorole.addPromoRole(points, role.id);
    await interaction.reply(promorole.listPromoRolesPayload());
    return;
  }

  if (name === 'promorole_remove') {
    promorole.removePromoRole(interaction.options.getInteger('points', true));
    await interaction.reply(promorole.listPromoRolesPayload());
    return;
  }

  if (name === 'promorole_list') {
    await interaction.reply(promorole.listPromoRolesPayload());
    return;
  }

  if (name === 'setlogchannel') {
    const channel = interaction.options.getChannel('channel', true);
    channels.setLogChannel(interaction.guildId, channel.id);
    await interaction.reply(componentsV2Payload(buildContainer({ accentColor: Colors.success, heading: 'Log Channel Set', lines: [`Log channel set to <#${channel.id}>.`] })));
    return;
  }

  if (name === 'setmissedchannel') {
    const channel = interaction.options.getChannel('channel', true);
    channels.setMissedChannel(interaction.guildId, channel.id);
    await interaction.reply(componentsV2Payload(buildContainer({ accentColor: Colors.success, heading: 'Missed Raids Channel Set', lines: [`Missed raids channel set to <#${channel.id}>.`] })));
    await refreshMissedChannel(interaction.guild);
    return;
  }

  if (name === 'setgatechannel') {
    const channel = interaction.options.getChannel('channel', true);
    setGateChannel(interaction.guildId, channel.id);
    await interaction.reply(componentsV2Payload(buildContainer({ accentColor: Colors.success, heading: 'Gate Channel Set', lines: [`Gate channel set to <#${channel.id}>.`] })));
    return;
  }

  if (name === 'activity_check') {
    await interaction.deferReply();
    const messageLink = interaction.options.getString('message_link', true);
    const role = interaction.options.getRole('role', true);
    const { reacted, missing, csvPath } = await activity.runActivityCheck({ guild: interaction.guild, messageLink, role });
    await interaction.editReply({
      ...componentsV2Payload(buildContainer({ accentColor: Colors.info, heading: 'Activity Check', lines: [`Role: <@&${role.id}>`, `Reacted: ${reacted.length}`, `Missing: ${missing.length}`] })),
      files: [csvPath],
    });
    return;
  }

  if (name === 'kick_nonreactors') {
    await interaction.deferReply();
    const messageLink = interaction.options.getString('message_link', true);
    const role = interaction.options.getRole('role', true);
    const reason = interaction.options.getString('reason', true);
    const { missing } = await activity.runActivityCheck({ guild: interaction.guild, messageLink, role });
    const protectedRoleIds = boostprotect.getProtectedRoleIds(interaction.guildId);
    const protectedCount = missing.filter((m) => activity.isProtectedFromKick(m, interaction.guild, protectedRoleIds)).length;
    pendingKicks.set(interaction.channelId, { missing, reason, protectedRoleIds });
    await interaction.editReply(activity.buildKickConfirmPayload({ role, missing, reason, protectedCount }));
    return;
  }

  if (name === 'profileall') {
    const payloads = profile.buildProfileAllPayload();
    const list = Array.isArray(payloads) ? payloads : [payloads];
    await interaction.reply(list[0]);
    for (let i = 1; i < list.length; i++) await interaction.followUp(list[i]);
    return;
  }

  if (name === 'whitelist') {
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser('user', true);
    if (sub === 'add') await interaction.reply(whitelistCmd.handleWhitelistAdd(user.id, interaction.user.id));
    else if (sub === 'remove') await interaction.reply(whitelistCmd.handleWhitelistRemove(user.id));
    else await interaction.reply(whitelistCmd.handleWhitelistList());
    return;
  }

  if (name === 'verify') {
    const user = interaction.options.getUser('user', true);
    await interaction.reply(await verify.runVerify(interaction.guild, user.id));
    return;
  }

  if (name === 'closeticket') {
    const ticket = statements.getTicket.get(interaction.channelId);
    if (!ticket) {
      await interaction.reply({ ...componentsV2Payload(buildContainer({ accentColor: Colors.warning, heading: 'Not a Ticket', lines: ['This command can only be used inside a ticket channel.'] })), ephemeral: true });
      return;
    }
    statements.closeTicket.run(interaction.channelId);
    await interaction.reply(componentsV2Payload(buildContainer({ accentColor: Colors.neutral, heading: 'Ticket Closing', lines: ['This ticket channel will be deleted in 30 seconds.'] })));
    setTimeout(async () => {
      await sendTranscript(interaction.guild, interaction.channel, interaction.guildId);
      await interaction.channel.delete('Ticket closed by staff').catch(() => {});
    }, 30_000);
    return;
  }

  if (name === 'settranscriptchannel') {
    const channel = interaction.options.getChannel('channel', true);
    setTranscriptChannel(interaction.guildId, channel.id);
    await interaction.reply(componentsV2Payload(buildContainer({ accentColor: Colors.success, heading: 'Transcript Channel Set', lines: [`Transcripts will be saved to <#${channel.id}>.`] })));
    return;
  }

  if (name === 'vetting') {
    const sub = interaction.options.getSubcommand();
    const type = interaction.options.getString('type', true);
    if (sub === 'add') {
      await interaction.reply(vetting.handleAdd(interaction.guildId, type, interaction.options.getString('value', true), interaction.user.id));
    } else if (sub === 'remove') {
      await interaction.reply(vetting.handleRemove(interaction.guildId, type, interaction.options.getString('value', true)));
    } else {
      await interaction.reply(vetting.listPayload(interaction.guildId, type));
    }
    return;
  }

  if (name === 'boostprotect') {
    const sub = interaction.options.getSubcommand();
    const role = interaction.options.getRole('role', false);
    if (sub === 'add') await interaction.reply(boostprotect.addProtectedRole(interaction.guildId, role.id, interaction.user.id));
    else if (sub === 'remove') await interaction.reply(boostprotect.removeProtectedRole(interaction.guildId, role.id));
    else await interaction.reply(boostprotect.listProtectedRoles(interaction.guildId));
    return;
  }

  if (name === 'lookup') {
    await interaction.reply(lookup.runLookup(interaction.options.getString('username', true)));
    return;
  }

  if (name === 'backup') {
    const tmpPath = backup.runBackup();
    await interaction.reply(backup.backupPayload(tmpPath));
    return;
  }

  if (name === 'restore') {
    await interaction.deferReply();
    const attachment = interaction.options.getAttachment('file', true);
    const result = await backup.downloadAndRestore(attachment.url);
    if (!result.ok) await interaction.editReply(componentsV2Payload(buildContainer({ accentColor: Colors.danger, heading: 'Restore Failed', lines: [result.reason] })));
    else await interaction.editReply(backup.restoreSuccessPayload(result.counts));
    return;
  }

  if (name === 'ticketpanel') {
    const channel = interaction.options.getChannel('channel', true);
    await ticketpanel.postTicketPanel(channel);
    await interaction.reply({ ...componentsV2Payload(buildContainer({ accentColor: Colors.success, heading: 'Ticket Panel Posted', lines: [`Posted in <#${channel.id}>.`] })), ephemeral: true });
    return;
  }
}

async function handleButton(interaction) {
  const [action, arg] = interaction.customId.split(':');

  // Raid ticket panel button — anyone can open
  if (action === RAID_TICKET_PANEL_BUTTON_ID) {
    const existing = statements.getOpenRaidTicketByUser.get(interaction.user.id, interaction.guildId);
    if (existing) {
      await interaction.reply({ ...componentsV2Payload(buildContainer({ accentColor: Colors.warning, heading: 'Ticket Already Open', lines: [`You already have an open raid ticket at <#${existing.channel_id}>.`] })), ephemeral: true });
      return;
    }
    const { buildRaidTicketModal } = await import('../commands/raidticket.js');
    await interaction.showModal(buildRaidTicketModal());
    return;
  }

  // Verification ticket button — anyone can open
  if (action === TICKET_OPEN_BUTTON_ID) {
    await interaction.showModal(buildVerificationModal());
    return;
  }

  // Award panel buttons
  if (['award_minus', 'award_plus', 'award_yes', 'award_no'].includes(action)) {
    const proofMessageId = arg;
    const award = pendingAwards.get(proofMessageId);

    if (!award) {
      await interaction.reply({ ...componentsV2Payload(buildContainer({ accentColor: Colors.warning, heading: 'Expired', lines: ['This award panel has expired or was already processed.'] })), ephemeral: true });
      return;
    }

    if (!isWhitelisted(interaction.user.id)) {
      await interaction.reply({ ...denyMessage(), ephemeral: true });
      return;
    }

    if (action === 'award_minus') {
      award.amount = Math.max(1, award.amount - 1);
      pendingAwards.set(proofMessageId, award);
      await interaction.update(buildAwardPanel({ robloxUsername: award.robloxUsername, targetDiscordId: award.targetDiscordId, amount: award.amount, proofMessageId }));
      return;
    }

    if (action === 'award_plus') {
      award.amount = Math.min(100, award.amount + 1);
      pendingAwards.set(proofMessageId, award);
      await interaction.update(buildAwardPanel({ robloxUsername: award.robloxUsername, targetDiscordId: award.targetDiscordId, amount: award.amount, proofMessageId }));
      return;
    }

    if (action === 'award_no') {
      pendingAwards.delete(proofMessageId);
      await interaction.update(componentsV2Payload(buildContainer({ accentColor: Colors.neutral, heading: 'Dismissed', lines: ['No points were awarded.'] })));
      return;
    }

    if (action === 'award_yes') {
      pendingAwards.delete(proofMessageId);
      const { robloxUsername, targetDiscordId, amount } = award;
      const promotionLines = [];

      if (targetDiscordId) {
        statements.addPromoPoints.run(amount, targetDiscordId);
        const granted = await applyPromoRoles(interaction.guild, targetDiscordId).catch(() => []);
        for (const { roleName } of granted) promotionLines.push(`Promoted to ${roleName}`);
      }

      const lines = [
        `Awarded **${amount}** point${amount !== 1 ? 's' : ''} to ${targetDiscordId ? `<@${targetDiscordId}>` : robloxUsername}`,
        `Roblox: ${robloxUsername}`,
        `Awarded by: <@${interaction.user.id}>`,
        ...(promotionLines.length ? ['', ...promotionLines] : []),
      ];

      await interaction.update(componentsV2Payload(buildContainer({ accentColor: Colors.success, heading: 'Points Awarded', lines })));
      return;
    }
  }

  // Everything below is staff-only
  if (!isWhitelisted(interaction.user.id)) {
    await interaction.reply({ ...denyMessage(), ephemeral: true });
    return;
  }

  if (action === RAID_APPROVE_ID) {
    const scanId = Number(arg);
    const scan = statements.getRaidScan.get(scanId);
    if (!scan) return;
    statements.updateRaidScanStatus.run('approved', scanId);

    const detected = JSON.parse(scan.detected_json);
    const absentIds = JSON.parse(scan.absent_json);
    const detectedLower = detected.map((d) => d.toLowerCase());
    const allUsers = statements.allUsers.all();
    const settings = statements.getGuildSettings.get(interaction.guildId);
    const threshold = settings?.kick_threshold ?? 3;

    const attendedIds = [];
    const promotionLines = [];

    for (const user of allUsers) {
      if (detectedLower.includes(user.roblox_username.toLowerCase())) {
        statements.addPromoPoints.run(1, user.discord_id);
        statements.incrementAttended.run(user.discord_id);
        statements.resetMissed.run(user.discord_id);
        const granted = await applyPromoRoles(interaction.guild, user.discord_id);
        attendedIds.push(user.discord_id);
        for (const { roleName } of granted) promotionLines.push(`[+] Promoted <@${user.discord_id}> to ${roleName}`);
      }
    }

    for (const id of absentIds) {
      // Skip increment if user is on LOA
      const onLoa = statements.getLoa.get(id, interaction.guildId);
      if (onLoa) continue;

      statements.incrementMissed.run(id);

      // DM warning if 1 raid away from threshold
      const updated = statements.getUser.get(id);
      if (updated && updated.missed_raids === threshold - 1) {
        await dmMissedWarning(interaction.guild, id, updated.missed_raids, threshold);
      }
    }

    await refreshMissedChannel(interaction.guild);

    if (settings?.log_channel_id) {
      const logChannel = await interaction.guild.channels.fetch(settings.log_channel_id).catch(() => null);
      if (logChannel) {
        const pingText = attendedIds.length
          ? `Attendees: ${attendedIds.map((id) => `<@${id}>`).join(' ')}`
          : 'Attendees: none';
        await logChannel.send({ content: pingText });
        const summaryLines = [`Attendees: ${attendedIds.length}`, `Absent/missed: ${absentIds.length}`, ...(promotionLines.length ? ['', ...promotionLines] : [])];
        await logChannel.send(componentsV2Payload(buildContainer({ accentColor: Colors.success, heading: `Raid Scan #${scanId} Approved`, lines: summaryLines })));
      }
    }

    await interaction.reply(componentsV2Payload(buildContainer({ accentColor: Colors.success, heading: 'Attendance Approved', lines: ['Points and raid counts have been updated.'] })));
    return;
  }

  if (action === RAID_REJECT_ID) {
    const scanId = Number(arg);
    statements.updateRaidScanStatus.run('rejected', scanId);
    await interaction.reply(componentsV2Payload(buildContainer({ accentColor: Colors.danger, heading: 'Scan Rejected', lines: ['No points were awarded.'] })));
    return;
  }

  if (action === RAID_EXPORT_ID) {
    const scanId = Number(arg);
    const scan = statements.getRaidScan.get(scanId);
    if (!scan) return;
    const csvPath = exportRaidScanCsv(scan);
    await interaction.reply({ content: 'CSV export:', files: [csvPath] });
    return;
  }

  if (action === KICK_CONFIRM_ID) {
    const pending = pendingKicks.get(interaction.channelId);
    if (!pending) { await interaction.reply({ content: 'This confirmation has expired.', ephemeral: true }); return; }
    pendingKicks.delete(interaction.channelId);
    await interaction.deferUpdate();
    const { kicked, skipped } = await kickNonReactors({ guild: interaction.guild, missing: pending.missing, reason: pending.reason, protectedRoleIds: pending.protectedRoleIds ?? [] });
    await interaction.editReply(componentsV2Payload(buildContainer({ accentColor: Colors.success, heading: 'Kick Complete', lines: [`Kicked: ${kicked}`, `Skipped (protected/unkickable): ${skipped}`] })));
    return;
  }

  if (action === KICK_CANCEL_ID) {
    pendingKicks.delete(interaction.channelId);
    await interaction.update(componentsV2Payload(buildContainer({ accentColor: Colors.neutral, heading: 'Kick Cancelled', lines: ['No members were kicked.'] })));
    return;
  }
}

async function handleModal(interaction) {
  // Manual raid modal
  if (interaction.customId === RAID_MANUAL_MODAL_ID) {
    if (!isWhitelisted(interaction.user.id)) { await interaction.reply({ ...denyMessage(), ephemeral: true }); return; }
    const attendedRaw = interaction.fields.getTextInputValue('attended') || '';
    const absentRaw = interaction.fields.getTextInputValue('absent') || '';
    await interaction.deferReply();
    await processManualModal({ guildId: interaction.guildId, createdBy: interaction.user.id, attendedRaw, absentRaw, reply: (p) => interaction.editReply(p) });
    return;
  }

  // Raid ticket modal
  if (interaction.customId === RAID_TICKET_MODAL_ID) {
    const robloxUsername = interaction.fields.getTextInputValue('roblox_user').trim();
    const existingTicket = statements.getOpenRaidTicketByUser.get(interaction.user.id, interaction.guildId);
    if (existingTicket) {
      await interaction.reply({ ...componentsV2Payload(buildContainer({ accentColor: Colors.warning, heading: 'Ticket Already Open', lines: [`You already have an open raid ticket at <#${existingTicket.channel_id}>.`] })), ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const channel = await createRaidTicketChannel(interaction.guild, interaction.member, robloxUsername);
    statements.insertRaidTicketChannel.run(channel.id, interaction.guildId, interaction.user.id, robloxUsername);

    await channel.send(componentsV2Payload(buildContainer({
      accentColor: Colors.info,
      heading: 'Raid Ticket',
      lines: [
        `<@${interaction.user.id}> — thanks for opening a raid ticket.`,
        `**Roblox Username:** ${robloxUsername}`,
        '',
        'Send your proof in this channel and staff will review it.',
      ],
    }))).catch(() => {});

    await channel.send({ content: `<@${config.hardcodedWhitelistId}> — raid ticket from <@${interaction.user.id}> (${robloxUsername})` }).catch(() => {});
    await interaction.editReply(componentsV2Payload(buildContainer({ accentColor: Colors.success, heading: 'Ticket Created', lines: [`Your raid ticket: <#${channel.id}>`] })));
    return;
  }

  // Verification ticket modal
  if (interaction.customId !== TICKET_MODAL_ID) return;

  const existingTicket = statements.getOpenTicketByUser.get(interaction.user.id, interaction.guildId);
  if (existingTicket) {
    await interaction.reply({ ...componentsV2Payload(buildContainer({ accentColor: Colors.warning, heading: 'Ticket Already Open', lines: [`You already have an open ticket at <#${existingTicket.channel_id}>.`, 'Wait for a staff member to review it before opening another one.'] })), ephemeral: true });
    return;
  }

  const answers = {
    roblox_username: interaction.fields.getTextInputValue('roblox_username'),
    opposing_crews: interaction.fields.getTextInputValue('opposing_crews'),
    will_be_active: interaction.fields.getTextInputValue('will_be_active'),
    invited_by: interaction.fields.getTextInputValue('invited_by'),
  };

  await interaction.deferReply({ ephemeral: true });
  const channel = await createTicketChannel(interaction.guild, interaction.member);
  await channel.send({ content: `<@${config.hardcodedWhitelistId}> — new verification ticket from <@${interaction.user.id}>` }).catch(() => {});

  statements.insertTicket.run({ channel_id: channel.id, guild_id: interaction.guildId, user_id: interaction.user.id, answers_json: JSON.stringify(answers) });

  const verdict = await runVerificationChecks(answers, interaction.member, interaction.guildId);
  const reviewPayload = buildTicketReviewPayload({ answers, verdict, ticketChannelId: channel.id, applicantId: interaction.user.id });
  await channel.send(reviewPayload).catch((err) => console.error('Failed to post review in ticket channel:', err));

  const resolvedGateChannelId = getGateChannelId(interaction.guildId) || config.gateChannelId;
  let gateWarning = null;
  if (resolvedGateChannelId) {
    const gateChannel = await interaction.guild.channels.fetch(resolvedGateChannelId).catch(() => null);
    if (gateChannel?.isTextBased?.()) {
      await gateChannel.send(reviewPayload).catch((err) => { gateWarning = `Note: could not post to gate channel (${err.message}).`; });
    } else {
      gateWarning = 'Note: gate channel not found or not a text channel — use .setgatechannel to fix this.';
    }
  }

  const lines = [`Your ticket has been created: <#${channel.id}>`];
  if (gateWarning) lines.push(gateWarning);
  await interaction.editReply(componentsV2Payload(buildContainer({ accentColor: Colors.success, heading: 'Ticket Created', lines })));
}
