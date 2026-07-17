import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { statements } from '../db.js';
import { buildContainer, componentsV2Payload, Colors } from '../components.js';

export const raidStartData = new SlashCommandBuilder()
  .setName('raid-start')
  .setDescription('DM every server member that a raid is happening')
  .addChannelOption((o) =>
    o
      .setName('channel')
      .setDescription('The channel the raid is happening in')
      .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true)
  );

export async function runRaidStart({ guild, channel, startedBy, reply }) {
  const channelLink = `https://discord.com/channels/${guild.id}/${channel.id}`;
  const dmContent = (userId) => `<@${userId}> raid going on rn in #${channel.name}\n${channelLink}`;

  // Fetch all server members (not just registered ones)
  await guild.members.fetch();
  const members = guild.members.cache.filter((m) => !m.user.bot);

  if (!members.size) {
    await reply(
      componentsV2Payload(
        buildContainer({
          accentColor: Colors.warning,
          heading: 'No Members Found',
          lines: ['Could not fetch any server members.'],
        })
      )
    );
    return;
  }

  let delivered = 0;
  let failed = 0;

  for (const [, member] of members) {
    try {
      await member.send({ content: dmContent(member.user.id) });
      delivered++;
    } catch {
      // DMs closed or blocked — skip silently
      failed++;
    }
  }

  await reply(
    componentsV2Payload(
      buildContainer({
        accentColor: Colors.success,
        heading: 'Raid Start — Notifications Sent',
        lines: [
          `**Channel:** <#${channel.id}>`,
          `**Started by:** <@${startedBy}>`,
          '',
          `**Members DMed:** ${delivered}`,
          `**Couldn't reach:** ${failed} (DMs closed or bot blocked)`,
        ],
      })
    )
  );
}
