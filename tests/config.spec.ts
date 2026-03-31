import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('config', () => {
  const REQUIRED_VARS = {
    DISCORD_TOKEN: 'test-discord-token',
    DISCORD_GUILD_ID: 'test-guild-id',
    DISCORD_CHANNEL_ID: 'test-channel-id',
    ANTHROPIC_API_KEY: 'test-anthropic-key',
    GITHUB_TOKEN: 'test-github-token',
    GITHUB_OWNER: 'TestOwner',
    GITHUB_REPO: 'TestRepo',
  };

  beforeEach(() => {
    vi.resetModules();
    for (const key of Object.keys(process.env)) {
      if (key in REQUIRED_VARS || key === 'CLAUDE_MODEL' || key === 'SIMILARITY_THRESHOLD') {
        delete process.env[key];
      }
    }
  });

  it('should throw on missing required environment variables', async () => {
    await expect(import('../src/config.js')).rejects.toThrow(
      'Missing required environment variables'
    );
  });

  it('should throw with all missing variable names listed', async () => {
    await expect(import('../src/config.js')).rejects.toThrow('DISCORD_TOKEN');
  });

  it('should load config with all required vars present', async () => {
    Object.assign(process.env, REQUIRED_VARS);

    const { config } = await import('../src/config.js');

    expect(config.discord.token).toBe('test-discord-token');
    expect(config.discord.guildId).toBe('test-guild-id');
    expect(config.discord.channelId).toBe('test-channel-id');
    expect(config.anthropic.apiKey).toBe('test-anthropic-key');
    expect(config.github.token).toBe('test-github-token');
    expect(config.github.owner).toBe('TestOwner');
    expect(config.github.repo).toBe('TestRepo');
  });

  it('should use default CLAUDE_MODEL when not set', async () => {
    Object.assign(process.env, REQUIRED_VARS);

    const { config } = await import('../src/config.js');

    expect(config.anthropic.model).toBe('claude-sonnet-4-20250514');
  });

  it('should use custom CLAUDE_MODEL when set', async () => {
    Object.assign(process.env, REQUIRED_VARS, {
      CLAUDE_MODEL: 'claude-opus-4-20250514',
    });

    const { config } = await import('../src/config.js');

    expect(config.anthropic.model).toBe('claude-opus-4-20250514');
  });

  it('should use default SIMILARITY_THRESHOLD when not set', async () => {
    Object.assign(process.env, REQUIRED_VARS);

    const { config } = await import('../src/config.js');

    expect(config.similarityThreshold).toBe('0.7');
  });

  it('should use custom SIMILARITY_THRESHOLD when set', async () => {
    Object.assign(process.env, REQUIRED_VARS, {
      SIMILARITY_THRESHOLD: '0.8',
    });

    const { config } = await import('../src/config.js');

    expect(config.similarityThreshold).toBe('0.8');
  });
});
