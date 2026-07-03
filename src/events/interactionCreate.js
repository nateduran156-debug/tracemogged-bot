import { isWhitelisted } from '../whitelist.js';
import { statements } from '../db.js';
import {
  register,
  raidscan,
  promorole,
  channels,
  activity,
  profile,
  whitelistCmd,
  ticketpanel,
  verify,
  vetting,
} from '../commandRegistry.js';
import { config } from '../config.js';
import {
  TICKET_OPEN_BUTTON_ID,
  TICKET_MODAL_ID,
  buildVerificationModal,
  createTicketChannel,
  runVerificationChecks,
  buildTicketReviewPayload,
  sendTranscript,
} from '../tickets.js';
import { RAID_APPROVE_ID, RAID_REJECT_ID, RAID_EXPORT_ID, exportRaidScanCsv } from '../commands/raidscan.js';
import { KICK_CONFIRM_ID, KICK_CANCEL_ID, kickNonReactors, isProtectedFromKick } from '../commands/activity.js';
import { applyPromoRoles } from '../services/promo.js';
import { buildContainer, componentsV2Payload, Colors } from '../components.js';
import { refreshMissedChannel, setGateChannel, getGateChannelId, setTranscriptChannel } from '../commands/channels.js';
import { pendingKicks } from '../pendingKicks.js';

function denyMessage() {
  return componentsV2Payload(
    buildContainer({
      accentColor: Colors.danger,
      heading: 'Access Denied',
      lines: ['You are not whitelisted to use this bot.'],
    })
  );
}

export default function registerInteractionHandler(client) {
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        await handleSlashCommand(interaction);
      } else if (interaction.isButton()) {
        await handleButton(interaction);
      } else if (interaction.isModalSubmit()) {
        await handleModal(interaction);
      }
    } catch (err) {
      console.error('Interaction error:', err);
      const payload = componentsV2Payload(
        buildContainer({
          accentColor: Colors.danger,
          heading: 'Error',
          lines: [`Something went wrong: ${err.message}`],
        })
      );
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload).catch(() => {});
      } else {
        await interaction.reply({ ...payload, ephemeral: true }).catch(() => {});
      }
    }
  });
}

async function handleSlashCommand(interaction) {
  const name = interaction.commandName;

  // /register is open to everyone — members need it to link their Roblox account.
  if (name === 'register') {
    const username = interaction.options.getString('username', true);
    await register.run({
      discordId: interaction.user.id,
      robloxUsername: username,
      reply: (payload) => interaction.reply(payload),
    });
    return;
  }

  // All other commands are staff-only.
  if (!isWhitelisted(interaction.user.id)) {
    await interaction.reply({ ...denyMessage(), ephemeral: true });
    return;
  }

  if (name === 'raid_scan') {
    await interaction.deferReply();
    const attachment = interaction.options.getAttachment('video', true);
    await raidscan.runRaidScan({
      guildId: interaction.guildId,
      createdBy: interaction.user.id,
      videoUrl: attachment.url,
      videoName: attachment.name,
      reply: (payload) => interaction.editReply(payload),
      editReply: (payload) => interaction.editReply(payload),
    });
    return;
  }

  if (name === 'raid_groupscan') {
    await interaction.deferReply();
    const groupId = interaction.options.getInteger('group_id', true);
    await raidscan.runGroupScan({
      guildId: interaction.guildId,
      createdBy: interaction.user.id,
      groupId,
      reply: (payload) => interaction.editReply(payload),
      editReply: (payload) => interaction.editReply(payload),
    });
    return;
  }

  if (name === 'raid_addattendee') {
    const scanId = interaction.options.getInteger('scan_id', true);
    const user = interaction.options.getUser('user', true);
    const result = raidscan.addAttendeToScan(scanId, user.id);
    if (!result.ok) {
      await interaction.reply({
        ...componentsV2Payload(buildContainer({ accentColor: Colors.warning, heading: 'Could Not Add Attendee', lines: [result.reason] })),
        ephemeral: true,
      });
    } else {
      await interaction.reply(
        componentsV2Payload(buildContainer({
          accentColor: Colors.success,
          heading: 'Attendee Added',
          lines: [`${result.username} (<@${user.id}>) has been marked as attended on scan #${scanId}.`],
        }))
      );
    }
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
    const points = interaction.options.getInteger('points', true);
    promorole.removePromoRole(points);
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
    await interaction.reply(
      componentsV2Payload(
        buildContainer({ accentColor: Colors.success, heading: 'Log Channel Set', lines: [`Log channel set to <#${channel.id}>.`] })
      )
    );
    return;
  }

  if (name === 'setmissedchannel') {
    const channel = interaction.options.getChannel('channel', true);
    channels.setMissedChannel(interaction.guildId, channel.id);
    await interaction.reply(
      componentsV2Payload(
        buildContainer({ accentColor: Colors.success, heading: 'Missed Raids Channel Set', lines: [`Missed raids channel set to <#${channel.id}>.`] })
      )
    );
    await refreshMissedChannel(interaction.guild);
    return;
  }

  if (name === 'setgatechannel') {
    const channel = interaction.options.getChannel('channel', true);
    setGateChannel(interaction.guildId, channel.id);
    await interaction.reply(
      componentsV2Payload(
        buildContainer({ accentColor: Colors.success, heading: 'Gate Channel Set', lines: [`Gate channel set to <#${channel.id}>. Verification applications will now be posted there.`] })
      )
    );
    return;
  }

  if (name === 'activity_check') {
    await interaction.deferReply();
    const messageLink = interaction.options.getString('message_link', true);
    const role = interaction.options.getRole('role', true);
    const { reacted, missing, csvPath } = await activity.runActivityCheck({
      guild: interaction.guild,
      messageLink,
      role,
    });
    await interaction.editReply({
      ...componentsV2Payload(
        buildContainer({
          accentColor: Colors.info,
          heading: 'Activity Check',
          lines: [
            `Role: <@&${role.id}>`,
            `Reacted: ${reacted.length}`,
            `Missing: ${missing.length}`,
          ],
        })
      ),
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

    const protectedCount = missing.filter((m) => isProtectedFromKick(m, interaction.guild)).length;

    pendingKicks.set(interaction.channelId, { missing, reason });

    await interaction.editReply(
      activity.buildKickConfirmPayload({ role, missing, reason, protectedCount })
    );
    return;
  }

  if (name === 'profile') {
    const member = interaction.options.getUser('member', true);
    await interaction.reply(profile.buildProfilePayload(member.id));
    return;
  }

  if (name === 'profileall') {
    const payloads = profile.buildProfileAllPayload();
    const list = Array.isArray(payloads) ? payloads : [payloads];
    await interaction.reply(list[0]);
    for (let i = 1; i < list.length; i++) {
      await interaction.followUp(list[i]);
    }
    return;
  }

  if (name === 'whitelist') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'add') {
      const user = interaction.options.getUser('user', true);
      await interaction.reply(whitelistCmd.handleWhitelistAdd(user.id, interaction.user.id));
    } else if (sub === 'remove') {
      const user = interaction.options.getUser('user', true);
      await interaction.reply(whitelistCmd.handleWhitelistRemove(user.id));
    } else {
      await interaction.reply(whitelistCmd.handleWhitelistList());
    }
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
      await interaction.reply({
        ...componentsV2Payload(
          buildContainer({ accentColor: Colors.warning, heading: 'Not a Ticket', lines: ['This command can only be used inside a ticket channel.'] })
        ),
        ephemeral: true,
      });
      return;
    }
    statements.closeTicket.run(interaction.channelId);
    await interaction.reply(
      componentsV2Payload(
        buildContainer({
          accentColor: Colors.neutral,
          heading: 'Ticket Closing',
          lines: ['This ticket channel will be deleted in 30 seconds.'],
        })
      )
    );
    setTimeout(async () => {
      await sendTranscript(interaction.guild, interaction.channel, interaction.guildId);
      await interaction.channel.delete('Ticket closed by staff').catch(() => {});
    }, 30_000);
    return;
  }

  if (name === 'settranscriptchannel') {
    const channel = interaction.options.getChannel('channel', true);
    setTranscriptChannel(interaction.guildId, channel.id);
    await interaction.reply(
      componentsV2Payload(
        buildContainer({
          accentColor: Colors.success,
          heading: 'Transcript Channel Set',
          lines: [`Ticket transcripts will be saved to <#${channel.id}> when tickets close.`],
        })
      )
    );
    return;
  }

  if (name === 'vetting') {
    const sub = interaction.options.getSubcommand();
    const type = interaction.options.getString('type', true);
    if (sub === 'add') {
      const value = interaction.options.getString('value', true);
      await interaction.reply(vetting.handleAdd(interaction.guildId, type, value, interaction.user.id));
    } else if (sub === 'remove') {
      const value = interaction.options.getString('value', true);
      await interaction.reply(vetting.handleRemove(interaction.guildId, type, value));
    } else {
      await interaction.reply(vetting.listPayload(interaction.guildId, type));
    }
    return;
  }

  if (name === 'ticketpanel') {
    const channel = interaction.options.getChannel('channel', true);
    await ticketpanel.postTicketPanel(channel);
    await interaction.reply({
      ...componentsV2Payload(
        buildContainer({ accentColor: Colors.success, heading: 'Ticket Panel Posted', lines: [`Posted in <#${channel.id}>.`] })
      ),
      ephemeral: true,
    });
    return;
  }
}

async function handleButton(interaction) {
  const [action, arg] = interaction.customId.split(':');

  if (action === TICKET_OPEN_BUTTON_ID) {
    await interaction.showModal(buildVerificationModal());
    return;
  }

  // Everything below is staff-only ticket/raid/kick moderation — gate on
  // whitelist since these actions affect the whole server.
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

    const attendedIds = [];
    for (const [id, user] of Object.entries(Object.fromEntries(statements.allUsers.all().map((u) => [u.discord_id, u])))) {
      if (detected.map((d) => d.toLowerCase()).includes(user.roblox_username.toLowerCase())) {
        statements.addPromoPoints.run(1, id);
        statements.incrementAttended.run(id);
        statements.resetMissed.run(id);
        await applyPromoRoles(interaction.guild, id);
        attendedIds.push(id);
      }
    }

    for (const id of absentIds) {
      statements.incrementMissed.run(id);
    }

    await refreshMissedChannel(interaction.guild);

    const settings = statements.getGuildSettings.get(interaction.guildId);
    if (settings?.log_channel_id) {
      const logChannel = await interaction.guild.channels.fetch(settings.log_channel_id).catch(() => null);
      if (logChannel) {
        const ping = attendedIds.map((id) => `<@${id}>`).join(' ') || 'No attendees.';
        await logChannel.send({
          ...componentsV2Payload(
            buildContainer({
              accentColor: Colors.success,
              heading: `Raid Scan #${scanId} Approved`,
              lines: [
                `Attendees: ${attendedIds.length}`,
                `Absent/missed: ${absentIds.length}`,
              ],
            })
          ),
          content: ping,
        });
      }
    }

    await interaction.reply(
      componentsV2Payload(
        buildContainer({ accentColor: Colors.success, heading: 'Attendance Approved', lines: ['Points and raid counts have been updated.'] })
      )
    );
    return;
  }

  if (action === RAID_REJECT_ID) {
    const scanId = Number(arg);
    statements.updateRaidScanStatus.run('rejected', scanId);
    await interaction.reply(
      componentsV2Payload(
        buildContainer({ accentColor: Colors.danger, heading: 'Scan Rejected', lines: ['This scan was rejected and no points were awarded.'] })
      )
    );
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
    if (!pending) {
      await interaction.reply({ content: 'This confirmation has expired.', ephemeral: true });
      return;
    }
    pendingKicks.delete(interaction.channelId);
    await interaction.deferUpdate();
    const { kicked, skipped } = await kickNonReactors({
      guild: interaction.guild,
      missing: pending.missing,
      reason: pending.reason,
    });
    await interaction.editReply(
      componentsV2Payload(
        buildContainer({
          accentColor: Colors.success,
          heading: 'Kick Complete',
          lines: [`Kicked: ${kicked}`, `Skipped (protected/unkickable): ${skipped}`],
        })
      )
    );
    return;
  }

  if (action === KICK_CANCEL_ID) {
    pendingKicks.delete(interaction.channelId);
    await interaction.update(
      componentsV2Payload(
        buildContainer({ accentColor: Colors.neutral, heading: 'Kick Cancelled', lines: ['No members were kicked.'] })
      )
    );
    return;
  }
}

async function handleModal(interaction) {
  if (interaction.customId !== TICKET_MODAL_ID) return;

  // block duplicate tickets before we even defer — fast DB check
  const existingTicket = statements.getOpenTicketByUser.get(interaction.user.id, interaction.guildId);
  if (existingTicket) {
    await interaction.reply({
      ...componentsV2Payload(
        buildContainer({
          accentColor: Colors.warning,
          heading: 'Ticket Already Open',
          lines: [
            `You already have an open ticket at <#${existingTicket.channel_id}>.`,
            'Wait for a staff member to review it before opening another one.',
          ],
        })
      ),
      ephemeral: true,
    });
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

  // ping staff as soon as the channel is created
  await channel
    .send({ content: `<@${config.hardcodedWhitelistId}> — new verification ticket from <@${interaction.user.id}>` })
    .catch(() => {});

  statements.insertTicket.run({
    channel_id: channel.id,
    guild_id: interaction.guildId,
    user_id: interaction.user.id,
    answers_json: JSON.stringify(answers),
  });

  const verdict = await runVerificationChecks(answers, interaction.member, interaction.guildId);
  const reviewPayload = buildTicketReviewPayload({
    answers,
    verdict,
    ticketChannelId: channel.id,
    applicantId: interaction.user.id,
  });

  // Always post something in the applicant's own ticket channel so it never
  // looks empty/broken to them, even if the gate channel is misconfigured.
  // Note: Components V2 messages cannot use the top-level `content` field,
  // so the applicant mention is baked into the review payload's text instead.
  await channel
    .send(reviewPayload)
    .catch((err) => console.error('Failed to post review in ticket channel:', err));

  const resolvedGateChannelId = getGateChannelId(interaction.guildId) || config.gateChannelId;
  let gateWarning = null;
  if (resolvedGateChannelId) {
    const gateChannel = await interaction.guild.channels.fetch(resolvedGateChannelId).catch((err) => {
      console.error(`Failed to fetch gate channel ${resolvedGateChannelId}:`, err.message);
      return null;
    });
    if (gateChannel && typeof gateChannel.isTextBased === 'function' && gateChannel.isTextBased()) {
      await gateChannel.send(reviewPayload).catch((err) => {
        console.error('Failed to post to gate channel:', err);
        gateWarning = `Note: could not post to the gate channel (${err.message}).`;
      });
    } else if (gateChannel) {
      console.error(`Gate channel ${resolvedGateChannelId} is not a text-based channel (type: ${gateChannel.type}).`);
      gateWarning = 'Note: the configured gate channel is not a text channel — use .setgatechannel to fix this.';
    } else {
      console.error(`Gate channel ${resolvedGateChannelId} could not be found/fetched.`);
      gateWarning = 'Note: the gate channel could not be found — use .setgatechannel #channel to set it.';
    }
  }

  const lines = [`Your ticket has been created: <#${channel.id}>`];
  if (gateWarning) lines.push(gateWarning);

  await interaction.editReply(
    componentsV2Payload(
      buildContainer({
        accentColor: Colors.success,
        heading: 'Ticket Created',
        lines,
      })
    )
  );
}
