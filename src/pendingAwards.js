/**
 * Tracks pending raid-point awards triggered by proof images in raid ticket channels.
 * Keyed by the proof message ID.
 *
 * Value shape:
 *   { targetDiscordId: string | null, robloxUsername: string, amount: number, guildId: string }
 */
export const pendingAwards = new Map();
