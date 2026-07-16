import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { statements } from '../db.js';

export const setLogChannelData = new SlashCommandBuilder()
  .setName('setlogchannel')
  .setDescription('Set the channel used for raid approval logs')
  .addChannelOption((o) =>
    o
      .setName('channel')
      .setDescription('Log channel')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
  );

export const setMissedChannelData = new SlashCommandBuilder()
  .setName('setmissedchannel')
  .setDescription('Set the channel that lists users who missed 2+ raids')
  .addChannelOption((o) =>
    o
      .setName('channel')
      .setDescription('Missed raids channel')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
  );

export const setGateChannelData = new SlashCommandBuilder()
  .setName('setgatechannel')
  .setDescription('Set the channel where verification applications are posted for staff review')
  .addChannelOption((o) =>
    o
      .setName('channel')
      .setDescription('Gate channel')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
  );

export const closeTicketData = new SlashCommandBuilder()
  .setName('closeticket')
  .setDescription('Close and delete this ticket channel after a 30-second warning');

export const setTranscriptChannelData = new SlashCommandBuilder()
  .setName('settranscriptchannel')
  .setDescription('Set the channel where ticket transcripts get saved when a ticket closes')
  .addChannelOption((o) =>
    o
      .setName('channel')
      .setDescription('Transcript channel')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
  );

export function setLogChannel(guildId, channelId) {
  statements.upsertLogChannel.run(guildId, channelId);
}

export function setMissedChannel(guildId, channelId) {
  statements.upsertMissedChannel.run(guildId, channelId);
}

export function setGateChannel(guildId, channelId) {
  statements.upsertGateChannel.run(guildId, channelId);
}

export function getGateChannelId(guildId) {
  const settings = statements.getGuildSettings.get(guildId);
  return settings?.gate_channel_id || null;
}

export function setTranscriptChannel(guildId, channelId) {
  statements.upsertTranscriptChannel.run(guildId, channelId);
}

export function getTranscriptChannelId(guildId) {
  const settings = statements.getGuildSettings.get(guildId);
  return settings?.transcript_channel_id || null;
}

export function setFlaggedLogsChannel(guildId, channelId) {
  statements.upsertFlaggedLogsChannel.run(guildId, channelId);
}

export function getFlaggedLogsChannelId(guildId) {
  const settings = statements.getGuildSettings.get(guildId);
  return settings?.flagged_logs_channel_id || null;
}

export async function refreshMissedChannel(guild) {
  const settings = statements.getGuildSettings.get(guild.id);
  if (!settings?.missed_channel_id) return;

  const channel = await guild.channels.fetch(settings.missed_channel_id).catch(() => null);
  if (!channel) return;

  const users = statements.allUsers.all().filter((u) => u.missed_raids >= 2);
  const lines = users.length
    ? users.map((u) => `<@${u.discord_id}> (${u.roblox_username}) — ${u.missed_raids} missed raids`)
    : ['No users currently have 2 or more missed raids.'];

  const { buildContainer, componentsV2Payload, Colors } = await import('../components.js');
  const payload = componentsV2Payload(
    buildContainer({
      accentColor: Colors.warning,
      heading: 'Missed Raids (2+)',
      lines,
    })
  );

  if (settings.missed_message_id) {
    const existing = await channel.messages.fetch(settings.missed_message_id).catch(() => null);
    if (existing) {
      await existing.edit(payload);
      return;
    }
  }

  const sent = await channel.send(payload);
  statements.upsertMissedMessageId.run(guild.id, sent.id);
}
