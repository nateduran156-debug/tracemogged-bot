import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { paths, config } from './config.js';

fs.mkdirSync(path.dirname(paths.database), { recursive: true });
fs.mkdirSync(paths.reportDir, { recursive: true });

export const db = new DatabaseSync(paths.database);
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  discord_id TEXT PRIMARY KEY,
  roblox_username TEXT NOT NULL,
  roblox_user_id TEXT,
  promo_points INTEGER NOT NULL DEFAULT 0,
  raids_attended INTEGER NOT NULL DEFAULT 0,
  missed_raids INTEGER NOT NULL DEFAULT 0,
  registered_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS promo_roles (
  points INTEGER PRIMARY KEY,
  role_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  log_channel_id TEXT,
  missed_channel_id TEXT,
  gate_channel_id TEXT,
  transcript_channel_id TEXT,
  missed_message_id TEXT,
  kick_threshold INTEGER DEFAULT 3,
  raid_point_value INTEGER DEFAULT 1,
  flagged_logs_channel_id TEXT
);

CREATE TABLE IF NOT EXISTS whitelist (
  discord_id TEXT PRIMARY KEY,
  added_by TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS raid_scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  video_name TEXT,
  detected_json TEXT NOT NULL,
  absent_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tickets (
  channel_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  answers_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vetting_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  list_type TEXT NOT NULL,
  value TEXT NOT NULL,
  added_by TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(guild_id, list_type, value)
);

CREATE TABLE IF NOT EXISTS protected_roles (
  guild_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  added_by TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (guild_id, role_id)
);

CREATE TABLE IF NOT EXISTS raid_ticket_channels (
  channel_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  roblox_username TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loa_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  added_by TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(discord_id, guild_id)
);

CREATE TABLE IF NOT EXISTS flagged_enforcement_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  roblox_username TEXT NOT NULL,
  missed_raids INTEGER NOT NULL,
  threshold INTEGER NOT NULL,
  scan_id INTEGER NOT NULL,
  logged_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Migrations for existing databases
try { db.exec(`ALTER TABLE guild_settings ADD COLUMN gate_channel_id TEXT`); } catch {}
try { db.exec(`ALTER TABLE guild_settings ADD COLUMN transcript_channel_id TEXT`); } catch {}
try { db.exec(`ALTER TABLE guild_settings ADD COLUMN missed_message_id TEXT`); } catch {}
try { db.exec(`ALTER TABLE guild_settings ADD COLUMN kick_threshold INTEGER DEFAULT 3`); } catch {}
try { db.exec(`ALTER TABLE guild_settings ADD COLUMN raid_point_value INTEGER DEFAULT 1`); } catch {}
try { db.exec(`ALTER TABLE guild_settings ADD COLUMN flagged_logs_channel_id TEXT`); } catch {}
try { db.exec(`ALTER TABLE tickets ADD COLUMN last_activity_at TEXT`); } catch {}

// Seed the hardcoded owner + any env-configured whitelist users
const seedWhitelist = db.prepare(`INSERT OR IGNORE INTO whitelist (discord_id, added_by) VALUES (?, 'system')`);
seedWhitelist.run(config.hardcodedWhitelistId);
for (const id of config.envWhitelistIds) seedWhitelist.run(id);

export const statements = {
  // Users
  getUser: db.prepare(`SELECT * FROM users WHERE discord_id = ?`),
  getUserByRoblox: db.prepare(`SELECT * FROM users WHERE lower(roblox_username) = lower(?)`),
  upsertUser: db.prepare(`
    INSERT INTO users (discord_id, roblox_username, roblox_user_id)
    VALUES (@discord_id, @roblox_username, @roblox_user_id)
    ON CONFLICT(discord_id) DO UPDATE SET
      roblox_username = excluded.roblox_username,
      roblox_user_id  = excluded.roblox_user_id
  `),
  allUsers: db.prepare(`SELECT * FROM users ORDER BY promo_points DESC`),
  addPromoPoints: db.prepare(`UPDATE users SET promo_points = promo_points + ? WHERE discord_id = ?`),
  setPromoPoints: db.prepare(`UPDATE users SET promo_points = ? WHERE discord_id = ?`),
  incrementAttended: db.prepare(`UPDATE users SET raids_attended = raids_attended + 1 WHERE discord_id = ?`),
  incrementMissed: db.prepare(`UPDATE users SET missed_raids = missed_raids + 1 WHERE discord_id = ?`),
  resetMissed: db.prepare(`UPDATE users SET missed_raids = 0 WHERE discord_id = ?`),

  // Promo roles
  upsertPromoRole: db.prepare(`INSERT OR REPLACE INTO promo_roles (points, role_id) VALUES (?, ?)`),
  removePromoRole: db.prepare(`DELETE FROM promo_roles WHERE points = ?`),
  allPromoRoles: db.prepare(`SELECT * FROM promo_roles ORDER BY points ASC`),

  // Guild settings
  getGuildSettings: db.prepare(`SELECT * FROM guild_settings WHERE guild_id = ?`),
  upsertLogChannel: db.prepare(`
    INSERT INTO guild_settings (guild_id, log_channel_id) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET log_channel_id = excluded.log_channel_id
  `),
  upsertMissedChannel: db.prepare(`
    INSERT INTO guild_settings (guild_id, missed_channel_id) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET missed_channel_id = excluded.missed_channel_id
  `),
  upsertGateChannel: db.prepare(`
    INSERT INTO guild_settings (guild_id, gate_channel_id) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET gate_channel_id = excluded.gate_channel_id
  `),
  upsertTranscriptChannel: db.prepare(`
    INSERT INTO guild_settings (guild_id, transcript_channel_id) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET transcript_channel_id = excluded.transcript_channel_id
  `),
  upsertMissedMessageId: db.prepare(`
    INSERT INTO guild_settings (guild_id, missed_message_id) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET missed_message_id = excluded.missed_message_id
  `),
  upsertKickThreshold: db.prepare(`
    INSERT INTO guild_settings (guild_id, kick_threshold) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET kick_threshold = excluded.kick_threshold
  `),
  upsertRaidPointValue: db.prepare(`
    INSERT INTO guild_settings (guild_id, raid_point_value) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET raid_point_value = excluded.raid_point_value
  `),
  upsertFlaggedLogsChannel: db.prepare(`
    INSERT INTO guild_settings (guild_id, flagged_logs_channel_id) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET flagged_logs_channel_id = excluded.flagged_logs_channel_id
  `),

  // Whitelist
  addWhitelist: db.prepare(`INSERT OR IGNORE INTO whitelist (discord_id, added_by) VALUES (?, ?)`),
  removeWhitelist: db.prepare(`DELETE FROM whitelist WHERE discord_id = ?`),
  allWhitelist: db.prepare(`SELECT * FROM whitelist`),
  isWhitelisted: db.prepare(`SELECT 1 FROM whitelist WHERE discord_id = ?`),

  // Raid scans
  insertRaidScan: db.prepare(`
    INSERT INTO raid_scans (guild_id, created_by, video_name, detected_json, absent_json)
    VALUES (@guild_id, @created_by, @video_name, @detected_json, @absent_json)
  `),
  getRaidScan: db.prepare(`SELECT * FROM raid_scans WHERE id = ?`),
  updateRaidScanStatus: db.prepare(`UPDATE raid_scans SET status = ? WHERE id = ?`),
  updateRaidScanDetected: db.prepare(`UPDATE raid_scans SET detected_json = ?, absent_json = ? WHERE id = ?`),
  allRaidScans: db.prepare(`SELECT * FROM raid_scans WHERE guild_id = ? ORDER BY created_at DESC`),
  recentRaidScans: db.prepare(`SELECT * FROM raid_scans WHERE guild_id = ? ORDER BY created_at DESC LIMIT 10`),

  // Tickets
  insertTicket: db.prepare(`
    INSERT OR IGNORE INTO tickets (channel_id, guild_id, user_id, answers_json)
    VALUES (@channel_id, @guild_id, @user_id, @answers_json)
  `),
  getTicket: db.prepare(`SELECT * FROM tickets WHERE channel_id = ?`),
  getOpenTicketByUser: db.prepare(`SELECT * FROM tickets WHERE user_id = ? AND guild_id = ? AND status = 'open' LIMIT 1`),
  getOpenTickets: db.prepare(`SELECT * FROM tickets WHERE status = 'open' ORDER BY created_at ASC`),
  closeTicket: db.prepare(`UPDATE tickets SET status = 'closed' WHERE channel_id = ?`),
  markTicketVerified: db.prepare(`UPDATE tickets SET status = 'verified' WHERE channel_id = ?`),
  allTickets: db.prepare(`SELECT * FROM tickets WHERE guild_id = ? ORDER BY created_at DESC`),
  touchTicketActivity: db.prepare(`UPDATE tickets SET last_activity_at = datetime('now') WHERE channel_id = ?`),

  // Vetting lists
  addVettingEntry: db.prepare(`INSERT OR IGNORE INTO vetting_lists (guild_id, list_type, value, added_by) VALUES (?, ?, ?, ?)`),
  removeVettingEntry: db.prepare(`DELETE FROM vetting_lists WHERE guild_id = ? AND list_type = ? AND lower(value) = lower(?)`),
  listVettingEntries: db.prepare(`SELECT * FROM vetting_lists WHERE guild_id = ? AND list_type = ? ORDER BY value ASC`),

  // Protected roles
  addProtectedRole: db.prepare(`INSERT OR IGNORE INTO protected_roles (guild_id, role_id, added_by) VALUES (@guild_id, @role_id, @added_by)`),
  removeProtectedRole: db.prepare(`DELETE FROM protected_roles WHERE guild_id = ? AND role_id = ?`),
  listProtectedRoles: db.prepare(`SELECT * FROM protected_roles WHERE guild_id = ? ORDER BY added_at ASC`),

  // Raid ticket channels
  insertRaidTicketChannel: db.prepare(`INSERT OR IGNORE INTO raid_ticket_channels (channel_id, guild_id, user_id, roblox_username) VALUES (?, ?, ?, ?)`),
  getRaidTicketChannel: db.prepare(`SELECT * FROM raid_ticket_channels WHERE channel_id = ?`),
  deleteRaidTicketChannel: db.prepare(`DELETE FROM raid_ticket_channels WHERE channel_id = ?`),
  getOpenRaidTicketByUser: db.prepare(`SELECT * FROM raid_ticket_channels WHERE user_id = ? AND guild_id = ? LIMIT 1`),

  // LOA entries
  insertLoa: db.prepare(`INSERT OR REPLACE INTO loa_entries (discord_id, guild_id, reason, added_by) VALUES (?, ?, ?, ?)`),
  removeLoa: db.prepare(`DELETE FROM loa_entries WHERE discord_id = ? AND guild_id = ?`),
  getLoa: db.prepare(`SELECT * FROM loa_entries WHERE discord_id = ? AND guild_id = ?`),
  listLoas: db.prepare(`SELECT * FROM loa_entries WHERE guild_id = ? ORDER BY added_at DESC`),

  // Flagged enforcement logs
  insertFlaggedLog: db.prepare(`
    INSERT INTO flagged_enforcement_logs (guild_id, discord_id, roblox_username, missed_raids, threshold, scan_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  listFlaggedLogs: db.prepare(`
    SELECT * FROM flagged_enforcement_logs WHERE guild_id = ? ORDER BY logged_at DESC LIMIT 25
  `),
  deleteFlaggedLogs: db.prepare(`DELETE FROM flagged_enforcement_logs WHERE discord_id = ?`),

  // Bulk operations
  resetAllMissed: db.prepare(`UPDATE users SET missed_raids = 0`),

  // Backup
  backupUsers: db.prepare(`SELECT * FROM users`),
  backupPromoRoles: db.prepare(`SELECT * FROM promo_roles`),
  backupGuildSettings: db.prepare(`SELECT * FROM guild_settings`),
  backupWhitelist: db.prepare(`SELECT * FROM whitelist`),
  backupRaidScans: db.prepare(`SELECT * FROM raid_scans`),
  backupTickets: db.prepare(`SELECT * FROM tickets`),
  backupVettingLists: db.prepare(`SELECT * FROM vetting_lists`),
  backupProtectedRoles: db.prepare(`SELECT * FROM protected_roles`),

  // Restore
  restoreUser: db.prepare(`INSERT OR REPLACE INTO users (discord_id, roblox_username, roblox_user_id, promo_points, raids_attended, missed_raids, registered_at) VALUES (@discord_id, @roblox_username, @roblox_user_id, @promo_points, @raids_attended, @missed_raids, @registered_at)`),
  restorePromoRole: db.prepare(`INSERT OR REPLACE INTO promo_roles (points, role_id) VALUES (@points, @role_id)`),
  restoreGuildSettings: db.prepare(`INSERT OR REPLACE INTO guild_settings (guild_id, log_channel_id, missed_channel_id, gate_channel_id, transcript_channel_id) VALUES (@guild_id, @log_channel_id, @missed_channel_id, @gate_channel_id, @transcript_channel_id)`),
  restoreWhitelistEntry: db.prepare(`INSERT OR REPLACE INTO whitelist (discord_id, added_by, added_at) VALUES (@discord_id, @added_by, @added_at)`),
  restoreRaidScan: db.prepare(`INSERT OR REPLACE INTO raid_scans (id, guild_id, created_by, video_name, detected_json, absent_json, status, created_at) VALUES (@id, @guild_id, @created_by, @video_name, @detected_json, @absent_json, @status, @created_at)`),
  restoreTicket: db.prepare(`INSERT OR REPLACE INTO tickets (channel_id, guild_id, user_id, status, answers_json, created_at) VALUES (@channel_id, @guild_id, @user_id, @status, @answers_json, @created_at)`),
  restoreVettingEntry: db.prepare(`INSERT OR REPLACE INTO vetting_lists (guild_id, list_type, value, added_by, added_at) VALUES (@guild_id, @list_type, @value, @added_by, @added_at)`),
  restoreProtectedRole: db.prepare(`INSERT OR REPLACE INTO protected_roles (guild_id, role_id, added_by, added_at) VALUES (@guild_id, @role_id, @added_by, @added_at)`),
};
