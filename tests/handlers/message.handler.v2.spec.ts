import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Message, ThreadChannel } from 'discord.js';
import { MessageHandler } from '../../src/handlers/message.handler.js';
import { ClaudeService } from '../../src/services/claude.service.js';
import { GitHubService } from '../../src/services/github.service.js';
import { ThreadService } from '../../src/services/thread.service.js';
import { AgentService } from '../../src/services/agent.service.js';

const mockClaudeService = {
  chat: vi.fn(),
  summarize: vi.fn(),
  isGameRelated: vi.fn(),
  findSimilarIssue: vi.fn(),
  generateCodeAnalysis: vi.fn(),
  generateUserStory: vi.fn(),
  generateResearch: vi.fn(),
  proposeArtifacts: vi.fn(),
};

const mockGitHubService = {
  fetchAllIssues: vi.fn(),
  createIssue: vi.fn(),
  addComment: vi.fn(),
  refreshCache: vi.fn(),
};

const mockThreadService = {
  createPrivateThread: vi.fn(),
  sendMessage: vi.fn(),
  closeThread: vi.fn(),
};

const mockAgentService = {
  ensureRepoInitialized: vi.fn(),
  analyzeCode: vi.fn(),
};

describe('MessageHandler - v2 phases', () => {
  let handler: MessageHandler;
  let mockMessage: Partial<Message>;
  let mockThread: Partial<ThreadChannel>;

  beforeEach(() => {
    vi.clearAllMocks();

    handler = new MessageHandler(
      mockClaudeService as any,
      mockGitHubService as any,
      mockThreadService as any,
      mockAgentService as any
    );

    mockMessage = {
      author: {
        id: 'mock-user-id',
        username: 'testuser',
      } as any,
      content: 'test message',
      channel: {
        isThread: () => true,
        id: 'mock-thread-id',
      } as any,
    };

    mockThread = {
      id: 'mock-thread-id',
      url: 'https://discord.com/channels/mock-thread-url',
    } as any;

    (mockMessage.channel as any) = mockThread;
  });

  describe('v2-analyzing phase', () => {
    it('should handle v2-analyzing messages', async () => {
      handler.initConversation('mock-thread-id', 'mock-user-id');
      const state = handler.getConversation('mock-thread-id');
      if (state) {
        state.phase = 'v2-analyzing';
        state.commandType = 'analyze';
      }

      mockAgentService.analyzeCode.mockResolvedValue('code analysis result');
      mockClaudeService.generateCodeAnalysis.mockResolvedValue(
        'Analyzed code structure...'
      );

      await handler.handleMessage(mockMessage as Message);

      expect(mockAgentService.analyzeCode).toHaveBeenCalledWith('test message');
      expect(mockClaudeService.generateCodeAnalysis).toHaveBeenCalled();
      expect(mockThreadService.sendMessage).toHaveBeenCalled();
    });

    it('should transition to confirming after analysis', async () => {
      handler.initConversation('mock-thread-id', 'mock-user-id');
      const state = handler.getConversation('mock-thread-id');
      if (state) {
        state.phase = 'v2-analyzing';
        state.commandType = 'analyze';
      }

      mockAgentService.analyzeCode.mockResolvedValue('code analysis');
      mockClaudeService.generateCodeAnalysis.mockResolvedValue(
        'Analysis complete'
      );

      await handler.handleMessage(mockMessage as Message);

      const updatedState = handler.getConversation('mock-thread-id');
      expect(updatedState?.phase).toBe('confirming');
    });

    it('should handle agent spawn failure gracefully', async () => {
      handler.initConversation('mock-thread-id', 'mock-user-id');
      const state = handler.getConversation('mock-thread-id');
      if (state) {
        state.phase = 'v2-analyzing';
        state.commandType = 'analyze';
      }

      mockAgentService.analyzeCode.mockRejectedValue(
        new Error('Agent spawn failed')
      );

      await handler.handleMessage(mockMessage as Message);

      expect(mockThreadService.sendMessage).toHaveBeenCalledWith(
        expect.any(Object),
        expect.stringContaining('chyba')
      );
    });
  });

  describe('v2-story-drafting phase', () => {
    it('should handle v2-story-drafting messages', async () => {
      handler.initConversation('mock-thread-id', 'mock-user-id');
      const state = handler.getConversation('mock-thread-id');
      if (state) {
        state.phase = 'v2-story-drafting';
        state.commandType = 'story';
      }

      mockClaudeService.generateUserStory.mockResolvedValue(
        'As a user...\nI want...\nSo that...'
      );

      await handler.handleMessage(mockMessage as Message);

      expect(mockClaudeService.generateUserStory).toHaveBeenCalledWith(
        'test message'
      );
      expect(mockThreadService.sendMessage).toHaveBeenCalled();
    });

    it('should transition to confirming after story generation', async () => {
      handler.initConversation('mock-thread-id', 'mock-user-id');
      const state = handler.getConversation('mock-thread-id');
      if (state) {
        state.phase = 'v2-story-drafting';
        state.commandType = 'story';
      }

      mockClaudeService.generateUserStory.mockResolvedValue('User story text');

      await handler.handleMessage(mockMessage as Message);

      const updatedState = handler.getConversation('mock-thread-id');
      expect(updatedState?.phase).toBe('confirming');
    });
  });

  describe('v2-research-investigating phase', () => {
    it('should handle v2-research-investigating messages', async () => {
      handler.initConversation('mock-thread-id', 'mock-user-id');
      const state = handler.getConversation('mock-thread-id');
      if (state) {
        state.phase = 'v2-research-investigating';
        state.commandType = 'research';
      }

      mockClaudeService.generateResearch.mockResolvedValue('Research findings');

      await handler.handleMessage(mockMessage as Message);

      expect(mockClaudeService.generateResearch).toHaveBeenCalledWith(
        'test message'
      );
      expect(mockThreadService.sendMessage).toHaveBeenCalled();
    });

    it('should transition to confirming after research', async () => {
      handler.initConversation('mock-thread-id', 'mock-user-id');
      const state = handler.getConversation('mock-thread-id');
      if (state) {
        state.phase = 'v2-research-investigating';
        state.commandType = 'research';
      }

      mockClaudeService.generateResearch.mockResolvedValue('Research notes');

      await handler.handleMessage(mockMessage as Message);

      const updatedState = handler.getConversation('mock-thread-id');
      expect(updatedState?.phase).toBe('confirming');
    });
  });

  describe('v2-workbench phase', () => {
    it('should handle free-form conversation', async () => {
      handler.initConversation('mock-thread-id', 'mock-user-id');
      const state = handler.getConversation('mock-thread-id');
      if (state) {
        state.phase = 'v2-workbench';
        state.commandType = 'workbench';
      }

      mockClaudeService.chat.mockResolvedValue('Response to your question');

      await handler.handleMessage(mockMessage as Message);

      expect(mockClaudeService.chat).toHaveBeenCalledWith(
        expect.any(Array),
        'test message'
      );
      expect(mockThreadService.sendMessage).toHaveBeenCalled();
    });

    it('should transition to proposing on explicit end', async () => {
      handler.initConversation('mock-thread-id', 'mock-user-id');
      const state = handler.getConversation('mock-thread-id');
      if (state) {
        state.phase = 'v2-workbench';
        state.commandType = 'workbench';
      }

      mockClaudeService.proposeArtifacts.mockResolvedValue([]);
      (mockMessage as any).content = 'hotovo';

      await handler.handleMessage(mockMessage as Message);

      const updatedState = handler.getConversation('mock-thread-id');
      expect(updatedState?.phase).toBe('done');
    });

    it('should transition to proposing on [END_CONVERSATION] marker', async () => {
      handler.initConversation('mock-thread-id', 'mock-user-id');
      const state = handler.getConversation('mock-thread-id');
      if (state) {
        state.phase = 'v2-workbench';
        state.commandType = 'workbench';
      }

      mockClaudeService.chat.mockResolvedValue(
        'Conversation summary [END_CONVERSATION]'
      );
      mockClaudeService.proposeArtifacts.mockResolvedValue([]);

      await handler.handleMessage(mockMessage as Message);

      const updatedState = handler.getConversation('mock-thread-id');
      expect(updatedState?.phase).toBe('done');
    });
  });

  describe('v2-proposing-artifacts phase', () => {
    it('should create issues with artifact proposals', async () => {
      handler.initConversation('mock-thread-id', 'mock-user-id');
      const state = handler.getConversation('mock-thread-id');
      if (state) {
        state.phase = 'v2-proposing-artifacts';
        state.commandType = 'workbench';
      }

      mockClaudeService.proposeArtifacts.mockResolvedValue([
        { type: 'analysis', title: 'Code Analysis', content: 'Analysis text' },
      ]);

      await handler.handleMessage(mockMessage as Message);

      expect(mockClaudeService.proposeArtifacts).toHaveBeenCalled();
      expect(mockThreadService.sendMessage).toHaveBeenCalledWith(
        expect.any(Object),
        expect.stringContaining('artefakty')
      );
    });

    it('should close thread if no artifacts proposed', async () => {
      handler.initConversation('mock-thread-id', 'mock-user-id');
      const state = handler.getConversation('mock-thread-id');
      if (state) {
        state.phase = 'v2-proposing-artifacts';
        state.commandType = 'workbench';
      }

      mockClaudeService.proposeArtifacts.mockResolvedValue([]);

      await handler.handleMessage(mockMessage as Message);

      expect(mockThreadService.closeThread).toHaveBeenCalled();
      const updatedState = handler.getConversation('mock-thread-id');
      expect(updatedState).toBeUndefined();
    });
  });

  describe('confirming phase with v2 labels', () => {
    it('should create issue with analysis label for analyze command', async () => {
      handler.initConversation('mock-thread-id', 'mock-user-id');
      const state = handler.getConversation('mock-thread-id');
      if (state) {
        state.phase = 'confirming';
        state.commandType = 'analyze';
        state.summary = 'Code Analysis';
      }

      mockGitHubService.fetchAllIssues.mockResolvedValue([]);
      mockGitHubService.createIssue.mockResolvedValue({
        number: 123,
        url: 'https://github.com/issue/123',
      } as any);

      (mockMessage as any).content = 'áno';

      await handler.handleMessage(mockMessage as Message);

      expect(mockGitHubService.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: ['analysis'],
        })
      );
    });

    it('should create issue with user-story label for story command', async () => {
      handler.initConversation('mock-thread-id', 'mock-user-id');
      const state = handler.getConversation('mock-thread-id');
      if (state) {
        state.phase = 'confirming';
        state.commandType = 'story';
        state.summary = 'User story';
      }

      mockGitHubService.fetchAllIssues.mockResolvedValue([]);
      mockGitHubService.createIssue.mockResolvedValue({
        number: 124,
        url: 'https://github.com/issue/124',
      } as any);

      (mockMessage as any).content = 'áno';

      await handler.handleMessage(mockMessage as Message);

      expect(mockGitHubService.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: ['user-story'],
        })
      );
    });

    it('should create issue with research label for research command', async () => {
      handler.initConversation('mock-thread-id', 'mock-user-id');
      const state = handler.getConversation('mock-thread-id');
      if (state) {
        state.phase = 'confirming';
        state.commandType = 'research';
        state.summary = 'Research findings';
      }

      mockGitHubService.fetchAllIssues.mockResolvedValue([]);
      mockGitHubService.createIssue.mockResolvedValue({
        number: 125,
        url: 'https://github.com/issue/125',
      } as any);

      (mockMessage as any).content = 'áno';

      await handler.handleMessage(mockMessage as Message);

      expect(mockGitHubService.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: ['research'],
        })
      );
    });

    it('should not include labels for issue command', async () => {
      handler.initConversation('mock-thread-id', 'mock-user-id');
      const state = handler.getConversation('mock-thread-id');
      if (state) {
        state.phase = 'confirming';
        state.commandType = 'issue';
        state.summary = 'Issue report';
      }

      mockGitHubService.fetchAllIssues.mockResolvedValue([]);
      mockGitHubService.createIssue.mockResolvedValue({
        number: 126,
        url: 'https://github.com/issue/126',
      } as any);

      (mockMessage as any).content = 'áno';

      await handler.handleMessage(mockMessage as Message);

      expect(mockGitHubService.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: [],
        })
      );
    });
  });
});
