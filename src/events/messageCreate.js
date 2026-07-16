import { config } from '../config.js';
import { isWhitelisted } from '../whitelist.js';
import {
  register, raidscan, raidmanual, raidstart, raidstats, loa,
  promorole, channels, activity, profile, whitelistCmd, verify, vetting, boostprotect, backup, lookup, flaggedlogs, memberops,
} from '../commandRegistry.js';
import { buildContainer, componentsV2Payload, Colors } from '../components.js';
import { pendingKicks } from '../pendingKicks.js';
import { pendingAwards } from '../pendingAwards.js';
import { statements } from '../db.js';
import { sendTranscript, buildAwardPanel } from '../tickets.js';
import { setFlaggedLogsChannel, setTranscriptChannel } from '../commands/channels.js';

function parseArgs(content) {
  return content.trim().split(/\s+/).slice(1);
}

function isImageAttachment(attachment) {
  if (attachment.contentType?.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(attachment.name || '');
}

function howTo(heading, lines) {
  return componentsV2Payload(
    buildContainer({ accentColor: Colors.neutral, heading, lines })
  );
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
          if (!groupId) {
            await message.reply(howTo('How to use .raid_groupscan', ['`.raid_groupscan (roblox_group_id)`', '', 'example: `.raid_groupscan 396910998`']));
            return;
          }
          const sent = await message.reply(componentsV2Payload(buildContainer({ accentColor: Colors.info, heading: 'Group Scan Started', lines: [`Fetching members of Roblox group ${groupId}...`] })));
          await raidscan.runGroupScan({ guildId: message.guildId, createdBy: message.author.id, groupId, reply: async () => {}, editReply: (p) => sent.edit(p) });
          break;
        }

        case 'raid_addattendee': {
          const scanId = Number(args[0]);
          const user = message.mentions.users.first();
          if (!scanId || !user) {
            await message.reply(howTo('How to use .raid_addattendee', ['`.raid_addattendee (scan_id) (@user)`', '', 'example: `.raid_addattendee 12 @tracemogged`']));
            return;
          }
          const result = raidscan.addAttendeToScan(scanId, user.id);
          await message.reply(result.ok
            ? componentsV2Payload(buildContainer({ accentColor: Colors.success, heading: 'Attendee Added', lines: [`${result.username} (<@${user.id}>) marked as attended on scan #${scanId}.`] }))
            : componentsV2Payload(buildContainer({ accentColor: Colors.warning, heading: 'Error', lines: [result.reason] }))
          );
          break;
        }

        case 'raidscan': {
          const attachment = message.attachments.first();
          if (!attachment) {
            await message.reply(howTo('How to use .raidscan', ['attach a video file to your message', '', 'example: `.raidscan` (with video attached)']));
            return;
          }
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
          if (!channel) {
            await message.reply(howTo('How to use .raid_start', ['`.raid_start (#channel)`', '', 'example: `.raid_start #general-raid`']));
            return;
          }
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
          if (!user || !Number.isFinite(amount)) {
            await message.reply(howTo('How to use .adjustpoints', ['`.adjustpoints (@user) (amount)`', '', 'example: `.adjustpoints @tracemogged 5`', 'example: `.adjustpoints @tracemogged -3` (remove points)']));
            return;
          }
          await message.reply(raidstats.buildAdjustPointsPayload(user.id, amount));
          break;
        }

        case 'setkickthreshold': {
          const threshold = Number(args[0]);
          if (!Number.isFinite(threshold) || threshold < 1) {
            await message.reply(howTo('How to use .setkickthreshold', ['`.setkickthreshold (number)`', '', 'example: `.setkickthreshold 3`']));
            return;
          }
          await message.reply(raidstats.buildSetKickThresholdPayload(message.guildId, threshold, message.author.id));
          break;
        }

        case 'setpointvalue': {
          const points = Number(args[0]);
          if (!Number.isFinite(points) || points < 1) {
            await message.reply(howTo('How to use .setpointvalue', ['`.setpointvalue (points)`', '', 'example: `.setpointvalue 2` — each raid attendance awards 2 points']));
            return;
          }
          await message.reply(raidstats.buildSetPointValuePayload(message.guildId, points, message.author.id));
          break;
        }

        case 'flagged_player_logs':
        case 'flaggedplayerlogs': {
          await message.reply(flaggedlogs.buildFlaggedPlayerLogsPayload(message.guildId));
          break;
        }

        case 'enforcement_logs':
        case 'enforcementlogs': {
          await message.reply(flaggedlogs.buildRecentEnforcementLogsPayload(message.guildId));
          break;
        }

        case 'setflaggedlogschannel': {
          const channel = message.mentions.channels.first();
          if (!channel) {
            await message.reply(howTo('How to use .setflaggedlogschannel', ['`.setflaggedlogschannel (#channel)`', '', 'example: `.setflaggedlogschannel #enforcement-logs`']));
            return;
          }
          setFlaggedLogsChannel(message.guildId, channel.id);
          await message.reply(componentsV2Payload(buildContainer({ accentColor: Colors.success, heading: 'Flagged Logs Channel Set', lines: [`Auto enforcement flags will be posted to <#${channel.id}>.`] })));
          break;
        }

        case 'attendance': {
          const user = message.mentions.users.first();
          const targetId = user ? user.id : message.author.id;
          await message.reply(memberops.buildAttendancePayload(targetId, message.guildId));
          break;
        }

        case 'resetmissed': {
          const user = message.mentions.users.first();
          if (!user) {
            await message.reply(howTo('How to use .resetmissed', ['`.resetmissed (@user)`', '', 'example: `.resetmissed @tracemogged`']));
            return;
          }
          await message.reply(memberops.buildResetMissedPayload(user.id, message.author.id));
          await channels.refreshMissedChannel(message.guild).catch(() => {});
          break;
        }

        case 'unflag': {
          const user = message.mentions.users.first();
          if (!user) {
            await message.reply(howTo('How to use .unflag', ['`.unflag (@user)`', '', 'example: `.unflag @tracemogged`']));
            return;
          }
          const { payload, dmTarget } = memberops.buildUnflagPayload(user.id, message.author.id);
          await message.reply(payload);
          await channels.refreshMissedChannel(message.guild).catch(() => {});
          if (dmTarget) {
            const member = await message.guild.members.fetch(dmTarget).catch(() => null);
            if (member) {
              await member.send(
                `you've been unflagged by staff.\n\nyour missed raid count has been cleared — you're starting fresh.`
              ).catch(() => {});
            }
          }
          break;
        }

        case 'demote': {
          const user = message.mentions.users.first();
          if (!user) {
            await message.reply(howTo('How to use .demote', ['`.demote (@user)`', '', 'example: `.demote @tracemogged`']));
            return;
          }
          await message.reply(await memberops.buildDemotePayload(message.guild, user.id, message.author.id));
          break;
        }

        case 'raidreset': {
          await message.reply(memberops.buildRaidResetConfirmPayload(message.author.id));
          break;
        }

        case 'exportall': {
          await message.reply(memberops.buildExportAllPayload());
          break;
        }

        case 'loa': {
          const user = message.mentions.users.first();
          const reason = args.filter((a) => !a.startsWith('<')).join(' ');
          if (!user || !reason) {
            await message.reply(howTo('How to use .loa', ['`.loa (@user) (reason)`', '', 'example: `.loa @tracemogged vacation for 2 weeks`']));
            return;
          }
          loa.addLoa(message.guildId, user.id, reason, message.author.id);
          await message.reply(loa.buildLoaPayload(message.guildId, user.id, reason, message.author.id));
          break;
        }

        case 'loa_end': {
          const user = message.mentions.users.first();
          if (!user) {
            await message.reply(howTo('How to use .loa_end', ['`.loa_end (@user)`', '', 'example: `.loa_end @tracemogged`']));
            return;
          }
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
          if (!Number.isFinite(points) || !role) {
            await message.reply(howTo('How to use .promorole_add', ['`.promorole_add (points) (@role)`', '', 'example: `.promorole_add 10 @Raider`']));
            return;
          }
          promorole.addPromoRole(points, role.id);
          await message.reply(promorole.listPromoRolesPayload());
          break;
        }

        case 'promorole_remove': {
          const points = Number(args[0]);
          if (!Number.isFinite(points)) {
            await message.reply(howTo('How to use .promorole_remove', ['`.promorole_remove (points)`', '', 'example: `.promorole_remove 10`']));
            return;
          }
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
          if (!channel) {
            await message.reply(howTo('How to use .setlogchannel', ['`.setlogchannel (#channel)`', '', 'example: `.setlogchannel #raid-logs`']));
            return;
          }
          channels.setLogChannel(message.guildId, channel.id);
          await message.reply(componentsV2Payload(buildContainer({ accentColor: Colors.success, heading: 'Log Channel Set', lines: [`Set to <#${channel.id}>.`] })));
          break;
        }

        case 'setmissedchannel': {
          const channel = message.mentions.channels.first();
          if (!channel) {
            await message.reply(howTo('How to use .setmissedchannel', ['`.setmissedchannel (#channel)`', '', 'example: `.setmissedchannel #missed-raids`']));
            return;
          }
          channels.setMissedChannel(message.guildId, channel.id);
          await message.reply(componentsV2Payload(buildContainer({ accentColor: Colors.success, heading: 'Missed Raids Channel Set', lines: [`Set to <#${channel.id}>.`] })));
          break;
        }

        case 'setgatechannel': {
          const channel = message.mentions.channels.first();
          if (!channel) {
            await message.reply(howTo('How to use .setgatechannel', ['`.setgatechannel (#channel)`', '', 'example: `.setgatechannel #gate`']));
            return;
          }
          channels.setGateChannel(message.guildId, channel.id);
          await message.reply(componentsV2Payload(buildContainer({ accentColor: Colors.success, heading: 'Gate Channel Set', lines: [`Set to <#${channel.id}>.`] })));
          break;
        }

        case 'activitycheck': {
          const messageLink = args[0];
          const role = message.mentions.roles.first();
          if (!messageLink || !role) {
            await message.reply(howTo('How to use .activitycheck', ['`.activitycheck (message_link) (@role)`', '', 'example: `.activitycheck https://discord.com/channels/.../... @Member`']));
            return;
          }
          const { reacted, missing, csvPath } = await activity.runActivityCheck({ guild: message.guild, messageLink, role });
          await message.reply({ ...componentsV2Payload(buildContainer({ accentColor: Colors.info, heading: 'Activity Check', lines: [`Role: <@&${role.id}>`, `Reacted: ${reacted.length}`, `Missing: ${missing.length}`] })), files: [csvPath] });
          break;
        }

        case 'kicknonreactors': {
          const messageLink = args[0];
          const role = message.mentions.roles.first();
          const reason = args.slice(2).join(' ') || 'No reason provided';
          if (!messageLink || !role) {
            await message.reply(howTo('How to use .kicknonreactors', ['`.kicknonreactors (message_link) (@role) (reason)`', '', 'example: `.kicknonreactors https://discord.com/channels/.../... @Member inactive`']));
            return;
          }
          const { missing } = await activity.runActivityCheck({ guild: message.guild, messageLink, role });
          const protectedRoleIds = boostprotect.getProtectedRoleIds(message.guildId);
          const protectedCount = missing.filter((m) => activity.isProtectedFromKick(m, message.guild, protectedRoleIds)).length;
          pendingKicks.set(message.channelId, { missing, reason, protectedRoleIds });
          await message.reply(activity.buildKickConfirmPayload({ role, missing, reason, protectedCount }));
          break;
        }

        case 'whitelist_add': {
          const user = message.mentions.users.first();
          if (!user) {
            await message.reply(howTo('How to use .whitelist_add', ['`.whitelist_add (@user)`', '', 'example: `.whitelist_add @tracemogged`']));
            return;
          }
          await message.reply(whitelistCmd.handleWhitelistAdd(user.id, message.author.id));
          break;
        }

        case 'whitelist_remove': {
          const user = message.mentions.users.first();
          if (!user) {
            await message.reply(howTo('How to use .whitelist_remove', ['`.whitelist_remove (@user)`', '', 'example: `.whitelist_remove @tracemogged`']));
            return;
          }
          await message.reply(whitelistCmd.handleWhitelistRemove(user.id));
          break;
        }

        case 'whitelist_list': {
          await message.reply(whitelistCmd.handleWhitelistList());
          break;
        }

        case 'verify': {
          const user = message.mentions.users.first();
          if (!user) {
            await message.reply(howTo('How to use .verify', ['`.verify (@user)`', '', 'example: `.verify @tracemogged`']));
            return;
          }
          await message.reply(await verify.runVerify(message.guild, user.id));
          break;
        }

        case 'lookup': {
          const username = args[0];
          if (!username) {
            await message.reply(howTo('How to use .lookup', ['`.lookup (roblox_username)`', '', 'example: `.lookup tracemogged`']));
            return;
          }
          const sent = await message.reply(componentsV2Payload(buildContainer({ accentColor: Colors.info, heading: 'Looking up...', lines: [`Fetching info for **${username}**`] })));
          const result = await lookup.runLookup(username);
          await sent.edit(result);
          break;
        }

        case 'closeticket': {
          const ticket = statements.getTicket.get(message.channelId);
          if (!ticket) {
            await message.reply(componentsV2Payload(buildContainer({ accentColor: Colors.warning, heading: 'Not a Ticket', lines: ['This command can only be used inside a ticket channel.'] })));
            break;
          }
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
          if (!channel) {
            await message.reply(howTo('How to use .settranscriptchannel', ['`.settranscriptchannel (#channel)`', '', 'example: `.settranscriptchannel #transcripts`']));
            return;
          }
          setTranscriptChannel(message.guildId, channel.id);
          await message.reply(componentsV2Payload(buildContainer({ accentColor: Colors.success, heading: 'Transcript Channel Set', lines: [`Set to <#${channel.id}>.`] })));
          break;
        }

        case 'vetting_add': {
          const type = vetting.typeFromArg(args[0] || '');
          const value = args.slice(1).join(' ');
          if (!type || !value) {
            await message.reply(howTo('How to use .vetting_add', ['`.vetting_add (type) (value)`', '', 'types: `opponent`, `blacklist`, `group`', 'example: `.vetting_add opponent SomeCrewName`']));
            return;
          }
          await message.reply(vetting.handleAdd(message.guildId, type, value, message.author.id));
          break;
        }

        case 'vetting_remove': {
          const type = vetting.typeFromArg(args[0] || '');
          const value = args.slice(1).join(' ');
          if (!type || !value) {
            await message.reply(howTo('How to use .vetting_remove', ['`.vetting_remove (type) (value)`', '', 'example: `.vetting_remove opponent SomeCrewName`']));
            return;
          }
          await message.reply(vetting.handleRemove(message.guildId, type, value));
          break;
        }

        case 'vetting_list': {
          const type = vetting.typeFromArg(args[0] || '');
          if (!type) {
            await message.reply(howTo('How to use .vetting_list', ['`.vetting_list (type)`', '', 'types: `opponent`, `blacklist`, `group`', 'example: `.vetting_list opponent`']));
            return;
          }
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
