import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { buildTicketPanel } from '../tickets.js';

export const ticketPanelData = new SlashCommandBuilder()
  .setName('ticketpanel')
  .setDescription('Post the ticket/verification panel in a channel')
  .addChannelOption((o) =>
    o
      .setName('channel')
      .setDescription('Channel to post the panel in')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
  );

export async function postTicketPanel(channel) {
  await channel.send(buildTicketPanel());
}
