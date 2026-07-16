import {
  ChannelType,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { config, robloxGroupJoinUrl, robloxProfileUrl } from './config.js';
import { statements } from './db.js';
import { buildContainer, componentsV2Payload, button, Colors } from './components.js';
import {
  getRobloxUserByUsername,
  getUserGroups,
  getUserFriends,
} from './services/roblox.js';
import { RAID_TICKET_CATEGORY_ID } from './commands/raidticket.js';

export const TICKET_OPEN_BUTTON_ID = 'ticket_open';
export const TICKET_MODAL_ID = 'ticket_verification_modal';

export const VETTING_LIST_TYPES = {
  OPPONENT_CREW: 'opponent_crew',
  OPPONENT_ROBLOX_GROUP: 'opponent_roblox_group',
  BLACKLISTED_ROBLOX_USER: 'blacklisted_roblox_user',
  BLACKLISTED_DISCORD_ID: 'blacklisted_discord_id',
};

const SEED_BY_TYPE = {
  [VETTING_LIST_TYPES.OPPONENT_CREW]: () => config.seedOpponentCrews,
  [VETTING_LIST_TYPES.OPPONENT_ROBLOX_GROUP]: () => config.seedOpponentRobloxGroupIds,
  [VETTING_LIST_TYPES.BLACKLISTED_ROBLOX_USER]: () => config.seedBlacklistedRobloxUsernames,
  [VETTING_LIST_TYPES.BLACKLISTED_DISCORD_ID]: () => config.seedBlacklistedDiscordIds,
};

export function getVettingList(guildId, listType) {
  const rows = statements.listVettingEntries.all(guildId, listType);
  if (rows.length) return rows.map((r) => r.value);
  return SEED_BY_TYPE[listType]?.() || [];
}

export function buildTicketPanel() {
  const container = buildContainer({
    accentColor: Colors.info,
    heading: 'Verification',
    lines: [
      'Press the button below to open a private verification ticket.',
      'A staff member will review your application shortly.',
    ],
    buttons: [button({ customId: TICKET_OPEN_BUTTON_ID, label: 'Open Ticket', style: 3 })],
  });
  return componentsV2Payload(container);
}

export function buildVerificationModal() {
  const modal = new ModalBuilder().setCustomId(TICKET_MODAL_ID).setTitle('Verification Application');

  const robloxInput = new TextInputBuilder()
    .setCustomId('roblox_username')
    .setLabel('Roblox Username')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const opposingInput = new TextInputBuilder()
    .setCustomId('opposing_crews')
    .setLabel('Are you in Opposing crews?')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const activeInput = new TextInputBuilder()
    .setCustomId('will_be_active')
    .setLabel('Will u be active?')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const invitedInput = new TextInputBuilder()
    .setCustomId('invited_by')
    .setLabel('Who invited u here?')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(robloxInput),
    new ActionRowBuilder().addComponents(opposingInput),
    new ActionRowBuilder().addComponents(activeInput),
    new ActionRowBuilder().addComponents(invitedInput)
  );

  return modal;
}

export async function createTicketChannel(guild, member) {
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: member.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
    {
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  const channelName = `ticket-${member.id}`;
  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: config.ticketCategoryId || undefined,
    permissionOverwrites: overwrites,
  });

  return channel;
}

/**
 * Create a raid ticket channel in the raid ticket category.
 */
export async function createRaidTicketChannel(guild, member, robloxUsername) {
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: member.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
    {
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  const channelName = `raid-${member.user.username}`.slice(0, 100);
  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: RAID_TICKET_CATEGORY_ID,
    permissionOverwrites: overwrites,
  });

  return channel;
}

/**
 * Build the award panel shown when a proof image is posted in a raid ticket channel.
 */
export function buildAwardPanel({ robloxUsername, targetDiscordId, amount, proofMessageId }) {
  const userLabel = targetDiscordId ? `<@${targetDiscordId}>` : robloxUsername;
  return componentsV2Payload(
    buildContainer({
      accentColor: Colors.info,
      heading: 'Proof Submitted',
      lines: [
        `**Member:** ${userLabel}`,
        `**Roblox:** ${robloxUsername}`,
        `**Points to Award:** ${amount}`,
      ],
      buttons: [
        button({ customId: `award_minus:${proofMessageId}`, label: '− 1', style: 2 }),
        button({ customId: `award_plus:${proofMessageId}`, label: '+ 1', style: 2 }),
        button({ customId: `award_yes:${proofMessageId}`, label: 'Award', style: 3 }),
        button({ customId: `award_no:${proofMessageId}`, label: 'Dismiss', style: 4 }),
      ],
    }),
  );
}

function fieldBlock(label, value) {
  return `**${label}**\n${value}`;
}

export function buildTicketReviewPayload({ answers, verdict, ticketChannelId, applicantId }) {
  const robloxLine = verdict.robloxUser
    ? `${answers.roblox_username} - [Roblox Profile](${robloxProfileUrl(verdict.robloxUser.id)})`
    : answers.roblox_username;

  const accentColor = !verdict.requiredGroupOk ? Colors.danger : Colors.black;

  const answersContainer = buildContainer({
    accentColor,
    heading: '📝 Verification Application',
    lines: [
      fieldBlock('Roblox Username', robloxLine),
      '',
      fieldBlock('Are you in Opposing crews?', answers.opposing_crews),
      '',
      fieldBlock('Will u be active?', answers.will_be_active),
      '',
      fieldBlock('Who Invited u here?', answers.invited_by),
    ],
  });

  const checksContainer = buildContainer({
    accentColor,
    heading: '🔍 Automated Checks',
    lines: ['```', ...verdict.lines, '', `Verdict: Subject Passed ${verdict.passed} / ${verdict.total} tests.`, '```'],
  });

  const verdictLines = [];
  if (applicantId) verdictLines.push(`Applicant: <@${applicantId}>`);
  if (ticketChannelId) verdictLines.push(`Ticket: <#${ticketChannelId}>`);
  if (applicantId) verdictLines.push(`Verify with: \`.verify <@${applicantId}>\``);

  const verdictContainer = buildContainer({
    accentColor: verdict.passed === verdict.total ? Colors.success : accentColor,
    heading: verdict.passed === verdict.total ? '✅ All Checks Passed' : `⚠️ Passed ${verdict.passed} / ${verdict.total} Checks`,
    lines: verdictLines,
  });

  const containers = [answersContainer, checksContainer, verdictContainer];

  if (!verdict.requiredGroupOk && applicantId) {
    containers.push(
      buildContainer({
        accentColor: Colors.warning,
        heading: 'Group Join Request',
        lines: [
          `<@${applicantId}> - You have not joined our Roblox group yet.`,
          'Press **Join** below, request to join, then wait for staff to accept.',
        ],
        buttons: [button({ label: 'Join', url: robloxGroupJoinUrl() })],
      })
    );
  }

  return componentsV2Payload(containers);
}

export async function runVerificationChecks(answers, member, guildId) {
  const lines = [];
  let passed = 0;
  const total = 6;

  const opponentCrews = getVettingList(guildId, VETTING_LIST_TYPES.OPPONENT_CREW);
  const opponentGroupIds = getVettingList(guildId, VETTING_LIST_TYPES.OPPONENT_ROBLOX_GROUP);
  const blacklistedRobloxUsers = getVettingList(guildId, VETTING_LIST_TYPES.BLACKLISTED_ROBLOX_USER);
  const blacklistedDiscordIds = getVettingList(guildId, VETTING_LIST_TYPES.BLACKLISTED_DISCORD_ID);

  const displayName = member?.user?.username || answers.roblox_username;

  lines.push(`[*] Checking if ${displayName} is in any opponent crews..`);
  const crewMatches = opponentCrews.filter((crew) =>
    answers.opposing_crews.toLowerCase().includes(crew.toLowerCase())
  );
  if (crewMatches.length) {
    lines.push(`[-] ${displayName} is in opponent crew(s): ${crewMatches.join(', ')}`);
  } else {
    passed++;
    lines.push(`[+] ${displayName} is not in any opponent crews.`);
  }
  lines.push('');

  let robloxUser = null;
  let robloxGroups = [];
  let robloxFriends = [];
  let robloxLookupError = null;
  try {
    robloxUser = await getRobloxUserByUsername(answers.roblox_username);
    if (robloxUser) {
      robloxGroups = await getUserGroups(robloxUser.id).catch(() => []);
      robloxFriends = await getUserFriends(robloxUser.id).catch(() => []);
    }
  } catch (err) {
    robloxLookupError = err.message;
  }

  lines.push(`[*] Checking if ${answers.roblox_username} is in any opponent Roblox groups..`);
  if (!robloxUser) {
    lines.push(`[-] Could not look up ${answers.roblox_username} on Roblox${robloxLookupError ? `: ${robloxLookupError}` : '.'}`);
  } else {
    const matchedGroups = robloxGroups.filter((g) => opponentGroupIds.includes(g.id));
    if (matchedGroups.length) {
      lines.push(`[-] ${answers.roblox_username} is in opponent Roblox group(s): ${matchedGroups.map((g) => g.name || g.id).join(', ')}`);
    } else {
      passed++;
      lines.push(`[+] ${answers.roblox_username} is not in any opponent Roblox groups.`);
    }
  }
  lines.push('');

  lines.push(`[*] Checking if ${answers.roblox_username} is friends with any blacklisted users..`);
  if (!robloxUser) {
    lines.push(`[-] Could not check friends — Roblox account not found.`);
  } else {
    const lowerBlacklist = blacklistedRobloxUsers.map((u) => u.toLowerCase());
    const matchedFriends = robloxFriends.filter((f) => lowerBlacklist.includes(f.name.toLowerCase()));
    if (matchedFriends.length) {
      lines.push(`[-] ${answers.roblox_username} is friends with blacklisted Roblox user(s): ${matchedFriends.map((f) => f.name).join(', ')}`);
    } else {
      passed++;
      lines.push(`[+] ${answers.roblox_username} is not friends with any blacklisted Roblox users.`);
    }
  }
  lines.push('');

  lines.push(`[*] Checking if ${displayName}'s Discord account is an alt..`);
  if (member?.user?.createdTimestamp) {
    const ageDays = Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24));
    if (ageDays < config.altAccountDays) {
      lines.push(`[-] ${displayName}'s Discord account is ${ageDays} day(s) old (younger than ${config.altAccountDays} days).`);
    } else {
      passed++;
      lines.push(`[+] ${displayName}'s Discord account is older than ${config.altAccountDays} days.`);
    }
  } else {
    lines.push(`[-] Could not determine Discord account age.`);
  }
  lines.push('');

  lines.push(`[*] Checking ${displayName}'s discord mutuals..`);
  const mutualHits = [];
  if (member?.client && blacklistedDiscordIds.length) {
    for (const guild of member.client.guilds.cache.values()) {
      const isMember = guild.members.cache.has(member.id) || (await guild.members.fetch(member.id).then(() => true).catch(() => false));
      if (!isMember) continue;
      for (const blacklistedId of blacklistedDiscordIds) {
        const hasBlacklisted =
          guild.members.cache.has(blacklistedId) ||
          (await guild.members.fetch(blacklistedId).then(() => true).catch(() => false));
        if (hasBlacklisted && !mutualHits.includes(blacklistedId)) mutualHits.push(blacklistedId);
      }
    }
  }
  if (mutualHits.length) {
    lines.push(`[-] Found blacklisted user(s) in mutual servers: ${mutualHits.map((id) => `<@${id}>`).join(', ')}`);
  } else {
    passed++;
    lines.push('[+] No blacklisted users found.');
  }
  lines.push('');

  lines.push(`[*] Checking if ${answers.roblox_username} is in the Roblox group..`);
  let requiredGroupOk = false;
  if (!robloxUser) {
    lines.push(`[-] ${answers.roblox_username} could not be found on Roblox.`);
  } else {
    requiredGroupOk = robloxGroups.some((g) => g.id === String(config.robloxGroupId));
    if (requiredGroupOk) {
      passed++;
      lines.push(`[+] ${answers.roblox_username} is in the Roblox group.`);
    } else {
      lines.push(`[-] ${answers.roblox_username} is not in the Roblox group.`);
    }
  }

  return { lines, passed, total, requiredGroupOk, robloxUser };
}

export async function sendTranscript(guild, channel, guildId) {
  const settings = statements.getGuildSettings.get(guildId);
  if (!settings?.transcript_channel_id) return;

  const transcriptCh = await guild.channels.fetch(settings.transcript_channel_id).catch(() => null);
  if (!transcriptCh || !transcriptCh.isTextBased()) return;

  const fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!fetched) return;

  const ticket = statements.getTicket.get(channel.id);
  const msgs = [...fetched.values()].reverse();

  let transcript = `TICKET TRANSCRIPT\n`;
  transcript += `Channel: #${channel.name}\n`;
  if (ticket) transcript += `User ID: ${ticket.user_id}\n`;
  transcript += `Closed: ${new Date().toUTCString()}\n`;
  transcript += `\n${'='.repeat(40)}\n\n`;

  for (const msg of msgs) {
    const time = new Date(msg.createdTimestamp).toUTCString();
    const content = msg.content || '[component/embed]';
    transcript += `[${time}] ${msg.author.tag}: ${content}\n`;
  }

  const { AttachmentBuilder } = await import('discord.js');
  const file = new AttachmentBuilder(Buffer.from(transcript, 'utf8'), {
    name: `transcript-${channel.name}.txt`,
  });

  const ping = ticket ? `<@${ticket.user_id}>` : channel.name;
  await transcriptCh
    .send({ content: `Transcript for ${ping}`, files: [file] })
    .catch((err) => console.error('Failed to send transcript:', err));
}

export async function verifyUser(guild, userId) {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { ok: false, reason: 'Could not find that member in this server.' };

  const roleIds = config.verifyRoleIds;
  if (!roleIds.length) return { ok: false, reason: 'No verify role IDs are configured.' };

  await member.roles.add(roleIds).catch((err) => {
    throw new Error(`Failed to add roles: ${err.message}`);
  });

  const ticket = statements.getOpenTicketByUser.get(userId, guild.id);
  if (ticket) {
    statements.markTicketVerified.run(ticket.channel_id);
    const channelId = ticket.channel_id;
    setTimeout(async () => {
      const ch = await guild.channels.fetch(channelId).catch(() => null);
      if (!ch) return;
      await ch
        .send(
          componentsV2Payload(
            buildContainer({
              accentColor: Colors.neutral,
              heading: 'Ticket Closing',
              lines: [`<@${userId}> has been verified. This ticket will be deleted in 30 seconds.`],
            })
          )
        )
        .catch(() => {});
      await new Promise((r) => setTimeout(r, 30_000));
      await sendTranscript(guild, ch, guild.id);
      await ch.delete('Auto-closed after verification').catch(() => {});
    }, 0);
  }

  return { ok: true, member };
}
