import { config } from '../config.js';
import { isWhitelisted } from '../whitelist.js';
import { register, raidscan, promorole, channels, activity, profile, whitelistCmd, verify, vetting, boostprotect, backup, lookup } from '../commandRegistry.js';
import { buildContainer, componentsV2Payload, Colors } from '../components.js';
import { pendingKicks } from '../pendingKicks.js';
import { statements } from '../db.js';
import { sendTranscript } from '../tickets.js';

function parseArgs(content) {
  return content.trim().split(/\s+/).slice(1);
}

export default function registerMessageHandler(client) {
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(config.prefix)) return;

    const commandName = message.content.slice(config.prefix.length).trim().split(/\s+/)[0]?.toLowerCase();
    if (!commandName) return;

    const args = parseArgs(message.content);

    // .register is open to everyone — members need it to link their Roblox account.
    if (commandName === 'register') {
      try {
        await register.run({
          discordId: message.author.id,
          robloxUsername: args[0],
          reply: (payload) => message.reply(payload),
        });
      } catch (err) {
        await message.reply(`Error: ${err.message}`).catch(() => {});
      }
      return;
    }

    // All other commands are staff-only — silently ignore non-whitelisted users
    // so the bot doesn't reveal itself to people who shouldn't use it.
    if (!isWhitelisted(message.author.id)) return;

    try {
      switch (commandName) {

        case 'raid_groupscan': {
          const groupId = Number(args[0]);
          if (!groupId) {
            await message.reply('Usage: `.raid_groupscan <roblox_group_id>`');
            return;
          }
          const sent = await message.reply(
            componentsV2Payload(buildContainer({
              accentColor: Colors.info,
              heading: 'Group Scan Started',
              lines: [`Fetching members of Roblox group ${groupId}...`],
            }))
          );
          await raidscan.runGroupScan({
            guildId: message.guildId,
            createdBy: message.author.id,
            groupId,
            reply: async () => {},
            editReply: (payload) => sent.edit(payload),
          });
          break;
        }

        case 'raid_addattendee': {
          const scanId = Number(args[0]);
          const user = message.mentions.users.first();
          if (!scanId || !user) {
            await message.reply('Usage: `.raid_addattendee <scan_id> @user`');
            return;
          }
          const result = raidscan.addAttendeToScan(scanId, user.id);
          if (!result.ok) {
            await message.reply(`Error: ${result.reason}`);
          } else {
            await message.reply(
              componentsV2Payload(buildContainer({
                accentColor: Colors.success,
                heading: 'Attendee Added',
                lines: [`${result.username} (<@${user.id}>) has been marked as attended on scan #${scanId}.`],
              }))
            );
          }
          break;
        }

        case 'raidscan': {
          const attachment = message.attachments.first();
          if (!attachment) {
            await message.reply('Attach a video to use `.raidscan`.');
            return;
          }
          const sent = await message.reply(
            componentsV2Payload(
              buildContainer({ accentColor: Colors.info, heading: 'Raid Scan Started', lines: ['Downloading and scanning the video.'] })
            )
          );
          await raidscan.runRaidScan({
            guildId: message.guildId,
            createdBy: message.author.id,
            videoUrl: attachment.url,
            videoName: attachment.name,
            reply: async () => {},
            editReply: (payload) => sent.edit(payload),
          });
          break;
        }

        case 'promorole_add': {
          const points = Number(args[0]);
          const role = message.mentions.roles.first();
          if (!Number.isFinite(points) || !role) {
            await message.reply('Usage: `.promorole_add points @role`');
            return;
          }
          promorole.addPromoRole(points, role.id);
          await message.reply(promorole.listPromoRolesPayload());
          break;
        }

        case 'promorole_remove': {
          const points = Number(args[0]);
          if (!Number.isFinite(points)) {
            await message.reply('Usage: `.promorole_remove points`');
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
            await message.reply('Usage: `.setlogchannel #channel`');
            return;
          }
          channels.setLogChannel(message.guildId, channel.id);
          await message.reply(
            componentsV2Payload(
              buildContainer({ accentColor: Colors.success, heading: 'Log Channel Set', lines: [`Log channel set to <#${channel.id}>.`] })
            )
          );
          break;
        }

        case 'setmissedchannel': {
          const channel = message.mentions.channels.first();
          if (!channel) {
            await message.reply('Usage: `.setmissedchannel #channel`');
            return;
          }
          channels.setMissedChannel(message.guildId, channel.id);
          await message.reply(
            componentsV2Payload(
              buildContainer({ accentColor: Colors.success, heading: 'Missed Raids Channel Set', lines: [`Missed raids channel set to <#${channel.id}>.`] })
            )
          );
          break;
        }

        case 'setgatechannel': {
          const channel = message.mentions.channels.first();
          if (!channel) {
            await message.reply('Usage: `.setgatechannel #channel`');
            return;
          }
          channels.setGateChannel(message.guildId, channel.id);
          await message.reply(
            componentsV2Payload(
              buildContainer({ accentColor: Colors.success, heading: 'Gate Channel Set', lines: [`Gate channel set to <#${channel.id}>. Verification applications will now be posted there.`] })
            )
          );
          break;
        }

        case 'activitycheck': {
          const messageLink = args[0];
          const role = message.mentions.roles.first();
          if (!messageLink || !role) {
            await message.reply('Usage: `.activitycheck message_link @role`');
            return;
          }
          const { reacted, missing, csvPath } = await activity.runActivityCheck({
            guild: message.guild,
            messageLink,
            role,
          });
          await message.reply({
            ...componentsV2Payload(
              buildContainer({
                accentColor: Colors.info,
                heading: 'Activity Check',
                lines: [`Role: <@&${role.id}>`, `Reacted: ${reacted.length}`, `Missing: ${missing.length}`],
              })
            ),
            files: [csvPath],
          });
          break;
        }

        case 'kicknonreactors': {
          const messageLink = args[0];
          const role = message.mentions.roles.first();
          const reason = args.slice(2).join(' ') || 'No reason provided';
          if (!messageLink || !role) {
            await message.reply('Usage: `.kicknonreactors message_link @role reason`');
            return;
          }
          const { missing } = await activity.runActivityCheck({ guild: message.guild, messageLink, role });
          const protectedRoleIds = boostprotect.getProtectedRoleIds(message.guildId);
          const protectedCount = missing.filter((m) => activity.isProtectedFromKick(m, message.guild, protectedRoleIds)).length;
          const confirmMsg = await message.reply(
            activity.buildKickConfirmPayload({ role, missing, reason, protectedCount })
          );
          pendingKicks.set(confirmMsg.channelId, { missing, reason, protectedRoleIds });
          break;
        }

        case 'boostprotect_add': {
          const role = message.mentions.roles.first();
          if (!role) {
            await message.reply('Usage: `.boostprotect_add @role`');
            return;
          }
          await message.reply(boostprotect.addProtectedRole(message.guildId, role.id, message.author.id));
          break;
        }

        case 'boostprotect_remove': {
          const role = message.mentions.roles.first();
          if (!role) {
            await message.reply('Usage: `.boostprotect_remove @role`');
            return;
          }
          await message.reply(boostprotect.removeProtectedRole(message.guildId, role.id));
          break;
        }

        case 'boostprotect_list': {
          await message.reply(boostprotect.listProtectedRoles(message.guildId));
          break;
        }

        case 'lookup': {
          if (!args[0]) {
            await message.reply('Usage: `.lookup robloxusername`');
            return;
          }
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
          if (!attachment) {
            await message.reply('Attach your backup .json file to use `.restore`.');
            return;
          }
          const result = await backup.downloadAndRestore(attachment.url);
          if (!result.ok) {
            await message.reply(
              componentsV2Payload(
                buildContainer({ accentColor: Colors.danger, heading: 'Restore Failed', lines: [result.reason] })
              )
            );
          } else {
            await message.reply(backup.restoreSuccessPayload(result.counts));
          }
          break;
        }

        case 'profile': {
          const member = message.mentions.users.first() || message.author;
          await message.reply(profile.buildProfilePayload(member.id));
          break;
        }

        case 'profileall': {
          const payloads = profile.buildProfileAllPayload();
          const list = Array.isArray(payloads) ? payloads : [payloads];
          for (const p of list) {
            await message.reply(p);
          }
          break;
        }

        case 'whitelist_add': {
          const user = message.mentions.users.first();
          if (!user) {
            await message.reply('Usage: `.whitelist_add @user`');
            return;
          }
          await message.reply(whitelistCmd.handleWhitelistAdd(user.id, message.author.id));
          break;
        }

        case 'whitelist_remove': {
          const user = message.mentions.users.first();
          if (!user) {
            await message.reply('Usage: `.whitelist_remove @user`');
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
            await message.reply('Usage: `.verify @user`');
            return;
          }
          await message.reply(await verify.runVerify(message.guild, user.id));
          break;
        }

        case 'closeticket': {
          const ticket = statements.getTicket.get(message.channelId);
          if (!ticket) {
            await message.reply('This channel is not a ticket channel.');
            return;
          }
          statements.closeTicket.run(message.channelId);
          await message.reply(
            componentsV2Payload(
              buildContainer({
                accentColor: Colors.neutral,
                heading: 'Ticket Closing',
                lines: ['This ticket channel will be deleted in 30 seconds.'],
              })
            )
          );
          setTimeout(async () => {
            await sendTranscript(message.guild, message.channel, message.guildId);
            await message.channel.delete('Ticket closed by staff').catch(() => {});
          }, 30_000);
          break;
        }

        case 'settranscriptchannel': {
          const channel = message.mentions.channels.first();
          if (!channel) {
            await message.reply('Usage: `.settranscriptchannel #channel`');
            return;
          }
          const { setTranscriptChannel } = await import('../commands/channels.js');
          setTranscriptChannel(message.guildId, channel.id);
          await message.reply(
            componentsV2Payload(
              buildContainer({
                accentColor: Colors.success,
                heading: 'Transcript Channel Set',
                lines: [`Ticket transcripts will be saved to <#${channel.id}> when tickets close.`],
              })
            )
          );
          break;
        }

        case 'vetting_add': {
          const type = vetting.typeFromArg(args[0] || '');
          const value = args.slice(1).join(' ');
          if (!type || !value) {
            await message.reply('Usage: `.vetting_add <opponent_crew|opponent_roblox_group|blacklisted_roblox_user|blacklisted_discord_id> value`');
            return;
          }
          await message.reply(vetting.handleAdd(message.guildId, type, value, message.author.id));
          break;
        }

        case 'vetting_remove': {
          const type = vetting.typeFromArg(args[0] || '');
          const value = args.slice(1).join(' ');
          if (!type || !value) {
            await message.reply('Usage: `.vetting_remove <opponent_crew|opponent_roblox_group|blacklisted_roblox_user|blacklisted_discord_id> value`');
            return;
          }
          await message.reply(vetting.handleRemove(message.guildId, type, value));
          break;
        }

        case 'vetting_list': {
          const type = vetting.typeFromArg(args[0] || '');
          if (!type) {
            await message.reply('Usage: `.vetting_list <opponent_crew|opponent_roblox_group|blacklisted_roblox_user|blacklisted_discord_id>`');
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
