import { SlashCommandBuilder } from 'discord.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import fetch from 'node-fetch';
import { statements } from '../db.js';
import { scanVideoForUsernames } from '../services/ocr.js';
import { writeCsv } from '../services/csv.js';
import { buildContainer, componentsV2Payload, button, Colors } from '../components.js';

export const data = new SlashCommandBuilder()
  .setName('raid_scan')
  .setDescription('Scan a raid attendance video for registered Roblox usernames')
  .addAttachmentOption((opt) =>
    opt.setName('video').setDescription('The raid video to scan').setRequired(true)
  );

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
