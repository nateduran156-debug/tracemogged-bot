import { SlashCommandBuilder } from 'discord.js';
import { statements } from '../db.js';
import { buildContainer, componentsV2Payload, Colors } from '../components.js';

export const addData = new SlashCommandBuilder()
  .setName('promorole_add')
  .setDescription('Set a role to be granted at a point threshold')
  .addIntegerOption((o) => o.setName('points').setDescription('Point threshold').setRequired(true))
  .addRoleOption((o) => o.setName('role').setDescription('Role to grant').setRequired(true));

export const removeData = new SlashCommandBuilder()
  .setName('promorole_remove')
  .setDescription('Remove a promo role threshold')
  .addIntegerOption((o) => o.setName('points').setDescription('Point threshold').setRequired(true));

export const listData = new SlashCommandBuilder()
  .setName('promorole_list')
  .setDescription('List configured promo role thresholds');

export function addPromoRole(points, roleId) {
  statements.upsertPromoRole.run(points, roleId);
}

export function removePromoRole(points) {
  statements.removePromoRole.run(points);
}

export function listPromoRolesPayload() {
  const roles = statements.allPromoRoles.all();
  const lines = roles.length
    ? roles.map((r) => `**${r.points} points** -> <@&${r.role_id}>`)
    : ['No promo roles configured yet.'];

  return componentsV2Payload(
    buildContainer({
      accentColor: Colors.info,
      heading: 'Promo Roles',
      lines,
    })
  );
}
