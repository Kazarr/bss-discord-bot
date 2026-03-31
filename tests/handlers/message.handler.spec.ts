import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageHandler } from '../../src/handlers/message.handler.js';

function createMockServices() {
  return {
    claudeService: {
      chat: vi.fn(),
      summarize: vi.fn(),
      isGameRelated: vi.fn(),
      findSimilarIssue: vi.fn(),
    },
    githubService: {
      fetchAllIssues: vi.fn(),
      createIssue: vi.fn(),
      addComment: vi.fn(),
      refreshCache: vi.fn(),
    },
    threadService: {
      createPrivateThread: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      closeThread: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function createMockMessage(
  content: string,
  userId: string,
  threadId: string
) {
  return {
    content,
    author: { id: userId, username: 'testuser' },
    channel: { id: threadId, url: 'https://discord.com/channels/test' },
  };
}

describe('MessageHandler', () => {
  let handler: MessageHandler;
  let services: ReturnType<typeof createMockServices>;

  beforeEach(() => {
    vi.clearAllMocks();
    services = createMockServices();
    handler = new MessageHandler(
      services.claudeService as never,
      services.githubService as never,
      services.threadService as never
    );
  });

  describe('initConversation', () => {
    it('should initialize a new conversation state', () => {
      handler.initConversation('thread-1', 'user-1');

      const state = handler.getConversation('thread-1');
      expect(state).toEqual({
        threadId: 'thread-1',
        userId: 'user-1',
        messages: [],
        phase: 'collecting',
      });
    });
  });

  describe('handleMessage — collecting phase', () => {
    it('should reject off-topic first message and close thread', async () => {
      handler.initConversation('thread-1', 'user-1');
      services.claudeService.isGameRelated.mockResolvedValue(false);

      const msg = createMockMessage('pizza recipe', 'user-1', 'thread-1');
      await handler.handleMessage(msg as never);

      expect(services.claudeService.isGameRelated).toHaveBeenCalledWith(
        'pizza recipe'
      );
      expect(services.threadService.sendMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('nesúvisí s hrou')
      );
      expect(services.threadService.closeThread).toHaveBeenCalled();
      expect(handler.getConversation('thread-1')).toBeUndefined();
    });

    it('should chat with Claude on game-related message', async () => {
      handler.initConversation('thread-1', 'user-1');
      services.claudeService.isGameRelated.mockResolvedValue(true);
      services.claudeService.chat.mockResolvedValue(
        'Aký typ problému máš?'
      );

      const msg = createMockMessage(
        'Budovy sa nestavajú',
        'user-1',
        'thread-1'
      );
      await handler.handleMessage(msg as never);

      expect(services.claudeService.chat).toHaveBeenCalled();
      expect(services.threadService.sendMessage).toHaveBeenCalledWith(
        expect.anything(),
        'Aký typ problému máš?'
      );
    });

    it('should transition to summarizing when Claude signals ready', async () => {
      handler.initConversation('thread-1', 'user-1');
      services.claudeService.isGameRelated.mockResolvedValue(true);
      services.claudeService.chat.mockResolvedValue(
        'OK [READY_TO_SUMMARIZE]'
      );
      services.claudeService.summarize.mockResolvedValue(
        'Title: Building bug\n---\nBuildings fail.'
      );

      const msg = createMockMessage('Bug report', 'user-1', 'thread-1');
      await handler.handleMessage(msg as never);

      expect(services.claudeService.summarize).toHaveBeenCalled();
      expect(services.threadService.sendMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('Chceš vytvoriť GitHub issue?')
      );
      const state = handler.getConversation('thread-1');
      expect(state?.phase).toBe('confirming');
    });

    it('should skip scope filter for subsequent messages', async () => {
      handler.initConversation('thread-1', 'user-1');

      // First message — scope filter runs
      services.claudeService.isGameRelated.mockResolvedValue(true);
      services.claudeService.chat.mockResolvedValue('Tell me more');
      const msg1 = createMockMessage('Bug', 'user-1', 'thread-1');
      await handler.handleMessage(msg1 as never);

      // Second message — scope filter should NOT run
      services.claudeService.chat.mockResolvedValue('Got it');
      const msg2 = createMockMessage('More details', 'user-1', 'thread-1');
      await handler.handleMessage(msg2 as never);

      expect(services.claudeService.isGameRelated).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleMessage — confirming phase', () => {
    async function setupConfirmingState() {
      handler.initConversation('thread-1', 'user-1');
      const state = handler.getConversation('thread-1')!;
      state.phase = 'confirming';
      state.summary =
        'Title: Building bug\n---\nBuildings fail to construct.';
      state.messages = [
        { role: 'user', content: 'Bug' },
        { role: 'assistant', content: 'Summary' },
      ];
    }

    it('should create new issue when user confirms and no similar issue', async () => {
      await setupConfirmingState();
      services.githubService.fetchAllIssues.mockResolvedValue([]);
      services.claudeService.findSimilarIssue.mockResolvedValue({
        matched: false,
      });
      services.githubService.createIssue.mockResolvedValue({
        number: 1,
        title: 'Building bug',
        body: 'Buildings fail.',
        state: 'open',
        url: 'https://github.com/TestOwner/TestRepo/issues/1',
      });

      const msg = createMockMessage('áno', 'user-1', 'thread-1');
      await handler.handleMessage(msg as never);

      expect(services.githubService.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Building bug',
        })
      );
      expect(services.threadService.sendMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('Nový GitHub issue bol vytvorený')
      );
      expect(services.threadService.closeThread).toHaveBeenCalled();
      expect(handler.getConversation('thread-1')).toBeUndefined();
    });

    it('should attach comment when similar issue exists', async () => {
      await setupConfirmingState();
      const existingIssue = {
        number: 5,
        title: 'Building construction bug',
        body: 'Buildings broken',
        state: 'open',
        url: 'https://github.com/TestOwner/TestRepo/issues/5',
      };
      services.githubService.fetchAllIssues.mockResolvedValue([
        existingIssue,
      ]);
      services.claudeService.findSimilarIssue.mockResolvedValue({
        matched: true,
        issue: existingIssue,
        confidence: 'high',
      });

      const msg = createMockMessage('yes', 'user-1', 'thread-1');
      await handler.handleMessage(msg as never);

      expect(services.githubService.addComment).toHaveBeenCalledWith(
        5,
        expect.stringContaining('Related report from Discord user')
      );
      expect(services.githubService.createIssue).not.toHaveBeenCalled();
      expect(services.threadService.sendMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('Podobný issue už existuje')
      );
      expect(services.threadService.closeThread).toHaveBeenCalled();
    });

    it('should go back to collecting when user declines', async () => {
      await setupConfirmingState();

      const msg = createMockMessage('nie', 'user-1', 'thread-1');
      await handler.handleMessage(msg as never);

      expect(services.threadService.sendMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('upraviť')
      );
      const state = handler.getConversation('thread-1');
      expect(state?.phase).toBe('collecting');
      expect(state?.summary).toBeUndefined();
    });

    it('should ask for valid answer on unrecognized response', async () => {
      await setupConfirmingState();

      const msg = createMockMessage('maybe', 'user-1', 'thread-1');
      await handler.handleMessage(msg as never);

      expect(services.threadService.sendMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('Odpovedz prosím')
      );
      const state = handler.getConversation('thread-1');
      expect(state?.phase).toBe('confirming');
    });
  });

  describe('handleMessage — edge cases', () => {
    it('should ignore messages from non-conversation threads', async () => {
      const msg = createMockMessage('test', 'user-1', 'unknown-thread');
      await handler.handleMessage(msg as never);

      expect(services.claudeService.chat).not.toHaveBeenCalled();
    });

    it('should ignore messages from different users', async () => {
      handler.initConversation('thread-1', 'user-1');

      const msg = createMockMessage('test', 'user-2', 'thread-1');
      await handler.handleMessage(msg as never);

      expect(services.claudeService.chat).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      handler.initConversation('thread-1', 'user-1');
      services.claudeService.isGameRelated.mockRejectedValue(
        new Error('API down')
      );

      const msg = createMockMessage('test', 'user-1', 'thread-1');
      await handler.handleMessage(msg as never);

      expect(services.threadService.sendMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('Nastala chyba')
      );
    });
  });
});
