import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChannelType } from 'discord.js';
import { ThreadService } from '../../src/services/thread.service.js';

describe('ThreadService', () => {
  let service: ThreadService;

  beforeEach(() => {
    service = new ThreadService();
  });

  describe('createPrivateThread', () => {
    it('should create a private thread with correct params', async () => {
      const mockThread = {
        members: { add: vi.fn().mockResolvedValue(undefined) },
      };
      const mockChannel = {
        threads: { create: vi.fn().mockResolvedValue(mockThread) },
      };
      const mockUser = { id: 'user-123' };

      const result = await service.createPrivateThread(
        mockChannel as never,
        mockUser as never,
        'Issue: testuser - 2026-03-31'
      );

      expect(mockChannel.threads.create).toHaveBeenCalledWith({
        name: 'Issue: testuser - 2026-03-31',
        type: ChannelType.PrivateThread,
        autoArchiveDuration: 60,
        invitable: false,
      });
      expect(mockThread.members.add).toHaveBeenCalledWith('user-123');
      expect(result).toBe(mockThread);
    });
  });

  describe('sendMessage', () => {
    it('should send a message in the thread', async () => {
      const mockMessage = { id: 'msg-1', content: 'Hello' };
      const mockThread = {
        send: vi.fn().mockResolvedValue(mockMessage),
      };

      const result = await service.sendMessage(
        mockThread as never,
        'Hello'
      );

      expect(mockThread.send).toHaveBeenCalledWith('Hello');
      expect(result).toBe(mockMessage);
    });
  });

  describe('closeThread', () => {
    it('should archive and lock the thread', async () => {
      const mockThread = {
        setArchived: vi.fn().mockResolvedValue(undefined),
        setLocked: vi.fn().mockResolvedValue(undefined),
      };

      await service.closeThread(mockThread as never);

      expect(mockThread.setArchived).toHaveBeenCalledWith(true);
      expect(mockThread.setLocked).toHaveBeenCalledWith(true);
    });
  });
});
