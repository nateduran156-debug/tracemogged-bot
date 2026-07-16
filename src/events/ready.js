import { REST, Routes } from 'discord.js';
import { statements } from '../db.js';
import { sendTranscript } from '../tickets.js';
import { buildContainer, componentsV2Payload, Colors } from '../components.js';
import { config } from '../config.js';
import { slashCommandData } from '../commandRegistry.js';

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
const CHECK_EVERY = 30 * 60 * 1000;

async function checkInactiveTickets(client) {
  const openTickets = statements.getOpenTickets.all();
  const now = Date.now();

  for (const ticket of openTickets) {
    const lastSeen = ticket.last_activity_at || ticket.created_at;
    const age = now - new Date(lastSeen).getTime();
    if (age < TWENTY_FOUR_HOURS) continue;

    const guild = client.guilds.cache.get(ticket.guild_id);
    if (!guild) continue;

    const channel = await guild.channels.fetch(ticket.channel_id).catch(() => null);
    if (!channel) {
      statements.closeTicket.run(ticket.channel_id);
      continue;
    }

    await channel.send(
      componentsV2Payload(
        buildContainer({
          accentColor: Colors.neutral,
          heading: 'Ticket Closing — Inactivity',
          lines: [
            'This ticket has been open for over 24 hours with no action.',
            'Closing automatically and saving a transcript.',
          ],
        })
      )
    ).catch(() => {});

    await sendTranscript(guild, channel, ticket.guild_id);
    statements.closeTicket.run(ticket.channel_id);
    await channel.delete('Auto-closed after 24h inactivity').catch(() => {});
    console.log(`Auto-closed inactive ticket ${ticket.channel_id} in guild ${ticket.guild_id}`);
  }
}

async function deployCommands() {
  if (!config.token || !config.clientId) return;
  try {
    const rest = new REST({ version: '10' }).setToken(config.token);
    const body = slashCommandData.map((c) => c.toJSON());
    await rest.put(Routes.applicationCommands(config.clientId), { body });
    console.log(`Deployed ${body.length} global slash commands.`);
  } catch (err) {
    console.error('Failed to deploy slash commands:', err.message);
  }
}

export default function registerReadyHandler(client) {
  client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Serving ${client.guilds.cache.size} guild(s).`);

    // Auto-deploy slash commands globally on every startup
    await deployCommands();

    checkInactiveTickets(client).catch(console.error);
    setInterval(() => checkInactiveTickets(client).catch(console.error), CHECK_EVERY);
  });
}
