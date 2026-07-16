import { SlashCommandBuilder } from 'discord.js';
import { statements } from '../db.js';
import { verifyRobloxRegistration } from '../services/roblox.js';
import { buildContainer, componentsV2Payload, Colors } from '../components.js';

export const data = new SlashCommandBuilder()
  .setName('register')
  .setDescription('Link your Roblox username to your Discord account')
  .addStringOption((opt) =>
    opt.setName('username').setDescription('Your Roblox username').setRequired(true)
  );

export async function run({ interactionOrMessage, robloxUsername, discordId, reply }) {
  if (!robloxUsername) {
    await reply(
      componentsV2Payload(
        buildContainer({
          accentColor: Colors.warning,
          heading: 'How to register',
          lines: ['`.register (username)`', '', 'example: `.register tracemogged`'],
        })
      )
    );
    return;
  }

  const result = await verifyRobloxRegistration(robloxUsername).catch((err) => ({
    ok: false,
    reason: `Roblox lookup failed: ${err.message}`,
  }));

  if (!result.ok) {
    await reply(
      componentsV2Payload(
        buildContainer({
          accentColor: Colors.danger,
          heading: 'Registration Failed',
          lines: [result.reason],
        })
      )
    );
    return;
  }

  statements.upsertUser.run({
    discord_id: discordId,
    roblox_username: result.user.name,
    roblox_user_id: String(result.user.id),
  });

  await reply(
    componentsV2Payload(
      buildContainer({
        accentColor: Colors.success,
        heading: 'Registration Successful',
        lines: [`Registered **${result.user.name}** (ID: ${result.user.id}) to your Discord account.`],
      })
    )
  );
}
