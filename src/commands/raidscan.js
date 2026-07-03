import { SlashCommandBuilder } from 'discord.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import fetch from 'node-fetch';
import { statements } from '../db.js';
import { scanVideoForUsernames } from '../services/ocr.js';
import { getGroupMemberUsernames } from '../services/roblox.js';
import { writeCsv } from '../services/csv.js';
import { buildContainer, componentsV2Payload, button, Colors } from '../components.js';

export const data = new SlashCommandBuilder()
  .setName('raid_scan')
  .setDescription('Scan a raid attendance video for registered Roblox usernames')
  .addAttachmentOption((opt) =>
    opt.setName('video').setDescription('The raid video to scan').setRequired(true)
  );

export const groupScanData = new SlashCommandBuilder()
  .setName('raid_groupscan')
  .setDescription('Mark everyone in a Roblox group as attended — no video needed')
  .addIntegerOption((o) =>
    o.setName('group_id').setDescription('The Roblox group ID to scan').setRequired(true)
  );

export const addAttendeeData = new SlashCommandBuilder()
  .setName('raid_addattendee')
  .setDescription('Manually mark a member as attended on a raid scan')
  .addIntegerOption((o) => o.setName('scan_id').setDescription('The scan ID to update').setRequired(true))
  .addUserOption((o) => o.setName('user').setDescription('The member to mark as attended').setRequired(true));

export const RAID_APPROVE_ID = 'raid_approve';
export const RAID_REJECT_ID = 'raid_reject';
export const RAID_EXPORT_ID = 'raid_export';

async function downloadAttachment(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download video (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
}

export async function runRaidScan({ guildId, createdBy, videoUrl, videoName, reply, editReply }) {
  const allUsers = statements.allUsers.all();
  if (!allUsers.length) {
    await reply({ content: 'No registered users found. Have people run `/register` first.' });
    return;
  }

  await reply(
    componentsV2Payload(
      buildContainer({
        accentColor: Colors.info,
        heading: 'Raid Scan Started',
        lines: ['Downloading and scanning the video. This may take a moment.'],
      })
    )
  );

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raidvideo-'));
  const tmpVideoPath = path.join(tmpDir, videoName || 'raid.mp4');

  try {
    await downloadAttachment(videoUrl, tmpVideoPath);

    const usernames = allUsers.map((u) => u.roblox_username);
    const { detected } = await scanVideoForUsernames(tmpVideoPath, usernames);

    const detectedSet = new Set(detected.map((d) => d.toLowerCase()));
    const absentUsers = allUsers.filter((u) => !detectedSet.has(u.roblox_username.toLowerCase()));

    const scanId = statements.insertRaidScan.run({
      guild_id: guildId,
      created_by: createdBy,
      video_name: videoName || 'raid.mp4',
      detected_json: JSON.stringify(detected),
      absent_json: JSON.stringify(absentUsers.map((u) => u.discord_id)),
    }).lastInsertRowid;

    const payload = componentsV2Payload(
      buildContainer({
        accentColor: Colors.warning,
        heading: `Raid Scan #${scanId} — Review Panel`,
        lines: [
          `**Video:** ${videoName || 'raid.mp4'}`,
          `**Detected Attendees:** ${detected.length}`,
          `**Absent / Not Found:** ${absentUsers.length}`,
        ],
        buttons: [
          button({ customId: `${RAID_APPROVE_ID}:${scanId}`, label: 'Approve Attendance', style: 3 }),
          button({ customId: `${RAID_REJECT_ID}:${scanId}`, label: 'Reject Scan', style: 4 }),
          button({ customId: `${RAID_EXPORT_ID}:${scanId}`, label: 'Export CSV', style: 2 }),
        ],
      })
    );

    await editReply(payload);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// scans all registered users against a roblox group — anyone in the group = attended
export async function runGroupScan({ guildId, createdBy, groupId, reply, editReply }) {
  const allUsers = statements.allUsers.all();
  if (!allUsers.length) {
    await reply(componentsV2Payload(
      buildContainer({ accentColor: Colors.warning, heading: 'No Registered Users', lines: ['Have members run `/register` first.'] })
    ));
    return;
  }

  await reply(componentsV2Payload(
    buildContainer({
      accentColor: Colors.info,
      heading: 'Group Scan Started',
      lines: [`Fetching members of Roblox group ${groupId}. This may take a moment.`],
    })
  ));

  const groupMembers = await getGroupMemberUsernames(groupId);

  const detected = [];
  const absentUsers = [];

  for (const user of allUsers) {
    if (groupMembers.has(user.roblox_username.toLowerCase())) {
      detected.push(user.roblox_username);
    } else {
      absentUsers.push(user);
    }
  }

  const scanId = statements.insertRaidScan.run({
    guild_id: guildId,
    created_by: createdBy,
    video_name: `group-${groupId}`,
    detected_json: JSON.stringify(detected),
    absent_json: JSON.stringify(absentUsers.map((u) => u.discord_id)),
  }).lastInsertRowid;

  const payload = componentsV2Payload(
    buildContainer({
      accentColor: Colors.warning,
      heading: `Group Scan #${scanId} — Review Panel`,
      lines: [
        `**Roblox Group:** ${groupId}`,
        `**In Group (Attended):** ${detected.length}`,
        `**Not in Group (Absent):** ${absentUsers.length}`,
      ],
      buttons: [
        button({ customId: `${RAID_APPROVE_ID}:${scanId}`, label: 'Approve Attendance', style: 3 }),
        button({ customId: `${RAID_REJECT_ID}:${scanId}`, label: 'Reject Scan', style: 4 }),
        button({ customId: `${RAID_EXPORT_ID}:${scanId}`, label: 'Export CSV', style: 2 }),
      ],
    })
  );

  await editReply(payload);
}

// lets staff manually add someone the OCR missed
export function addAttendeToScan(scanId, discordId) {
  const scan = statements.getRaidScan.get(scanId);
  if (!scan) return { ok: false, reason: `No scan found with ID ${scanId}.` };

  const user = statements.getUser.get(discordId);
  if (!user) return { ok: false, reason: `<@${discordId}> is not registered.` };

  const detected = JSON.parse(scan.detected_json);
  const absentIds = JSON.parse(scan.absent_json);

  if (detected.includes(user.roblox_username)) {
    return { ok: false, reason: `${user.roblox_username} is already marked as attended.` };
  }

  detected.push(user.roblox_username);
  const newAbsent = absentIds.filter((id) => id !== discordId);

  statements.updateRaidScanDetected.run(JSON.stringify(detected), JSON.stringify(newAbsent), scanId);
  return { ok: true, username: user.roblox_username };
}

export function exportRaidScanCsv(scan) {
  const detected = JSON.parse(scan.detected_json);
  const absentIds = JSON.parse(scan.absent_json);
  const absentUsers = absentIds
    .map((id) => statements.getUser.get(id))
    .filter(Boolean);

  const rows = [
    ...detected.map((username) => ({ roblox_username: username, status: 'attended' })),
    ...absentUsers.map((u) => ({ roblox_username: u.roblox_username, status: 'absent' })),
  ];

  return writeCsv(`raid-scan-${scan.id}.csv`, ['roblox_username', 'status'], rows);
}
