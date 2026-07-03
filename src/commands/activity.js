import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { config } from '../config.js';
import { statements } from '../db.js';
import { writeCsv } from '../services/csv.js';
import { buildContainer, componentsV2Payload, button, Colors } from '../components.js';

export const activityCheckData = new SlashCommandBuilder()
  .setName('activity_check')
  .setDescription('Scrape reactions on a message and report who reacted vs missed')
  .addStringOption((o) => o.setName('message_link').setDescription('Link to the message').setRequired(true))
  .addRoleOption((o) => o.setName('role').setDescription('Role to check against').setRequired(true));

export const kickNonreactorsData = new SlashCommandBuilder()
  .setName('kick_nonreactors')
  .setDescription('Kick members of a role who did not react to a message')
  .addStringOption((o) => o.setName('message_link').setDescription('Link to the message').setRequired(true))
  .addRoleOption((o) => o.setName('role').setDescription('Role to check against').setRequired(true))
  .addStringOption((o) => o.setName('reason').setDescription('Kick reason').setRequired(true));

export const KICK_CONFIRM_ID = 'kick_confirm';
export const KICK_CANCEL_ID = 'kick_cancel';

function parseMessageLink(link) {
  const match = link.match(/channels\/(\d+)\/(\d+)\/(\d+)/);
  if (!match) return null;
  const [, guildId, channelId, messageId] = match;
  return { guildId, channelId, messageId };
}

export async function fetchReactedUserIds(guild, messageLink) {
  const parsed = parseMessageLink(messageLink);
  if (!parsed) throw new Error('Invalid message link.');

  const channel = await guild.channels.fetch(parsed.channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) throw new Error('Could not find that channel.');

  const message = await channel.messages.fetch(parsed.messageId).catch(() => null);
  if (!message) throw new Error('Could not find that message.');

  const reactedIds = new Set();
  for (const reaction of message.reactions.cache.values()) {
    const users = await reaction.users.fetch();
    for (const user of users.values()) {
      if (!user.bot) reactedIds.add(user.id);
    }
  }

  return reactedIds;
}

function isProtectedFromKick(member, guild) {
  if (member.id === guild.ownerId) return true;
  if (member.user.bot) return true;
  if (member.premiumSince) return true; // Nitro booster — never kicked.
  if (config.boosterRoleIds.some((rid) => member.roles.cache.has(rid))) return true;
  if (!member.kickable) return true;
  return false;
}

export async function runActivityCheck({ guild, messageLink, role }) {
  const reactedIds = await fetchReactedUserIds(guild, messageLink);
  const members = await guild.members.fetch();
  const roleMembers = members.filter((m) => m.roles.cache.has(role.id) && !m.user.bot);

  const reacted = [];
  const missing = [];

  for (const member of roleMembers.values()) {
    if (reactedIds.has(member.id)) {
      reacted.push(member);
    } else {
      missing.push(member);
    }
  }

  const rows = [
    ...reacted.map((m) => ({ user_id: m.id, username: m.user.tag, status: 'reacted' })),
    ...missing.map((m) => ({ user_id: m.id, username: m.user.tag, status: 'missing' })),
  ];

  const csvPath = writeCsv(
    `activity-check-${Date.now()}.csv`,
    ['user_id', 'username', 'status'],
    rows
  );

  return { reacted, missing, csvPath };
}

export function buildKickConfirmPayload({ role, missing, reason, protectedCount }) {
  return componentsV2Payload(
    buildContainer({
      accentColor: Colors.danger,
      heading: 'Confirm Kick: Non-Reactors',
      lines: [
        `Role: <@&${role.id}>`,
        `Reason: ${reason}`,
        `Members to kick: ${missing.length}`,
        protectedCount
          ? `Skipped (bots, owner, boosters, or unkickable): ${protectedCount}`
          : undefined,
        '',
        'This action cannot be undone. Confirm to proceed.',
      ].filter(Boolean),
      buttons: [
        button({ customId: KICK_CONFIRM_ID, label: 'Confirm Kick', style: 4 }),
        button({ customId: KICK_CANCEL_ID, label: 'Cancel', style: 2 }),
      ],
    })
  );
}

export async function kickNonReactors({ guild, missing, reason }) {
  let kicked = 0;
  let skipped = 0;

  for (const member of missing) {
    if (isProtectedFromKick(member, guild)) {
      skipped++;
      continue;
    }
    try {
      await member.kick(reason);
      kicked++;
    } catch {
      skipped++;
    }
  }

  return { kicked, skipped };
}

export { isProtectedFromKick };
