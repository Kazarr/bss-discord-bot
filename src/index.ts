import 'dotenv/config';
import { Client, Events, GatewayIntentBits, Interaction } from 'discord.js';
import { config } from './config.js';
import { deployCommands } from './commands/index.js';
import { handleIssueCommand } from './commands/issue.js';
import { handleAnalyzeCommand } from './commands/analyze.js';
import { handleStoryCommand } from './commands/story.js';
import { handleResearchCommand } from './commands/research.js';
import { handleWorkbenchCommand } from './commands/workbench.js';
import { ClaudeService } from './services/claude.service.js';
import { GitHubService } from './services/github.service.js';
import { ThreadService } from './services/thread.service.js';
import { AgentService } from './services/agent.service.js';
import { MessageHandler } from './handlers/message.handler.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const claudeService = new ClaudeService();
const githubService = new GitHubService();
const threadService = new ThreadService();
const agentService = new AgentService();
const messageHandler = new MessageHandler(
  claudeService,
  githubService,
  threadService
);

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot logged in as ${readyClient.user.tag}`);
  await deployCommands();
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  if (interaction.commandName === 'issue') {
    await handleIssueCommand(interaction, threadService, messageHandler);
  } else if (interaction.commandName === 'analyze') {
    await handleAnalyzeCommand(
      interaction,
      threadService,
      messageHandler,
      agentService
    );
  } else if (interaction.commandName === 'story') {
    await handleStoryCommand(
      interaction,
      threadService,
      messageHandler,
      agentService
    );
  } else if (interaction.commandName === 'research') {
    await handleResearchCommand(
      interaction,
      threadService,
      messageHandler,
      agentService
    );
  } else if (interaction.commandName === 'workbench') {
    await handleWorkbenchCommand(
      interaction,
      threadService,
      messageHandler,
      agentService
    );
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) {
    return;
  }

  if (!message.channel.isThread()) {
    return;
  }

  await messageHandler.handleMessage(message);
});

client.login(config.discord.token);

function shutdown(): void {
  console.log('Shutting down bot...');
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
