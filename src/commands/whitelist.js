import { SlashCommandBuilder } from 'discord.js';
import { addToWhitelist, removeFromWhitelist, listWhitelist } from '../whitelist.js';
import { buildContainer, componentsV2Payload, Colors } from '../components.js';

export const whitelistData = new SlashCommandBuilder()
  .setName('whitelist')
  .setDescription('Manage who is allowed to use this bot')
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Add a user to the whitelist')
      .addUserOption((o) => o.setName('user').setDescription('User to whitelist').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Remove a user from the whitelist')
      .addUserOption((o) => o.setName('user').setDescription('User to remove').setRequired(true))
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('List whitelisted users'));

export function handleWhitelistAdd(userId, addedBy) {
  addToWhitelist(userId, addedBy);
  return componentsV2Payload(
    buildContainer({
      accentColor: Colors.success,
      heading: 'Whitelist Updated',
      lines: [`<@${userId}> can now use this bot.`],
    })
  );
}

export function handleWhitelistRemove(userId) {
  const removed = removeFromWhitelist(userId);
  return componentsV2Payload(
    buildContainer({
      accentColor: removed ? Colors.success : Colors.warning,
      heading: 'Whitelist Updated',
      lines: [
        removed
          ? `<@${userId}> has been removed from the whitelist.`
          : `<@${userId}> is the protected owner account and cannot be removed.`,
      ],
    })
  );
}

export function handleWhitelistList() {
  const entries = listWhitelist();
  const lines = entries.length
    ? entries.map((e) => `<@${e.discord_id}>`)
    : ['No whitelisted users.'];

  return componentsV2Payload(
    buildContainer({
      accentColor: Colors.info,
      heading: 'Whitelisted Users',
      lines,
    })
  );
}
