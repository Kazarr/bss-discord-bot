import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: mockCreate };
  }
  return { default: MockAnthropic };
});

vi.mock('../../src/config.js', () => ({
  config: {
    anthropic: {
      apiKey: 'test-key',
      model: 'test-model',
    },
    similarityThreshold: '0.7',
  },
}));

import { ClaudeService } from '../../src/services/claude.service.js';

function makeResponse(text: string) {
  return { content: [{ type: 'text', text }] };
}

describe('ClaudeService', () => {
  let service: ClaudeService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ClaudeService();
  });

  describe('chat', () => {
    it('should send conversation messages and return response', async () => {
      mockCreate.mockResolvedValueOnce(
        makeResponse('Aký typ problému máš?')
      );

      const result = await service.chat(
        [{ role: 'user', content: 'Mám problém s hrou' }],
        'Budovy sa nestavajú'
      );

      expect(result).toBe('Aký typ problému máš?');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'test-model',
          max_tokens: 1024,
          messages: [
            { role: 'user', content: 'Mám problém s hrou' },
            { role: 'user', content: 'Budovy sa nestavajú' },
          ],
        })
      );
    });

    it('should return empty string when no text block in response', async () => {
      mockCreate.mockResolvedValueOnce({ content: [] });

      const result = await service.chat([], 'test');

      expect(result).toBe('');
    });
  });

  describe('summarize', () => {
    it('should generate a summary from conversation messages', async () => {
      mockCreate.mockResolvedValueOnce(
        makeResponse('Title: Building construction bug\n---\nBuildings fail to construct.')
      );

      const result = await service.summarize([
        { role: 'user', content: 'Budovy sa nestavajú' },
        { role: 'assistant', content: 'Aké budovy presne?' },
        { role: 'user', content: 'Všetky budovy v provincii' },
      ]);

      expect(result).toContain('Building construction bug');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: 'user',
              content: expect.stringContaining('User: Budovy sa nestavajú'),
            },
          ],
        })
      );
    });
  });

  describe('isGameRelated', () => {
    it('should return true for game-related messages', async () => {
      mockCreate.mockResolvedValueOnce(makeResponse('RELATED'));

      const result = await service.isGameRelated(
        'Produkcia dreva nefunguje správne'
      );

      expect(result).toBe(true);
    });

    it('should return false for unrelated messages', async () => {
      mockCreate.mockResolvedValueOnce(makeResponse('UNRELATED'));

      const result = await service.isGameRelated(
        'Aký je najlepší recept na pizzu?'
      );

      expect(result).toBe(false);
    });

    it('should return false when response is empty', async () => {
      mockCreate.mockResolvedValueOnce({ content: [] });

      const result = await service.isGameRelated('test');

      expect(result).toBe(false);
    });
  });

  describe('findSimilarIssue', () => {
    it('should return matched issue when Claude finds a match', async () => {
      mockCreate.mockResolvedValueOnce(
        makeResponse('MATCH: #1 (confidence: high)')
      );

      const result = await service.findSimilarIssue('Building bug', [
        {
          number: 1,
          title: 'Bug: Buildings broken',
          body: 'Buildings do not work',
          state: 'open',
          url: 'https://github.com/TestOwner/TestRepo/issues/1',
        },
      ]);

      expect(result.matched).toBe(true);
      expect(result.issue?.number).toBe(1);
      expect(result.confidence).toBe('high');
    });

    it('should return no match when Claude finds none', async () => {
      mockCreate.mockResolvedValueOnce(makeResponse('MATCH: none'));

      const result = await service.findSimilarIssue('New unique problem', [
        {
          number: 1,
          title: 'Different issue',
          body: 'Something else',
          state: 'open',
          url: 'https://github.com/TestOwner/TestRepo/issues/1',
        },
      ]);

      expect(result.matched).toBe(false);
      expect(result.issue).toBeUndefined();
    });

    it('should return no match when issues list is empty', async () => {
      const result = await service.findSimilarIssue('Any summary', []);

      expect(result.matched).toBe(false);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should return no match when matched issue number not in list', async () => {
      mockCreate.mockResolvedValueOnce(
        makeResponse('MATCH: #99 (confidence: medium)')
      );

      const result = await service.findSimilarIssue('Something', [
        {
          number: 1,
          title: 'Issue 1',
          body: 'Body 1',
          state: 'open',
          url: 'https://github.com/TestOwner/TestRepo/issues/1',
        },
      ]);

      expect(result.matched).toBe(false);
    });
  });
});
