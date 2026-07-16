import { SlashCommandBuilder } from 'discord.js';
import { statements } from '../db.js';
import { buildContainer, componentsV2Payload, Colors } from '../components.js';

export const loaData = new SlashCommandBuilder()
  .setName('loa')
  .setDescription('Log a leave of absence for a member — they won\'t be penalized for missed raids')
  .addUserOption((o) =>
    o.setName('member').setDescription('Member going on LOA').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('reason').setDescription('Reason for LOA').setRequired(true)
  );

export const loaEndData = new SlashCommandBuilder()
  .setName('loa-end')
  .setDescription('Remove a member\'s active leave of absence')
  .addUserOption((o) =>
    o.setName('member').setDescription('Member coming back from LOA').setRequired(true)
  );

export const checkLoaData = new SlashCommandBuilder()
  .setName('check-loa')
  .setDescription('List all members currently on leave of absence');

export function addLoa(guildId, discordId, reason, addedBy) {
  statements.insertLoa.run(discordId, guildId, reason, addedBy);
}

export function removeLoa(guildId, discordId) {
  statements.removeLoa.run(discordId, guildId);
}

export function isOnLoa(guildId, discordId) {
  return Boolean(statements.getLoa.get(discordId, guildId));
}

export function buildLoaPayload(guildId, discordId, reason, addedBy) {
  return componentsV2Payload(
    buildContainer({
      accentColor: Colors.info,
      heading: 'Leave of Absence Logged',
      lines: [
        `**Member:** <@${discordId}>`,
        `**Reason:** ${reason}`,
        `**Logged by:** <@${addedBy}>`,
        '',
        'They won\'t be penalized for missed raids while on LOA.',
      ],
    })
  );
}

export function buildLoaEndPayload(discordId) {
  return componentsV2Payload(
    buildContainer({
      accentColor: Colors.success,
      heading: 'LOA Ended',
      lines: [`<@${discordId}> is back — missed raid tracking resumed.`],
    })
  );
}

export function buildCheckLoaPayload(guildId) {
  const entries = statements.listLoas.all(guildId);
  if (!entries.length) {
    return componentsV2Payload(
      buildContainer({
        accentColor: Colors.neutral,
        heading: 'Leave of Absence',
        lines: ['No members are currently on LOA.'],
      })
    );
  }

  const lines = entries.map(
    (e) => `<@${e.discord_id}> — ${e.reason} _(logged by <@${e.added_by}> on ${e.added_at.slice(0, 10)})_`
  );

  return componentsV2Payload(
    buildContainer({
      accentColor: Colors.info,
      heading: `Leave of Absence — ${entries.length} active`,
      lines,
    })
  );
}
