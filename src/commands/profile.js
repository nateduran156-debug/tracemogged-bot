import { SlashCommandBuilder } from 'discord.js';
import { statements } from '../db.js';
import { buildContainer, componentsV2Payload, Colors } from '../components.js';

export const profileData = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('View a member\'s profile')
  .addUserOption((o) => o.setName('member').setDescription('Member to view').setRequired(true));

export const profileAllData = new SlashCommandBuilder()
  .setName('profileall')
  .setDescription('View stats for every registered member');

export function buildProfilePayload(discordId) {
  const user = statements.getUser.get(discordId);
  if (!user) {
    return componentsV2Payload(
      buildContainer({
        accentColor: Colors.warning,
        heading: 'Profile',
        lines: [`<@${discordId}> is not registered yet.`],
      })
    );
  }

  return componentsV2Payload(
    buildContainer({
      accentColor: Colors.info,
      heading: `Profile — ${user.roblox_username}`,
      lines: [
        `**Discord:** <@${user.discord_id}>`,
        `**Roblox Username:** ${user.roblox_username}`,
        `**Promo Points:** ${user.promo_points}`,
        `**Raids Attended:** ${user.raids_attended}`,
        `**Missed Raids:** ${user.missed_raids}`,
      ],
    })
  );
}

export function buildProfileAllPayload() {
  const users = statements.allUsers.all();
  if (!users.length) {
    return componentsV2Payload(
      buildContainer({
        accentColor: Colors.warning,
        heading: 'All Profiles',
        lines: ['No registered users yet.'],
      })
    );
  }

  const lines = users.map(
    (u, i) =>
      `**${i + 1}. ${u.roblox_username}** — <@${u.discord_id}> | Points: ${u.promo_points} | Attended: ${u.raids_attended} | Missed: ${u.missed_raids}`
  );

  // Discord text displays are limited in length; chunk into multiple blocks if needed.
  const chunks = [];
  let current = [];
  let length = 0;
  for (const line of lines) {
    if (length + line.length > 3500) {
      chunks.push(current);
      current = [];
      length = 0;
    }
    current.push(line);
    length += line.length;
  }
  if (current.length) chunks.push(current);

  return chunks.map((chunk, idx) =>
    componentsV2Payload(
      buildContainer({
        accentColor: Colors.info,
        heading: idx === 0 ? 'All Profiles' : undefined,
        lines: chunk,
      })
    )
  );
}
