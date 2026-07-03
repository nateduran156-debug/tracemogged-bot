import { SlashCommandBuilder } from 'discord.js';
import { statements } from '../db.js';
import { buildContainer, componentsV2Payload, Colors } from '../components.js';

export const data = new SlashCommandBuilder()
  .setName('lookup')
  .setDescription('Find which Discord account is linked to a Roblox username')
  .addStringOption((o) =>
    o.setName('username').setDescription('Roblox username to search for').setRequired(true)
  );

export function runLookup(robloxUsername) {
  const user = statements.getUserByRoblox.get(robloxUsername.toLowerCase());

  if (!user) {
    return componentsV2Payload(
      buildContainer({
        accentColor: Colors.warning,
        heading: 'Not Found',
        lines: [`No registered user found with the Roblox username **${robloxUsername}**.`],
      })
    );
  }

  return componentsV2Payload(
    buildContainer({
      accentColor: Colors.info,
      heading: `Lookup — ${user.roblox_username}`,
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
