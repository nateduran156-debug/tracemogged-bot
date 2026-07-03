import fetch from 'node-fetch';
import { config } from '../config.js';

/**
 * Look up a Roblox user by username.
 * Returns { id, name } or null if not found.
 */
export async function getRobloxUserByUsername(username) {
  const res = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
  });
  if (!res.ok) throw new Error(`Roblox username lookup failed (${res.status})`);
  const data = await res.json();
  const match = data?.data?.[0];
  if (!match) return null;
  return { id: match.id, name: match.name };
}

/**
 * Check whether a Roblox user ID is a member of the configured group.
 */
export async function isUserInGroup(robloxUserId, groupId = config.robloxGroupId) {
  const res = await fetch(
    `https://groups.roblox.com/v1/users/${robloxUserId}/groups/roles`
  );
  if (!res.ok) throw new Error(`Roblox group lookup failed (${res.status})`);
  const data = await res.json();
  const groups = data?.data || [];
  return groups.some((g) => String(g.group?.id) === String(groupId));
}

export async function verifyRobloxRegistration(username) {
  const user = await getRobloxUserByUsername(username);
  if (!user) {
    return { ok: false, reason: 'Roblox username not found.' };
  }
  const inGroup = await isUserInGroup(user.id);
  if (!inGroup) {
    return { ok: false, reason: 'This Roblox account is not a member of the required group.' };
  }
  return { ok: true, user };
}

/**
 * Returns every group a Roblox user belongs to, as [{ id, name }].
 */
export async function getUserGroups(robloxUserId) {
  const res = await fetch(`https://groups.roblox.com/v1/users/${robloxUserId}/groups/roles`);
  if (!res.ok) throw new Error(`Roblox group lookup failed (${res.status})`);
  const data = await res.json();
  const groups = data?.data || [];
  return groups.map((g) => ({ id: String(g.group?.id), name: g.group?.name }));
}

/**
 * Returns a Roblox user's friends list as [{ id, name }].
 */
export async function getUserFriends(robloxUserId) {
  const res = await fetch(`https://friends.roblox.com/v1/users/${robloxUserId}/friends`);
  if (!res.ok) throw new Error(`Roblox friends lookup failed (${res.status})`);
  const data = await res.json();
  const friends = data?.data || [];
  return friends.map((f) => ({ id: String(f.id), name: f.name }));
}
