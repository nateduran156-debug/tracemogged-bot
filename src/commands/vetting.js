import { SlashCommandBuilder } from 'discord.js';
import { statements } from '../db.js';
import { VETTING_LIST_TYPES, getVettingList } from '../tickets.js';
import { buildContainer, componentsV2Payload, Colors } from '../components.js';

const TYPE_CHOICES = [
  { name: 'Opponent crew', value: VETTING_LIST_TYPES.OPPONENT_CREW },
  { name: 'Opponent Roblox group ID', value: VETTING_LIST_TYPES.OPPONENT_ROBLOX_GROUP },
  { name: 'Blacklisted Roblox username', value: VETTING_LIST_TYPES.BLACKLISTED_ROBLOX_USER },
  { name: 'Blacklisted Discord ID', value: VETTING_LIST_TYPES.BLACKLISTED_DISCORD_ID },
];

export const data = new SlashCommandBuilder()
  .setName('vetting')
  .setDescription('Manage verification vetting lists (opponent crews/groups, blacklists)')
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Add an entry to a vetting list')
      .addStringOption((o) => o.setName('type').setDescription('List type').setRequired(true).addChoices(...TYPE_CHOICES))
      .addStringOption((o) => o.setName('value').setDescription('Value to add').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Remove an entry from a vetting list')
      .addStringOption((o) => o.setName('type').setDescription('List type').setRequired(true).addChoices(...TYPE_CHOICES))
      .addStringOption((o) => o.setName('value').setDescription('Value to remove').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('list')
      .setDescription('List entries in a vetting list')
      .addStringOption((o) => o.setName('type').setDescription('List type').setRequired(true).addChoices(...TYPE_CHOICES))
  );

export function typeFromArg(arg) {
  const lower = arg.toLowerCase();
  return Object.values(VETTING_LIST_TYPES).find((t) => t === lower) || null;
}

export function handleAdd(guildId, type, value, addedBy) {
  statements.addVettingEntry.run(guildId, type, value, addedBy);
  return listPayload(guildId, type);
}

export function handleRemove(guildId, type, value) {
  statements.removeVettingEntry.run(guildId, type, value);
  return listPayload(guildId, type);
}

export function listPayload(guildId, type) {
  const entries = getVettingList(guildId, type);
  return componentsV2Payload(
    buildContainer({
      accentColor: Colors.info,
      heading: `Vetting List: ${type}`,
      lines: entries.length ? entries.map((e) => `- ${e}`) : ['No entries.'],
    })
  );
}
