import { SlashCommandBuilder } from 'discord.js';
import { verifyUser } from '../tickets.js';
import { buildContainer, componentsV2Payload, Colors } from '../components.js';

export const data = new SlashCommandBuilder()
  .setName('verify')
  .setDescription('Verify a user and grant them the verified roles')
  .addUserOption((o) => o.setName('user').setDescription('User to verify').setRequired(true));

export async function runVerify(guild, userId) {
  try {
    const result = await verifyUser(guild, userId);
    if (!result.ok) {
      return componentsV2Payload(
        buildContainer({ accentColor: Colors.warning, heading: 'Verify Failed', lines: [result.reason] })
      );
    }
    return componentsV2Payload(
      buildContainer({
        accentColor: Colors.success,
        heading: 'User Verified',
        lines: [`<@${userId}> has been verified and given the verified roles.`],
      })
    );
  } catch (err) {
    return componentsV2Payload(
      buildContainer({ accentColor: Colors.danger, heading: 'Verify Failed', lines: [err.message] })
    );
  }
}
