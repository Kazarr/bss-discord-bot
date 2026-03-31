import { REST, Routes } from 'discord.js';
import { config } from '../config.js';
import { issueCommand } from './issue.js';

export async function deployCommands(): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(config.discord.token);

  const commands = [issueCommand.toJSON()];

  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(
        (await rest.get(Routes.currentApplication()) as { id: string }).id,
        config.discord.guildId
      ),
      { body: commands }
    );
    console.log('Slash commands registered successfully.');
  } catch (error) {
    console.error('Failed to register slash commands:', error);
    throw error;
  }
}
