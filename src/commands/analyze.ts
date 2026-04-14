import {
  ChatInputCommandInteraction,
  ChannelType,
  SlashCommandBuilder,
  TextChannel,
} from 'discord.js';
import { config } from '../config.js';
import { checkAdminPermission } from '../services/admin.guard.js';
import { ThreadService } from '../services/thread.service.js';
import { MessageHandler } from '../handlers/message.handler.js';
import { AgentService } from '../services/agent.service.js';

export const analyzeCommand = new SlashCommandBuilder()
  .setName('analyze')
  .setDescription('Code-aware analysis of the BSS game codebase');

export async function handleAnalyzeCommand(
  interaction: ChatInputCommandInteraction,
  threadService: ThreadService,
  messageHandler: MessageHandler,
  agentService: AgentService
): Promise<void> {
  const isAdmin = await checkAdminPermission(interaction);
  if (!isAdmin) {
    await interaction.reply({
      content: 'Tento príkaz je dostupný len administrátorom.',
      ephemeral: true,
    });
    return;
  }

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
    await interaction.deferReply({ ephemeral: true });

    const date = new Date().toISOString().split('T')[0];
    const threadName = `Issue: ${interaction.user.username} - ${date}`;

    const thread = await threadService.createPrivateThread(
      channel as TextChannel,
      interaction.user,
      threadName
    );

    messageHandler.initConversation(thread.id, interaction.user.id);
    const state = messageHandler.getConversation(thread.id);
    if (state) {
      state.phase = 'v2-analyzing';
      state.commandType = 'analyze';
    }

    await threadService.sendMessage(
      thread,
      'Čo by si chcel/a analyzovať?'
    );

    await interaction.editReply({
      content: 'Vytvoril som ti privátne vlákno. Pokračuj tam.',
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error('Error creating analyze thread:', errorMessage);
    if (interaction.deferred) {
      await interaction.editReply({
        content:
          'Nastala chyba pri vytváraní vlákna. Skús to prosím neskôr.',
      });
    } else {
      await interaction.reply({
        content:
          'Nastala chyba pri vytváraní vlákna. Skús to prosím neskôr.',
        ephemeral: true,
      });
    }
  }
}
