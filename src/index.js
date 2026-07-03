import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { config } from './config.js';
import registerReadyHandler from './events/ready.js';
import registerInteractionHandler from './events/interactionCreate.js';
import registerMessageHandler from './events/messageCreate.js';

if (!config.token) {
  console.error('DISCORD_TOKEN is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.Channel],
});

registerReadyHandler(client);
registerInteractionHandler(client);
registerMessageHandler(client);

client.login(config.token);
