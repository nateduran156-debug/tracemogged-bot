import {
  SlashCommandBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonStyle,
} from 'discord.js';
import { buildContainer, componentsV2Payload, button, Colors } from '../components.js';

export const RAID_TICKET_PANEL_BUTTON_ID = 'raid_ticket_open';
export const RAID_TICKET_MODAL_ID = 'raid_ticket_modal';

// Category where all raid ticket channels will be created
export const RAID_TICKET_CATEGORY_ID =
  process.env.RAID_TICKET_CATEGORY_ID || '1519785470752456764';

export const raidTicketData = new SlashCommandBuilder()
  .setName('raid-ticket')
  .setDescription('Post the raid ticket panel in a channel')
  .addChannelOption((o) =>
    o
      .setName('channel')
      .setDescription('Channel to post the panel in')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true),
  );

/**
 * Builds the raid ticket panel — just "/tracemog" and a blue Open button.
 * No description, no heading.
 */
export function buildRaidTicketPanel() {
  const container = buildContainer({
    lines: ['/tracemog'],
    buttons: [
      button({
        customId: RAID_TICKET_PANEL_BUTTON_ID,
        label: 'Open Raid Ticket',
        style: ButtonStyle.Primary,
      }),
    ],
  });
  return componentsV2Payload(container);
}

/**
 * Modal shown when a member clicks the raid ticket button.
 * Asks for their Roblox username before the ticket is opened.
 */
export function buildRaidTicketModal() {
  const modal = new ModalBuilder()
    .setCustomId(RAID_TICKET_MODAL_ID)
    .setTitle('Raid Ticket');

  const robloxInput = new TextInputBuilder()
    .setCustomId('roblox_user')
    .setLabel('Roblox Username')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Your exact Roblox username')
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(robloxInput));
  return modal;
}

export async function postRaidTicketPanel(channel) {
  await channel.send(buildRaidTicketPanel());
}
