import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatInputCommandInteraction } from 'discord.js';
import { handleAnalyzeCommand, analyzeCommand } from '../../src/commands/analyze.js';
import { ThreadService } from '../../src/services/thread.service.js';
import { MessageHandler } from '../../src/handlers/message.handler.js';
import { AgentService } from '../../src/services/agent.service.js';

const mockThreadService = {
  createPrivateThread: vi.fn(),
  sendMessage: vi.fn(),
  closeThread: vi.fn(),
};

const mockMessageHandler = {
  initConversation: vi.fn(),
  getConversation: vi.fn(() => ({
    threadId: 'mock-thread-id',
    userId: 'mock-user-id',
    messages: [],
    phase: 'v2-analyzing',
    commandType: 'analyze',
  })),
  handleMessage: vi.fn(),
};

const mockAgentService = {
  ensureRepoInitialized: vi.fn(),
  analyzeCode: vi.fn(),
};

describe('analyze command', () => {
  let mockInteraction: Partial<ChatInputCommandInteraction>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockInteraction = {
      commandName: 'analyze',
      user: {
        username: 'testuser',
        id: 'mock-user-id',
      } as any,
      member: {
        permissions: {
          has: vi.fn(() => true),
        },
      } as any,
      channelId: 'mock-channel-id',
      channel: {
        type: 0, // GuildText
      } as any,
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('should export analyzeCommand', () => {
    expect(analyzeCommand).toBeDefined();
  });

  it('should allow admin users to create analyze thread', async () => {
    mockThreadService.createPrivateThread.mockResolvedValue({
      id: 'mock-thread-id',
    });

    await handleAnalyzeCommand(
      mockInteraction as ChatInputCommandInteraction,
      mockThreadService as any,
      mockMessageHandler as any,
      mockAgentService as any
    );

    expect(mockThreadService.createPrivateThread).toHaveBeenCalled();
    expect(mockMessageHandler.initConversation).toHaveBeenCalledWith(
      'mock-thread-id',
      'mock-user-id'
    );
    expect(mockThreadService.sendMessage).toHaveBeenCalled();
  });

  it('should reject non-admin users', async () => {
    (mockInteraction.member as any).permissions.has = vi.fn(() => false);

    await handleAnalyzeCommand(
      mockInteraction as ChatInputCommandInteraction,
      mockThreadService as any,
      mockMessageHandler as any,
      mockAgentService as any
    );

    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('administrátorom'),
        ephemeral: true,
      })
    );
    expect(mockThreadService.createPrivateThread).not.toHaveBeenCalled();
  });

  it('should set commandType to analyze in conversation state', async () => {
    mockThreadService.createPrivateThread.mockResolvedValue({
      id: 'mock-thread-id',
    });
    const mockState = {
      threadId: 'mock-thread-id',
      userId: 'mock-user-id',
      messages: [],
      phase: 'v2-analyzing',
    };
    (mockMessageHandler.getConversation as any).mockReturnValue(mockState);

    await handleAnalyzeCommand(
      mockInteraction as ChatInputCommandInteraction,
      mockThreadService as any,
      mockMessageHandler as any,
      mockAgentService as any
    );

    expect(mockState.phase).toBe('v2-analyzing');
    expect((mockState as any).commandType).toBe('analyze');
  });
});
