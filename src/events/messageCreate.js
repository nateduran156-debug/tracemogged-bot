import { config } from '../config.js';
import { isWhitelisted } from '../whitelist.js';
import {
  register, raidscan, raidmanual, raidstart, raidstats, loa,
  promorole, channels, activity, profile, whitelistCmd, verify, vetting, boostprotect, backup, lookup,
} from '../commandRegistry.js';
import { buildContainer, componentsV2Payload, Colors } from '../components.js';
import { pendingKicks } from '../pendingKicks.js';
import { pendingAwards } from '../pendingAwards.js';
import { statements } from '../db.js';
import { sendTranscript, buildAwardPanel } from '../tickets.js';

function parseArgs(content) {
  return content.trim().split(/\s+/).slice(1);
}

function isImageAttachment(attachment) {
  if (attachment.contentType?.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(attachment.name || '');
}

export default function registerMessageHandler(client) {
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Image detection in raid ticket channels
    if (message.attachments.size > 0 && message.guildId) {
      const hasImage = [...message.attachments.values()].some(isImageAttachment);
      if (hasImage) {
        const raidTicket = statements.getRaidTicketChannel.get(message.channelId);
        if (raidTicket) {
          const dbUser = statements.getUserByRoblox.get(raidTicket.roblox_username);
          const targetDiscordId = dbUser?.discord_id || raidTicket.user_id || null;
          pendingAwards.set(message.id, { targetDiscordId, robloxUsername: raidTicket.roblox_username, amount: 1, guildId: message.guildId });
          await message.channel.send(
            buildAwardPanel({ robloxUsername: raidTicket.roblox_username, targetDiscordId, amount: 1, proofMessageId: message.id })
          ).catch((err) => console.error('Failed to send award panel:', err));
        }
      }
    }

    if (!message.content.startsWith(config.prefix)) return;

    const commandName = message.content.slice(config.prefix.length).trim().split(/\s+/)[0]?.toLowerCase();
    if (!commandName) return;

    const args = parseArgs(message.content);

    // .register open to everyone
    if (commandName === 'register') {
      try {
        await register.run({ discordId: message.author.id, robloxUsername: args[0], reply: (p) => message.reply(p) });
      } catch (err) {
        await message.reply(`Error: ${err.message}`).catch(() => {});
      }
      return;
    }

    // Non-whitelisted can view their own profile
    if (commandName === 'profile') {
      const mentionedUser = message.mentions.users.first();
      const targetId = mentionedUser ? mentionedUser.id : message.author.id;
      if (!isWhitelisted(message.author.id) && targetId !== message.author.id) return;
      await message.reply(profile.buildProfilePayload(targetId));
      return;
    }

    if (!isWhitelisted(message.author.id)) return;

    try {
      switch (commandName) {

        case 'raid_groupscan': {
          const groupId = Number(args[0]);
          if (!groupId) { await message.reply('Usage: `.raid_groupscan <roblox_group_id>`'); return; }
          const sent = await message.reply(componentsV2Payload(buildContainer({ accentColor: Colors.info, heading: 'Group Scan Started', lines: [`Fetching members of Roblox group ${groupId}...`] })));
          await raidscan.runGroupScan({ guildId: message.guildId, createdBy: message.author.id, groupId, reply: async () => {}, editReply: (p) => sent.edit(p) });
          break;
        }

        case 'raid_addattendee': {
          const scanId = Number(args[0]);
          const user = message.mentions.users.first();
          if (!scanId || !user) { await message.reply('Usage: `.raid_addattendee <scan_id> @user`'); return; }
          const result = raidscan.addAttendeToScan(scanId, user.id);
          await message.reply(result.ok
            ? componentsV2Payload(buildContainer({ accentColor: Colors.success, heading: 'Attendee Added', lines: [`${result.username} (<@${user.id}>) marked as attended on scan #${scanId}.`] }))
            : componentsV2Payload(buildContainer({ accentColor: Colors.warning, heading: 'Error', lines: [result.reason] }))
          );
          break;
        }

        case 'raidscan': {
          const attachment = message.attachments.first();
          if (!attachment) { await message.reply('Attach a video to use `.raidscan`.'); return; }
          const sent = await message.reply(componentsV2Payload(buildContainer({ accentColor: Colors.info, heading: 'Raid Scan Started', lines: ['Downloading and scanning the video.'] })));
          await raidscan.runRaidScan({ guildId: message.guildId, createdBy: message.author.id, videoUrl: attachment.url, videoName: attachment.name, reply: async () => {}, editReply: (p) => sent.edit(p) });
          break;
        }

        case 'raid_manual': {
          await raidmanual.runPrefixManual({ guildId: message.guildId, createdBy: message.author.id, rawText: args.join(' '), reply: (p) => message.reply(p) });
          break;
        }

        case 'raid_start': {
          const channel = message.mentions.channels.first();
          if (!channel) { await message.reply('Usage: `.raid_start #channel`'); return; }
          await raidstart.runRaidStart({ guild: message.guild, channel, startedBy: message.author.id, reply: (p) => message.reply(p) });
          break;
        }

        case 'raidstats': {
          await message.reply(raidstats.buildRaidStatsPayload(message.guildId));
          break;
        }

        case 'raidhistory': {
          await message.reply(raidstats.buildRaidHistoryPayload(message.guildId));
          break;
        }

        case 'adjustpoints': {
          const user = message.mentions.users.first();
          const amount = Number(args.find((a) => !a.startsWith('<')));
          if (!user || !Number.isFinite(amount)) { await message.reply('Usage: `.adjustpoints @user 5` or `.adjustpoints @user -3`'); return; }
          await message.reply(raidstats.buildAdjustPointsPayload(user.id, amount));
          break;
        }

        case 'setkickthreshold': {
          const threshold = Number(args[0]);
          if (!Number.isFinite(threshold) || threshold < 1) { await message.reply('Usage: `.setkickthreshold 3`'); return; }
          await message.reply(raidstats.buildSetKickThresholdPayload(message.guildId, threshold, message.author.id));
          break;
        }

        case 'loa': {
          const user = message.mentions.users.first();
          const reason = args.filter((a) => !a.startsWith('<')).join(' ');
          if (!user || !reason) { await message.reply('Usage: `.loa @user reason`'); return; }
          loa.addLoa(message.guildId, user.id, reason, message.author.id);
          await message.reply(loa.buildLoaPayload(message.guildId, user.id, reason, message.author.id));
          break;
        }

        case 'loa_end': {
          const user = message.mentions.users.first();
          if (!user) { await message.reply('Usage: `.loa_end @user`'); return; }
          loa.removeLoa(message.guildId, user.id);
          await message.reply(loa.buildLoaEndPayload(user.id));
          break;
        }

        case 'check_loa': {
          await message.reply(loa.buildCheckLoaPayload(message.guildId));
          break;
        }

        case 'promorole_add': {
          const points = Number(args[0]);
          const role = message.mentions.roles.first();
          if (!Number.isFinite(points) || !role) { await message.reply('Usage: `.promorole_add points @role`'); return; }
          promorole.addPromoRole(points, role.id);
          await message.reply(promorole.listPromoRolesPayload());
          break;
        }

        case 'promorole_remove': {
          const points = Number(args[0]);
          if (!Number.isFinite(points)) { await message.reply('Usage: `.promorole_remove points`'); return; }
          promorole.removePromoRole(points);
          await message.reply(promorole.listPromoRolesPayload());
          break;
        }

        case 'promorole_list': {
          await message.reply(promorole.listPromoRolesPayload());
          break;
        }

        case 'setlogchannel': {
          const channel = message.mentions.channels.first();
          if (!channel) { await message.reply('Usage: `.setlogchannel #channel`'); return; }
          channels.setLogChannel(message.guildId, channel.id);
          await message.reply(componentsV2Payload(buildContainer({ accentColor: Colors.success, heading: 'Log Channel Set', lines: [`Set to <#${channel.id}>.`] })));
          break;
        }

        case 'setmissedchannel': {
          const channel = message.mentions.channels.first();
          if (!channel) { await message.reply('Usage: `.setmissedchannel #channel`'); return; }
          channels.setMissedChannel(message.guildId, channel.id);
          await message.reply(componentsV2Payload(buildContainer({ accentColor: Colors.success, heading: 'Missed Raids Channel Set', lines: [`Set to <#${channel.id}>.`] })));
          break;
        }

        case 'setgatechannel': {
          const channel = message.mentions.channels.first();
          if (!channel) { await message.reply('Usage: `.setgatechannel #channel`'); return; }
          channels.setGateChannel(message.guildId, channel.id);
          await message.reply(componentsV2Payload(buildContainer({ accentColor: Colors.success, heading: 'Gate Channel Set', lines: [`Set to <#${channel.id}>.`] })));
          break;
        }

        case 'activitycheck': {
          const messageLink = args[0];
          const role = message.mentions.roles.first();
          if (!messageLink || !role) { await message.reply('Usage: `.activitycheck message_link @role`'); return; }
          const { reacted, missing, csvPath } = await activity.runActivityCheck({ guild: message.guild, messageLink, role });
          await message.reply({ ...componentsV2Payload(buildContainer({ accentColor: Colors.info, heading: 'Activity Check', lines: [`Role: <@&${role.id}>`, `Reacted: ${reacted.length}`, `Missing: ${missing.length}`] })), files: [csvPath] });
          break;
        }

        case 'kicknonreactors': {
          const messageLink = args[0];
          const role = message.mentions.roles.first();
          const reason = args.slice(2).join(' ') || 'No reason provided';
          if (!messageLink || !role) { await message.reply('Usage: `.kicknonreactors message_link @role reason`'); return; }
          const { missing } = await activity.runActivityCheck({ guild: message.guild, messageLink, role });
          const protectedRoleIds = boostprotect.getProtectedRoleIds(message.guildId);
          const protectedCount = missing.filter((m) => activity.isProtectedFromKick(m, message.guild, protectedRoleIds)).length;
          const confirmMsg = await message.reply(activity.buildKickConfirmPayload({ role, missing, reason, protectedCount }));
          pendingKicks.set(confirmMsg.channelId, { missing, reason, protectedRoleIds });
          break;
        }

        case 'boostprotect_add': {
          const role = message.mentions.roles.first();
          if (!role) { await message.reply('Usage: `.boostprotect_add @role`'); return; }
          await message.reply(boostprotect.addProtectedRole(message.guildId, role.id, message.author.id));
          break;
        }

        case 'boostprotect_remove': {
          const role = message.mentions.roles.first();
          if (!role) { await message.reply('Usage: `.boostprotect_remove @role`'); return; }
          await message.reply(boostprotect.removeProtectedRole(message.guildId, role.id));
          break;
        }

        case 'boostprotect_list': {
          await message.reply(boostprotect.listProtectedRoles(message.guildId));
          break;
        }

        case 'lookup': {
          if (!args[0]) { await message.reply('Usage: `.lookup robloxusername`'); return; }
          await message.reply(lookup.runLookup(args[0]));
          break;
        }

        case 'backup': {
          const tmpPath = backup.runBackup();
          await message.reply(backup.backupPayload(tmpPath));
          break;
        }

        case 'restore': {
          const attachment = message.attachments.first();
          if (!attachment) { await message.reply('Attach your backup .json file to use `.restore`.'); return; }
          const result = await backup.downloadAndRestore(attachment.url);
          await message.reply(result.ok ? backup.restoreSuccessPayload(result.counts) : componentsV2Payload(buildContainer({ accentColor: Colors.danger, heading: 'Restore Failed', lines: [result.reason] })));
          break;
        }

        case 'profileall': {
          const payloads = profile.buildProfileAllPayload();
          const list = Array.isArray(payloads) ? payloads : [payloads];
          for (const p of list) await message.reply(p);
          break;
        }

        case 'whitelist_add': {
          const user = message.mentions.users.first();
          if (!user) { await message.reply('Usage: `.whitelist_add @user`'); return; }
          await message.reply(whitelistCmd.handleWhitelistAdd(user.id, message.author.id));
          break;
        }

        case 'whitelist_remove': {
          const user = message.mentions.users.first();
          if (!user) { await message.reply('Usage: `.whitelist_remove @user`'); return; }
          await message.reply(whitelistCmd.handleWhitelistRemove(user.id));
          break;
        }

        case 'whitelist_list': {
          await message.reply(whitelistCmd.handleWhitelistList());
          break;
        }

        case 'verify': {
          const user = message.mentions.users.first();
          if (!user) { await message.reply('Usage: `.verify @user`'); return; }
          await message.reply(await verify.runVerify(message.guild, user.id));
          break;
        }

        case 'closeticket': {
          const ticket = statements.getTicket.get(message.channelId);
          if (!ticket) { await message.reply('This channel is not a ticket channel.'); return; }
          statements.closeTicket.run(message.channelId);
          await message.reply(componentsV2Payload(buildContainer({ accentColor: Colors.neutral, heading: 'Ticket Closing', lines: ['This ticket channel will be deleted in 30 seconds.'] })));
          setTimeout(async () => {
            await sendTranscript(message.guild, message.channel, message.guildId);
            await message.channel.delete('Ticket closed by staff').catch(() => {});
          }, 30_000);
          break;
        }

        case 'settranscriptchannel': {
          const channel = message.mentions.channels.first();
          if (!channel) { await message.reply('Usage: `.settranscriptchannel #channel`'); return; }
          const { setTranscriptChannel } = await import('../commands/channels.js');
          setTranscriptChannel(message.guildId, channel.id);
          await message.reply(componentsV2Payload(buildContainer({ accentColor: Colors.success, heading: 'Transcript Channel Set', lines: [`Set to <#${channel.id}>.`] })));
          break;
        }

        case 'vetting_add': {
          const type = vetting.typeFromArg(args[0] || '');
          const value = args.slice(1).join(' ');
          if (!type || !value) { await message.reply('Usage: `.vetting_add <type> value`'); return; }
          await message.reply(vetting.handleAdd(message.guildId, type, value, message.author.id));
          break;
        }

        case 'vetting_remove': {
          const type = vetting.typeFromArg(args[0] || '');
          const value = args.slice(1).join(' ');
          if (!type || !value) { await message.reply('Usage: `.vetting_remove <type> value`'); return; }
          await message.reply(vetting.handleRemove(message.guildId, type, value));
          break;
        }

        case 'vetting_list': {
          const type = vetting.typeFromArg(args[0] || '');
          if (!type) { await message.reply('Usage: `.vetting_list <type>`'); return; }
          await message.reply(vetting.listPayload(message.guildId, type));
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('Prefix command error:', err);
      await message.reply(`Error: ${err.message}`).catch(() => {});
    }
  });
}
