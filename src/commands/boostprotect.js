import { SlashCommandBuilder } from 'discord.js';
import { statements } from '../db.js';
import { buildContainer, componentsV2Payload, Colors } from '../components.js';

export const data = new SlashCommandBuilder()
  .setName('boostprotect')
  .setDescription('Manage roles that are shielded from kick commands')
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Protect a role from being kicked')
      .addRoleOption((o) => o.setName('role').setDescription('Role to protect').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Remove kick protection from a role')
      .addRoleOption((o) => o.setName('role').setDescription('Role to unprotect').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub.setName('list').setDescription('Show all roles currently protected from kicks')
  );

export function addProtectedRole(guildId, roleId, addedBy) {
  statements.addProtectedRole.run({ guild_id: guildId, role_id: roleId, added_by: addedBy });
  return componentsV2Payload(
    buildContainer({
      accentColor: Colors.success,
      heading: 'Role Protected',
      lines: [`<@&${roleId}> is now shielded from kick commands.`],
    })
  );
}

export function removeProtectedRole(guildId, roleId) {
  const info = statements.removeProtectedRole.run(guildId, roleId);
  const removed = info.changes > 0;
  return componentsV2Payload(
    buildContainer({
      accentColor: removed ? Colors.success : Colors.warning,
      heading: removed ? 'Protection Removed' : 'Role Not Found',
      lines: [
        removed
          ? `<@&${roleId}> can now be kicked by kick commands.`
          : `<@&${roleId}> wasn't in the protected list.`,
      ],
    })
  );
}

export function listProtectedRoles(guildId) {
  const entries = statements.listProtectedRoles.all(guildId);
  const lines = entries.length
    ? entries.map((e) => `<@&${e.role_id}>`)
    : ['No protected roles set. Nitro boosters are still always protected.'];

  return componentsV2Payload(
    buildContainer({
      accentColor: Colors.info,
      heading: 'Protected Roles',
      lines,
    })
  );
}

export function getProtectedRoleIds(guildId) {
  return statements.listProtectedRoles.all(guildId).map((e) => e.role_id);
}
