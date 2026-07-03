import 'dotenv/config';
import path from 'node:path';

function parseIdList(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export const config = {
  token: process.env.DISCORD_TOKEN || '',
  clientId: process.env.DISCORD_CLIENT_ID || '',
  guildId: process.env.DISCORD_GUILD_ID || '',

  robloxGroupId: process.env.ROBLOX_GROUP_ID || '396910998',

  databasePath: process.env.DATABASE_PATH || 'data/bot.sqlite3',
  reportDir: process.env.REPORT_DIR || 'data/reports',

  // Hardcoded owner/whitelist user that can never be removed and can always
  // use the bot, even before any database seeding happens.
  hardcodedWhitelistId: '1456824205545967713',

  envWhitelistIds: parseIdList(process.env.WHITELIST_USER_IDS),

  verifiedRoleId: process.env.VERIFIED_ROLE_ID || '',
  ticketPanelChannelId: process.env.TICKET_PANEL_CHANNEL_ID || '',
  ticketCategoryId: process.env.TICKET_CATEGORY_ID || '',
  boosterRoleIds: parseIdList(process.env.BOOSTER_ROLE_IDS),

  // Channel where every submitted verification ("gate ticket") application
  // is posted for staff to review, in addition to the applicant's private
  // ticket channel.
  gateChannelId: process.env.GATE_CHANNEL_ID || '1519783619076427936',

  // Roles granted to a user when a whitelisted staff member runs `.verify`
  // (or `/verify`) on them.
  verifyRoleIds: parseIdList(process.env.VERIFY_ROLE_IDS).length
    ? parseIdList(process.env.VERIFY_ROLE_IDS)
    : ['1519782156795379873', '1519782203293171893'],

  // Vetting/verification-check tuning.
  altAccountDays: Number(process.env.ALT_ACCOUNT_DAYS || 30),
  // Seed values for the vetting lists (opponent crews/groups, blacklists).
  // These are only used to seed the DB on first launch — after that, manage
  // them with /vetting or .vetting_add / .vetting_remove.
  seedOpponentCrews: parseIdList(process.env.OPPONENT_CREW_NAMES),
  seedOpponentRobloxGroupIds: parseIdList(process.env.OPPONENT_ROBLOX_GROUP_IDS),
  seedBlacklistedRobloxUsernames: parseIdList(process.env.BLACKLISTED_ROBLOX_USERNAMES),
  seedBlacklistedDiscordIds: parseIdList(process.env.BLACKLISTED_DISCORD_IDS),

  prefix: '.',
};

export function robloxGroupJoinUrl(groupId = config.robloxGroupId) {
  return `https://www.roblox.com/groups/${groupId}`;
}

export function robloxProfileUrl(robloxUserId) {
  return `https://www.roblox.com/users/${robloxUserId}/profile`;
}

export const paths = {
  database: path.resolve(config.databasePath),
  reportDir: path.resolve(config.reportDir),
};
