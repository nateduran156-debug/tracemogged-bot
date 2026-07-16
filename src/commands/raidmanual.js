import {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { statements } from '../db.js';
import { buildContainer, componentsV2Payload, button, Colors } from '../components.js';
import { RAID_APPROVE_ID, RAID_REJECT_ID, RAID_EXPORT_ID } from './raidscan.js';

export const RAID_MANUAL_MODAL_ID = 'raid_manual_modal';

export const data = new SlashCommandBuilder()
  .setName('raid_manual')
  .setDescription('Manually enter raid attendees and absent members');

export function buildRaidManualModal() {
  const modal = new ModalBuilder()
    .setCustomId(RAID_MANUAL_MODAL_ID)
    .setTitle('Manual Raid Entry');

  const attendedInput = new TextInputBuilder()
    .setCustomId('attended')
    .setLabel('Attended — Discord mentions or Roblox usernames')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('@User1 @User2 or RobloxName1 RobloxName2 (space/newline separated)')
    .setRequired(false);

  const absentInput = new TextInputBuilder()
    .setCustomId('absent')
    .setLabel('Absent — Discord mentions or Roblox usernames')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('@User3 @User4 or RobloxName3 RobloxName4 (space/newline separated)')
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(attendedInput),
    new ActionRowBuilder().addComponents(absentInput),
  );

  return modal;
}

/**
 * Parse a raw text block into { discordIds: string[], robloxUsernames: string[] }.
 * Accepts Discord mentions (<@id> or <@!id>) and plain tokens treated as Roblox usernames.
 */
function parseUserField(raw = '') {
  const tokens = raw.split(/[\s,\n]+/).filter(Boolean);
  const discordIds = [];
  const robloxUsernames = [];

  for (const token of tokens) {
    const mentionMatch = token.match(/^<@!?(\d+)>$/);
    if (mentionMatch) {
      discordIds.push(mentionMatch[1]);
    } else if (/^\d{15,20}$/.test(token)) {
      // Raw snowflake ID
      discordIds.push(token);
    } else if (/^[a-zA-Z0-9_]{1,20}$/.test(token)) {
      robloxUsernames.push(token);
    }
  }

  return { discordIds, robloxUsernames };
}

/**
 * Resolve a list of Discord IDs + Roblox usernames to registered users.
 * Returns { found: User[], notFound: string[] }
 */
function resolveUsers(discordIds, robloxUsernames) {
  const seen = new Set();
  const found = [];
  const notFound = [];

  for (const id of discordIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const user = statements.getUser.get(id);
    if (user) {
      found.push(user);
    } else {
      notFound.push(`<@${id}>`);
    }
  }

  for (const uname of robloxUsernames) {
    const user = statements.getUserByRoblox.get(uname);
    if (user) {
      if (seen.has(user.discord_id)) continue;
      seen.add(user.discord_id);
      found.push(user);
    } else {
      notFound.push(uname);
    }
  }

  return { found, notFound };
}

/**
 * Process a manual raid modal submission.
 * Creates a scan record and returns a review panel payload.
 */
export async function processManualModal({ guildId, createdBy, attendedRaw, absentRaw, reply }) {
  const attendedParsed = parseUserField(attendedRaw);
  const absentParsed = parseUserField(absentRaw);

  const { found: attendedUsers, notFound: attendedMissing } = resolveUsers(
    attendedParsed.discordIds,
    attendedParsed.robloxUsernames,
  );
  const { found: absentUsers, notFound: absentMissing } = resolveUsers(
    absentParsed.discordIds,
    absentParsed.robloxUsernames,
  );

  const detected = attendedUsers.map((u) => u.roblox_username);
  const absentIds = absentUsers.map((u) => u.discord_id);

  const scanId = statements.insertRaidScan.run({
    guild_id: guildId,
    created_by: createdBy,
    video_name: 'manual-entry',
    detected_json: JSON.stringify(detected),
    absent_json: JSON.stringify(absentIds),
  }).lastInsertRowid;

  const lines = [
    `**Attended:** ${attendedUsers.length}`,
    `**Absent:** ${absentUsers.length}`,
  ];

  if (attendedMissing.length) {
    lines.push(`⚠ Not registered (attended field): ${attendedMissing.join(', ')}`);
  }
  if (absentMissing.length) {
    lines.push(`⚠ Not registered (absent field): ${absentMissing.join(', ')}`);
  }

  const payload = componentsV2Payload(
    buildContainer({
      accentColor: Colors.warning,
      heading: `Manual Scan #${scanId} — Review Panel`,
      lines,
      buttons: [
        button({ customId: `${RAID_APPROVE_ID}:${scanId}`, label: 'Approve', style: 3 }),
        button({ customId: `${RAID_REJECT_ID}:${scanId}`, label: 'Reject', style: 4 }),
        button({ customId: `${RAID_EXPORT_ID}:${scanId}`, label: 'Export CSV', style: 2 }),
      ],
    }),
  );

  await reply(payload);
}

/**
 * Parse inline text for the prefix command: `.raid_manual attended ... | absent ...`
 */
export async function runPrefixManual({ guildId, createdBy, rawText, reply }) {
  const lower = rawText.toLowerCase();
  const sepIdx = lower.indexOf('|');

  let attendedRaw = '';
  let absentRaw = '';

  if (sepIdx !== -1) {
    attendedRaw = rawText.slice(0, sepIdx).replace(/^attended\s*/i, '').trim();
    absentRaw = rawText.slice(sepIdx + 1).replace(/^absent\s*/i, '').trim();
  } else {
    // Everything treated as attended
    attendedRaw = rawText.replace(/^attended\s*/i, '').trim();
  }

  if (!attendedRaw && !absentRaw) {
    await reply(
      componentsV2Payload(
        buildContainer({
          accentColor: Colors.warning,
          heading: 'Usage',
          lines: [
            '`.raid_manual attended @User1 @User2 | absent @User3`',
            'Use Discord mentions or Roblox usernames. Separate attended and absent with `|`.',
            '',
            'Or use the slash command `/raid_manual` for a form-based UI.',
          ],
        }),
      ),
    );
    return;
  }

  await processManualModal({ guildId, createdBy, attendedRaw, absentRaw, reply });
}
