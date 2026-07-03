import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';

/**
 * Discord Components V2 helpers. All bot messages are built with
 * ContainerBuilder / TextDisplayBuilder instead of legacy embeds, per the
 * project's Components V2-only UI requirement.
 */

export function buildContainer({ accentColor, heading, lines = [], buttons = [] } = {}) {
  const container = new ContainerBuilder();
  if (accentColor !== undefined) container.setAccentColor(accentColor);

  if (heading) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${heading}`));
  }

  if (lines.length) {
    if (heading) container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(lines.join('\n'))
    );
  }

  if (buttons.length) {
    container.addSeparatorComponents(new SeparatorBuilder());
    const row = new ActionRowBuilder().addComponents(buttons);
    container.addActionRowComponents(row);
  }

  return container;
}

export function componentsV2Payload(containers, extra = {}) {
  const list = Array.isArray(containers) ? containers : [containers];
  return {
    flags: MessageFlags.IsComponentsV2,
    components: list,
    ...extra,
  };
}

export function button({ customId, label, style = ButtonStyle.Secondary, url, disabled = false }) {
  const b = new ButtonBuilder().setLabel(label).setDisabled(disabled);
  if (url) {
    b.setStyle(ButtonStyle.Link).setURL(url);
  } else {
    b.setStyle(style).setCustomId(customId);
  }
  return b;
}

export const Colors = {
  black: 0x000000,
  info: 0x5865f2,
  success: 0x2ecc71,
  danger: 0xe74c3c,
  warning: 0xf1c40f,
  neutral: 0x2b2d31,
};
