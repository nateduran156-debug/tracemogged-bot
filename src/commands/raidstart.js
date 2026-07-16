import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { statements } from '../db.js';
import { buildContainer, componentsV2Payload, Colors } from '../components.js';

export const raidStartData = new SlashCommandBuilder()
  .setName('raid-start')
  .setDescription('DM all registered members that a raid is happening')
  .addChannelOption((o) =>
    o
      .setName('channel')
      .setDescription('The channel the raid is happening in')
      .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true)
  );

export async function runRaidStart({ guild, channel, startedBy, reply }) {
  const allUsers = statements.allUsers.all();

  if (!allUsers.length) {
    await reply(
      componentsV2Payload(
        buildContainer({
          accentColor: Colors.warning,
          heading: 'No Registered Members',
          lines: ['No one is registered yet — nothing to send.'],
        })
      )
    );
    return;
  }

  const channelLink = `https://discord.com/channels/${guild.id}/${channel.id}`;
  const dmContent = `raid going on rn in #${channel.name}\n${channelLink}`;

  let delivered = 0;
  let failed = 0;

  for (const user of allUsers) {
    try {
      const member = await guild.members.fetch(user.discord_id).catch(() => null);
      if (!member) { failed++; continue; }
      await member.send({ content: dmContent });
      delivered++;
    } catch {
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
          '**Messages:**',
          `Delivered: ${delivered}`,
          `Not able to reach: ${failed}`,
        ],
      })
    )
  );
}
