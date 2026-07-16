import { SlashCommandBuilder } from 'discord.js';
import { statements } from '../db.js';
import { buildContainer, componentsV2Payload, Colors } from '../components.js';

export const raidStatsData = new SlashCommandBuilder()
  .setName('raidstats')
  .setDescription('Overall raid statistics for this server');

export const raidHistoryData = new SlashCommandBuilder()
  .setName('raidhistory')
  .setDescription('List the 10 most recent raid scans');

export const adjustPointsData = new SlashCommandBuilder()
  .setName('adjustpoints')
  .setDescription('Add or remove promo points from a member')
  .addUserOption((o) =>
    o.setName('member').setDescription('Member to adjust').setRequired(true)
  )
  .addIntegerOption((o) =>
    o.setName('amount')
      .setDescription('Points to add (positive) or remove (negative), e.g. 5 or -3')
      .setRequired(true)
  );

export const setKickThresholdData = new SlashCommandBuilder()
  .setName('setkickthreshold')
  .setDescription('Set how many missed raids triggers a warning/auto-flag')
  .addIntegerOption((o) =>
    o.setName('threshold')
      .setDescription('Number of missed raids before flagging (e.g. 3)')
      .setMinValue(1)
      .setMaxValue(20)
      .setRequired(true)
  );

export const setPointValueData = new SlashCommandBuilder()
  .setName('setpointvalue')
  .setDescription('Set how many promo points each raid attendance is worth')
  .addIntegerOption((o) =>
    o.setName('points')
      .setDescription('Points awarded per raid attended (e.g. 2)')
      .setMinValue(1)
      .setMaxValue(100)
      .setRequired(true)
  );

export function buildRaidStatsPayload(guildId) {
  const allScans = statements.allRaidScans.all(guildId);
  const approved = allScans.filter((s) => s.status === 'approved');
  const pending = allScans.filter((s) => s.status === 'pending');
  const settings = statements.getGuildSettings.get(guildId);
  const pointValue = settings?.raid_point_value ?? 1;

  let totalAttended = 0;
  let totalAbsent = 0;

  for (const scan of approved) {
    totalAttended += JSON.parse(scan.detected_json).length;
    totalAbsent += JSON.parse(scan.absent_json).length;
  }

  const totalRaids = approved.length;
  const avgAttendance = totalRaids > 0 ? (totalAttended / totalRaids).toFixed(1) : '0';

  const allUsers = statements.allUsers.all();
  const top3 = allUsers.slice(0, 3);

  const lines = [
    `**Total Raids Approved:** ${totalRaids}`,
    `**Pending Scans:** ${pending.length}`,
    `**Total Attendance Logs:** ${totalAttended}`,
    `**Total Absences Logged:** ${totalAbsent}`,
    `**Avg Attendance Per Raid:** ${avgAttendance}`,
    `**Registered Members:** ${allUsers.length}`,
    `**Points Per Raid:** ${pointValue}`,
    '',
    '**Top 3 Members:**',
    ...top3.map((u, i) => `${i + 1}. ${u.roblox_username} — ${u.promo_points} pts, ${u.raids_attended} raids`),
  ];

  return componentsV2Payload(
    buildContainer({ accentColor: Colors.info, heading: 'Raid Stats', lines })
  );
}

export function buildRaidHistoryPayload(guildId) {
  const scans = statements.recentRaidScans.all(guildId);
  if (!scans.length) {
    return componentsV2Payload(
      buildContainer({ accentColor: Colors.neutral, heading: 'Raid History', lines: ['No scans recorded yet.'] })
    );
  }

  const statusEmoji = { approved: '✅', rejected: '❌', pending: '⏳' };

  const lines = scans.map((s) => {
    const attended = JSON.parse(s.detected_json).length;
    const absent = JSON.parse(s.absent_json).length;
    const date = s.created_at.slice(0, 10);
    const emoji = statusEmoji[s.status] || '?';
    const label = s.video_name === 'manual-entry' ? 'Manual' : s.video_name?.startsWith('group-') ? `Group ${s.video_name.slice(6)}` : s.video_name || 'Video';
    return `${emoji} **#${s.id}** — ${label} | ${attended} attended, ${absent} absent | ${date}`;
  });

  return componentsV2Payload(
    buildContainer({ accentColor: Colors.info, heading: 'Raid History — Last 10', lines })
  );
}

export function buildAdjustPointsPayload(discordId, amount) {
  const user = statements.getUser.get(discordId);
  if (!user) {
    return componentsV2Payload(
      buildContainer({ accentColor: Colors.warning, heading: 'Not Registered', lines: [`<@${discordId}> is not registered.`] })
    );
  }

  statements.addPromoPoints.run(amount, discordId);
  const updated = statements.getUser.get(discordId);

  const sign = amount >= 0 ? `+${amount}` : `${amount}`;
  return componentsV2Payload(
    buildContainer({
      accentColor: amount >= 0 ? Colors.success : Colors.warning,
      heading: 'Points Adjusted',
      lines: [
        `**Member:** <@${discordId}> (${user.roblox_username})`,
        `**Adjustment:** ${sign} points`,
        `**New Total:** ${updated.promo_points} points`,
      ],
    })
  );
}

export function buildSetKickThresholdPayload(guildId, threshold, setBy) {
  statements.upsertKickThreshold.run(guildId, threshold);
  return componentsV2Payload(
    buildContainer({
      accentColor: Colors.success,
      heading: 'Kick Threshold Set',
      lines: [
        `Members will be warned when they reach **${threshold - 1}** missed raids.`,
        `Members with **${threshold}+** missed raids are flagged for removal.`,
        `Set by: <@${setBy}>`,
      ],
    })
  );
}

export function buildSetPointValuePayload(guildId, points, setBy) {
  statements.upsertRaidPointValue.run(guildId, points);
  return componentsV2Payload(
    buildContainer({
      accentColor: Colors.success,
      heading: 'Raid Point Value Set',
      lines: [
        `Each raid attendance is now worth **${points}** promo point${points !== 1 ? 's' : ''}.`,
        `Set by: <@${setBy}>`,
      ],
    })
  );
}
