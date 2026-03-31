import { BotConfig } from './types/index.js';

const REQUIRED_VARS = [
  'DISCORD_TOKEN',
  'DISCORD_GUILD_ID',
  'DISCORD_CHANNEL_ID',
  'ANTHROPIC_API_KEY',
  'GITHUB_TOKEN',
  'GITHUB_OWNER',
  'GITHUB_REPO',
] as const;

function getRequiredVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        'See .env.example for the full list of required variables.'
    );
  }
  return value;
}

function validateConfig(): BotConfig {
  const missing: string[] = [];

  for (const name of REQUIRED_VARS) {
    if (!process.env[name]) {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        'See .env.example for the full list of required variables.'
    );
  }

  return {
    discord: {
      token: getRequiredVar('DISCORD_TOKEN'),
      guildId: getRequiredVar('DISCORD_GUILD_ID'),
      channelId: getRequiredVar('DISCORD_CHANNEL_ID'),
    },
    anthropic: {
      apiKey: getRequiredVar('ANTHROPIC_API_KEY'),
      model: process.env['CLAUDE_MODEL'] || 'claude-sonnet-4-20250514',
    },
    github: {
      token: getRequiredVar('GITHUB_TOKEN'),
      owner: getRequiredVar('GITHUB_OWNER'),
      repo: getRequiredVar('GITHUB_REPO'),
    },
    similarityThreshold: process.env['SIMILARITY_THRESHOLD'] || '0.7',
  };
}

export const config = validateConfig();
