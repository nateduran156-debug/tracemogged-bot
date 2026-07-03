import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { slashCommandData } from './commandRegistry.js';

if (!config.token || !config.clientId) {
  console.error('DISCORD_TOKEN and DISCORD_CLIENT_ID must be set to deploy commands.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(config.token);

const body = slashCommandData.map((c) => c.toJSON());

async function main() {
  if (config.guildId) {
    console.log(`Deploying ${body.length} guild command(s) to guild ${config.guildId} (instant)...`);
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
    console.log('Guild commands deployed.');
  } else {
    console.log(`Deploying ${body.length} global command(s). This can take up to an hour to propagate.`);
    await rest.put(Routes.applicationCommands(config.clientId), { body });
    console.log('Global commands deployed.');
  }
}

main().catch((err) => {
  console.error('Failed to deploy commands:', err);
  process.exit(1);
});
