import {
  ChatInputCommandInteraction,
  ChannelType,
  SlashCommandBuilder,
  TextChannel,
} from 'discord.js';
import { config } from '../config.js';
import { ThreadService } from '../services/thread.service.js';
import { MessageHandler } from '../handlers/message.handler.js';

export const issueCommand = new SlashCommandBuilder()
  .setName('issue')
  .setDescription('Nahlásiť problém, chybu alebo návrh pre hru');

export async function handleIssueCommand(
  interaction: ChatInputCommandInteraction,
  threadService: ThreadService,
  messageHandler: MessageHandler
): Promise<void> {
  if (interaction.channelId !== config.discord.channelId) {
    await interaction.reply({
      content:
        'Tento príkaz je možné použiť len v určenom kanáli pre issue reporty.',
      ephemeral: true,
    });
    return;
  }

  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: 'Tento príkaz je možné použiť len v textovom kanáli.',
      ephemeral: true,
    });
    return;
  }

  try {
    const date = new Date().toISOString().split('T')[0];
    const threadName = `Issue: ${interaction.user.username} - ${date}`;

    const thread = await threadService.createPrivateThread(
      channel as TextChannel,
      interaction.user,
      threadName
    );

    messageHandler.initConversation(thread.id, interaction.user.id);

    await threadService.sendMessage(
      thread,
      'Ahoj! Som bot na zber spätnej väzby pre hru By Sword and Seal.\n\n' +
        'Prosím, opíš svoj problém, návrh alebo chybu, ktorú si našiel/našla. ' +
        'Budem sa ťa pýtať doplňujúce otázky, aby som lepšie porozumel/a tvojmu reportu.'
    );

    await interaction.reply({
      content: 'Vytvoril som ti privátne vlákno. Pokračuj tam.',
      ephemeral: true,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error('Error creating issue thread:', errorMessage);
    await interaction.reply({
      content:
        'Nastala chyba pri vytváraní vlákna. Skús to prosím neskôr.',
      ephemeral: true,
    });
  }
}
