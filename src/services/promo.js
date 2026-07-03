import { statements } from '../db.js';

/**
 * After a user's promo points change, check whether they've crossed any
 * configured promo-role threshold and grant the highest one they qualify
 * for. Does not remove lower roles automatically to avoid surprising
 * behavior in servers that want to stack roles; only adds the new one.
 */
export async function applyPromoRoles(guild, discordId) {
  const user = statements.getUser.get(discordId);
  if (!user) return [];

  const roles = statements.allPromoRoles.all();
  const eligible = roles.filter((r) => user.promo_points >= r.points);
  if (!eligible.length) return [];

  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return [];

  const granted = [];
  for (const r of eligible) {
    if (!member.roles.cache.has(r.role_id)) {
      try {
        await member.roles.add(r.role_id);
        const roleName = guild.roles.cache.get(r.role_id)?.name ?? r.role_id;
        granted.push({ roleId: r.role_id, roleName });
      } catch {
        // Missing permissions or invalid role id — skip silently, staff can
        // check bot role hierarchy.
      }
    }
  }
  return granted;
}
