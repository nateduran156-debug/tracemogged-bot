import { SlashCommandBuilder } from 'discord.js';
import { statements } from '../db.js';
import { writeCsv } from '../services/csv.js';
import { buildContainer, componentsV2Payload, button, Colors } from '../components.js';

export const RAIDRESET_CONFIRM_ID = 'raidreset_confirm';
export const RAIDRESET_CANCEL_ID  = 'raidreset_cancel';

// ─── Slash command builders ───────────────────────────────────────────────────

export const attendanceData = new SlashCommandBuilder()
  .setName('attendance')
  .setDescription("Show a member's detailed raid attendance and points breakdown")
  .addUserOption((o) =>
    o.setName('member').setDescription('Member to look up').setRequired(true)
  );

export const resetMissedData = new SlashCommandBuilder()
  .setName('resetmissed')
  .setDescription("Reset a member's missed raid counter to zero")
  .addUserOption((o) =>
    o.setName('member').setDescription('Member to reset').setRequired(true)
  );

export const unflagData = new SlashCommandBuilder()
  .setName('unflag')
  .setDescription('Clear a member from enforcement tracking and reset their missed raid count')
  .addUserOption((o) =>
    o.setName('member').setDescription('Member to unflag').setRequired(true)
  );

export const demoteData = new SlashCommandBuilder()
  .setName('demote')
  .setDescription('Remove all promotion roles from a member')
  .addUserOption((o) =>
    o.setName('member').setDescription('Member to demote').setRequired(true)
  );

export const raidResetData = new SlashCommandBuilder()
  .setName('raidreset')
  .setDescription("Reset every member's missed raid counter — use at the start of a new period");

export const exportAllData = new SlashCommandBuilder()
  .setName('exportall')
  .setDescription('Export the full member roster as a CSV file');

// ─── attendance ───────────────────────────────────────────────────────────────

export function buildAttendancePayload(discordId, guildId) {
  const user = statements.getUser.get(discordId);
  if (!user) {
    return componentsV2Payload(
      buildContainer({
        accentColor: Colors.warning,
        heading: 'Not Registered',
        lines: [`<@${discordId}> is not registered.`],
      })
    );
  }

  const settings  = statements.getGuildSettings.get(guildId);
  const threshold = settings?.kick_threshold ?? 3;
  const loa       = statements.getLoa.get(discordId, guildId);
  const allRoles  = statements.allPromoRoles.all();
  const earned    = allRoles.filter((r) => user.promo_points >= r.points);
  const next      = allRoles.find((r) => user.promo_points < r.points);

  const flagStatus =
    user.missed_raids >= threshold
      ? `⚠️ flagged — ${user.missed_raids}/${threshold}`
      : user.missed_raids === threshold - 1
      ? `🟡 warning — ${user.missed_raids}/${threshold}`
      : `✅ clear — ${user.missed_raids}/${threshold}`;

  const lines = [
    `**Roblox:** ${user.roblox_username}`,
    `**Points:** ${user.promo_points}`,
    `**Raids Attended:** ${user.raids_attended}`,
    `**Missed Raids:** ${flagStatus}`,
    `**LOA:** ${loa ? `active — ${loa.reason}` : 'none'}`,
    '',
    earned.length
      ? `**Earned Roles (${earned.length}):** ${earned.map((r) => `<@&${r.role_id}>`).join(', ')}`
      : '**Earned Roles:** none',
    next
      ? `**Next Role:** <@&${next.role_id}> at ${next.points} pts — need ${next.points - user.promo_points} more`
      : '**Next Role:** at max rank',
    '',
    `**Registered:** ${user.registered_at.slice(0, 10)}`,
  ];

  return componentsV2Payload(
    buildContainer({
      accentColor: user.missed_raids >= threshold ? Colors.danger : Colors.info,
      heading: `Attendance — ${user.roblox_username}`,
      lines,
    })
  );
}

// ─── resetmissed ─────────────────────────────────────────────────────────────

export function buildResetMissedPayload(discordId, resetBy) {
  const user = statements.getUser.get(discordId);
  if (!user) {
    return componentsV2Payload(
      buildContainer({
        accentColor: Colors.warning,
        heading: 'Not Registered',
        lines: [`<@${discordId}> is not registered.`],
      })
    );
  }

  const prev = user.missed_raids;
  statements.resetMissed.run(discordId);

  return componentsV2Payload(
    buildContainer({
      accentColor: Colors.success,
      heading: 'Missed Raids Reset',
      lines: [
        `**Member:** <@${discordId}> (${user.roblox_username})`,
        `**Previous count:** ${prev}`,
        `**New count:** 0`,
        `**Reset by:** <@${resetBy}>`,
      ],
    })
  );
}

// ─── unflag ───────────────────────────────────────────────────────────────────

export function buildUnflagPayload(discordId, resetBy) {
  const user = statements.getUser.get(discordId);
  if (!user) {
    return {
      payload: componentsV2Payload(
        buildContainer({
          accentColor: Colors.warning,
          heading: 'Not Registered',
          lines: [`<@${discordId}> is not registered.`],
        })
      ),
      dmTarget: null,
    };
  }

  const prev = user.missed_raids;
  statements.resetMissed.run(discordId);
  statements.deleteFlaggedLogs.run(discordId);

  return {
    payload: componentsV2Payload(
      buildContainer({
        accentColor: Colors.success,
        heading: 'Member Unflagged',
        lines: [
          `**Member:** <@${discordId}> (${user.roblox_username})`,
          `**Missed raids cleared:** ${prev} → 0`,
          '**Enforcement log entries removed.**',
          `**Unflagged by:** <@${resetBy}>`,
        ],
      })
    ),
    dmTarget: discordId,
  };
}

// ─── demote ───────────────────────────────────────────────────────────────────

export async function buildDemotePayload(guild, discordId, demotedBy) {
  const user = statements.getUser.get(discordId);
  if (!user) {
    return componentsV2Payload(
      buildContainer({
        accentColor: Colors.warning,
        heading: 'Not Registered',
        lines: [`<@${discordId}> is not registered.`],
      })
    );
  }

  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) {
    return componentsV2Payload(
      buildContainer({
        accentColor: Colors.warning,
        heading: 'Member Not Found',
        lines: ['Could not find that member in this server.'],
      })
    );
  }

  const allRoles = statements.allPromoRoles.all();
  const removed  = [];

  for (const r of allRoles) {
    if (member.roles.cache.has(r.role_id)) {
      try {
        await member.roles.remove(r.role_id);
        const roleName = guild.roles.cache.get(r.role_id)?.name ?? r.role_id;
        removed.push(roleName);
      } catch {
        // Missing permissions or invalid role id — skip
      }
    }
  }

  if (!removed.length) {
    return componentsV2Payload(
      buildContainer({
        accentColor: Colors.neutral,
        heading: 'No Roles Removed',
        lines: [
          `**Member:** <@${discordId}> (${user.roblox_username})`,
          'This member does not hold any configured promotion roles.',
        ],
      })
    );
  }

  return componentsV2Payload(
    buildContainer({
      accentColor: Colors.warning,
      heading: 'Member Demoted',
      lines: [
        `**Member:** <@${discordId}> (${user.roblox_username})`,
        `**Roles removed (${removed.length}):** ${removed.join(', ')}`,
        `**Demoted by:** <@${demotedBy}>`,
        '',
        'Points are unchanged — use `.adjustpoints` to modify them if needed.',
      ],
    })
  );
}

// ─── raidreset ────────────────────────────────────────────────────────────────

export function buildRaidResetConfirmPayload(requestedBy) {
  const count = statements.allUsers.all().filter((u) => u.missed_raids > 0).length;
  return componentsV2Payload(
    buildContainer({
      accentColor: Colors.danger,
      heading: 'Raid Reset — Confirm',
      lines: [
        `This will reset missed raid counters for **${count}** member${count !== 1 ? 's' : ''} to zero.`,
        'Enforcement logs are kept for reference.',
        '',
        'This cannot be undone.',
        '',
        `Requested by: <@${requestedBy}>`,
      ],
      buttons: [
        button({ customId: RAIDRESET_CONFIRM_ID, label: 'Confirm Reset', style: 4 }),
        button({ customId: RAIDRESET_CANCEL_ID,  label: 'Cancel',        style: 2 }),
      ],
    })
  );
}

export function executeRaidReset(executedBy) {
  statements.resetAllMissed.run();
  return componentsV2Payload(
    buildContainer({
      accentColor: Colors.success,
      heading: 'Raid Reset Complete',
      lines: [
        'All missed raid counters have been reset to zero.',
        'Enforcement log history has been preserved.',
        '',
        `Executed by: <@${executedBy}>`,
      ],
    })
  );
}

// ─── exportall ────────────────────────────────────────────────────────────────

export function buildExportAllPayload() {
  const users = statements.allUsers.all();

  const filePath = writeCsv(`members-export-${Date.now()}.csv`, [
    'discord_id',
    'roblox_username',
    'roblox_user_id',
    'promo_points',
    'raids_attended',
    'missed_raids',
    'registered_at',
  ], users);

  return {
    ...componentsV2Payload(
      buildContainer({
        accentColor: Colors.info,
        heading: `Member Roster Export — ${users.length} member${users.length !== 1 ? 's' : ''}`,
        lines: [
          `**Total members:** ${users.length}`,
          '**Columns:** discord_id, roblox_username, roblox_user_id, promo_points, raids_attended, missed_raids, registered_at',
        ],
      })
    ),
    files: [filePath],
  };
}
