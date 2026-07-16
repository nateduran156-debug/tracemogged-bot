import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { statements } from '../db.js';
import { buildContainer, componentsV2Payload, Colors } from '../components.js';

export const flaggedPlayerLogsData = new SlashCommandBuilder()
  .setName('flagged-player-logs')
  .setDescription('Show all members currently flagged by auto enforcement (at or above kick threshold)');

export const setFlaggedLogsChannelData = new SlashCommandBuilder()
  .setName('setflaggedlogschannel')
  .setDescription('Set the channel where auto enforcement flags are posted')
  .addChannelOption((o) =>
    o
      .setName('channel')
      .setDescription('Channel to post flagged player logs')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
  );

export function buildFlaggedPlayerLogsPayload(guildId) {
  const settings = statements.getGuildSettings.get(guildId);
  const threshold = settings?.kick_threshold ?? 3;
  const logsChannelId = settings?.flagged_logs_channel_id ?? null;

  const allUsers = statements.allUsers.all();
  const flagged = allUsers.filter((u) => u.missed_raids >= threshold);

  const lines = [];

  if (logsChannelId) {
    lines.push(`**Auto enforcement logs channel:** <#${logsChannelId}>`);
  } else {
    lines.push(`**Auto enforcement logs channel:** not set — use \`.setflaggedlogschannel #channel\``);
  }

  lines.push(`**Kick threshold:** ${threshold} missed raids`);
  lines.push('');

  if (!flagged.length) {
    lines.push('no members are currently flagged.');
  } else {
    lines.push(`**Flagged members (${flagged.length}):**`);
    for (const u of flagged) {
      lines.push(`— <@${u.discord_id}> (${u.roblox_username}) · missed **${u.missed_raids}** raids`);
    }
  }

  return componentsV2Payload(
    buildContainer({
      accentColor: flagged.length > 0 ? Colors.danger : Colors.neutral,
      heading: 'Flagged Player Logs',
      lines,
    })
  );
}

export function buildRecentEnforcementLogsPayload(guildId) {
  const logs = statements.listFlaggedLogs.all(guildId);

  if (!logs.length) {
    return componentsV2Payload(
      buildContainer({
        accentColor: Colors.neutral,
        heading: 'Enforcement Log History',
        lines: ['no enforcement actions have been logged yet.'],
      })
    );
  }

  const lines = logs.map((l) => {
    const date = l.logged_at.slice(0, 10);
    return `— <@${l.discord_id}> (${l.roblox_username}) · ${l.missed_raids}/${l.threshold} missed · scan #${l.scan_id} · ${date}`;
  });

  return componentsV2Payload(
    buildContainer({
      accentColor: Colors.warning,
      heading: `Enforcement Log History — last ${logs.length}`,
      lines,
    })
  );
}
