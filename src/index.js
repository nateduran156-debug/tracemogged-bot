import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { config } from './config.js';
import registerReadyHandler from './events/ready.js';
import registerInteractionHandler from './events/interactionCreate.js';
import registerMessageHandler from './events/messageCreate.js';

if (!config.token) {
  console.error('DISCORD_TOKEN is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

// Graceful shutdown — Railway (and Docker) send SIGTERM on redeploy/stop.
// Give the event loop a moment to finish any in-flight Discord API calls,
// then exit cleanly so SQLite WAL is flushed before the process ends.
function shutdown(signal) {
  console.log(`Received ${signal} — shutting down gracefully.`);
  // Give up to 5 s for pending work, then force exit.
  setTimeout(() => {
    console.log('Graceful shutdown timed out — forcing exit.');
    process.exit(0);
  }, 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

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
