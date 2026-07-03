import { statements } from '../db.js';
import { sendTranscript } from '../tickets.js';
import { buildContainer, componentsV2Payload, Colors } from '../components.js';

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
const CHECK_EVERY = 30 * 60 * 1000; // run the check every 30 minutes

async function checkInactiveTickets(client) {
  const openTickets = statements.getOpenTickets.all();
  const now = Date.now();

  for (const ticket of openTickets) {
    // use last_activity_at if we have it, otherwise fall back to created_at
    const lastSeen = ticket.last_activity_at || ticket.created_at;
    const age = now - new Date(lastSeen).getTime();
    if (age < TWENTY_FOUR_HOURS) continue;

    const guild = client.guilds.cache.get(ticket.guild_id);
    if (!guild) continue;

    const channel = await guild.channels.fetch(ticket.channel_id).catch(() => null);
    if (!channel) {
      // channel already gone, just mark it closed
      statements.closeTicket.run(ticket.channel_id);
      continue;
    }

    await channel
      .send(
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
      )
      .catch(() => {});

    await sendTranscript(guild, channel, ticket.guild_id);
    statements.closeTicket.run(ticket.channel_id);
    await channel.delete('Auto-closed after 24h inactivity').catch(() => {});
    console.log(`Auto-closed inactive ticket ${ticket.channel_id} in guild ${ticket.guild_id}`);
  }
}

export default function registerReadyHandler(client) {
  client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Serving ${client.guilds.cache.size} guild(s).`);

    // kick off the inactivity check immediately, then every 30 minutes
    checkInactiveTickets(client).catch(console.error);
    setInterval(() => checkInactiveTickets(client).catch(console.error), CHECK_EVERY);
  });
}
