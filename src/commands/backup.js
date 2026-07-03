import { SlashCommandBuilder } from 'discord.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import fetch from 'node-fetch';
import { db, statements } from '../db.js';
import { buildContainer, componentsV2Payload, Colors } from '../components.js';

export const backupData = new SlashCommandBuilder()
  .setName('backup')
  .setDescription('Export all bot data to a backup file');

export const restoreData = new SlashCommandBuilder()
  .setName('restore')
  .setDescription('Restore bot data from a backup file')
  .addAttachmentOption((o) =>
    o.setName('file').setDescription('The backup .json file to restore from').setRequired(true)
  );

export function runBackup() {
  const data = {
    version: 1,
    exported_at: new Date().toISOString(),
    users: statements.backupUsers.all(),
    promo_roles: statements.backupPromoRoles.all(),
    guild_settings: statements.backupGuildSettings.all(),
    whitelist: statements.backupWhitelist.all(),
    raid_scans: statements.backupRaidScans.all(),
    tickets: statements.backupTickets.all(),
    vetting_lists: statements.backupVettingLists.all(),
    protected_roles: statements.backupProtectedRoles.all(),
  };

  const tmpPath = path.join(os.tmpdir(), `tracemogged-backup-${Date.now()}.json`);
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  return tmpPath;
}

export function runRestore(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'The file is not valid JSON.' };
  }

  if (!data.version || !data.users) {
    return { ok: false, reason: 'This does not look like a valid backup file.' };
  }

  const restore = db.transaction(() => {
    let counts = {};

    for (const row of data.users ?? []) {
      statements.restoreUser.run(row);
    }
    counts.users = data.users?.length ?? 0;

    for (const row of data.promo_roles ?? []) {
      statements.restorePromoRole.run(row);
    }
    counts.promo_roles = data.promo_roles?.length ?? 0;

    for (const row of data.guild_settings ?? []) {
      statements.restoreGuildSettings.run(row);
    }
    counts.guild_settings = data.guild_settings?.length ?? 0;

    for (const row of data.whitelist ?? []) {
      statements.restoreWhitelistEntry.run(row);
    }
    counts.whitelist = data.whitelist?.length ?? 0;

    for (const row of data.raid_scans ?? []) {
      statements.restoreRaidScan.run(row);
    }
    counts.raid_scans = data.raid_scans?.length ?? 0;

    for (const row of data.tickets ?? []) {
      statements.restoreTicket.run(row);
    }
    counts.tickets = data.tickets?.length ?? 0;

    for (const row of data.vetting_lists ?? []) {
      statements.restoreVettingEntry.run(row);
    }
    counts.vetting_lists = data.vetting_lists?.length ?? 0;

    for (const row of data.protected_roles ?? []) {
      statements.restoreProtectedRole.run(row);
    }
    counts.protected_roles = data.protected_roles?.length ?? 0;

    return counts;
  });

  try {
    const counts = restore();
    return { ok: true, counts };
  } catch (err) {
    return { ok: false, reason: `Restore failed: ${err.message}` };
  }
}

export async function downloadAndRestore(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download the backup file (${res.status}).`);
  const text = await res.text();
  return runRestore(text);
}

export function backupPayload(tmpPath) {
  return {
    ...componentsV2Payload(
      buildContainer({
        accentColor: Colors.success,
        heading: 'Backup Ready',
        lines: ['All bot data has been exported. Keep this file somewhere safe.'],
      })
    ),
    files: [tmpPath],
  };
}

export function restoreSuccessPayload(counts) {
  return componentsV2Payload(
    buildContainer({
      accentColor: Colors.success,
      heading: 'Restore Complete',
      lines: [
        `Users: ${counts.users}`,
        `Promo roles: ${counts.promo_roles}`,
        `Guild settings: ${counts.guild_settings}`,
        `Whitelist entries: ${counts.whitelist}`,
        `Raid scans: ${counts.raid_scans}`,
        `Tickets: ${counts.tickets}`,
        `Vetting list entries: ${counts.vetting_lists}`,
        `Protected roles: ${counts.protected_roles}`,
      ],
    })
  );
}
