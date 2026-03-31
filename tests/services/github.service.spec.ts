import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPaginate, mockCreateIssue, mockCreateComment, mockListForRepo } =
  vi.hoisted(() => ({
    mockPaginate: vi.fn(),
    mockCreateIssue: vi.fn(),
    mockCreateComment: vi.fn(),
    mockListForRepo: vi.fn(),
  }));

vi.mock('@octokit/rest', () => {
  class MockOctokit {
    paginate = mockPaginate;
    rest = {
      issues: {
        listForRepo: mockListForRepo,
        create: mockCreateIssue,
        createComment: mockCreateComment,
      },
    };
  }
  return { Octokit: MockOctokit };
});

vi.mock('../../src/config.js', () => ({
  config: {
    github: {
      token: 'test-token',
      owner: 'TestOwner',
      repo: 'TestRepo',
    },
  },
}));

import { GitHubService } from '../../src/services/github.service.js';

describe('GitHubService', () => {
  let service: GitHubService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GitHubService();
  });

  describe('fetchAllIssues', () => {
    it('should fetch and map issues from GitHub', async () => {
      mockPaginate.mockResolvedValueOnce([
        {
          number: 1,
          title: 'Bug: UI broken',
          body: 'The UI is broken',
          state: 'open',
          html_url: 'https://github.com/TestOwner/TestRepo/issues/1',
        },
        {
          number: 2,
          title: 'Feature: Add map',
          body: null,
          state: 'closed',
          html_url: 'https://github.com/TestOwner/TestRepo/issues/2',
        },
      ]);

      const issues = await service.fetchAllIssues();

      expect(issues).toHaveLength(2);
      expect(issues[0]).toEqual({
        number: 1,
        title: 'Bug: UI broken',
        body: 'The UI is broken',
        state: 'open',
        url: 'https://github.com/TestOwner/TestRepo/issues/1',
      });
      expect(issues[1].body).toBe('');
    });

    it('should return cached issues within TTL', async () => {
      mockPaginate.mockResolvedValueOnce([
        {
          number: 1,
          title: 'Test',
          body: 'Test body',
          state: 'open',
          html_url: 'https://github.com/TestOwner/TestRepo/issues/1',
        },
      ]);

      await service.fetchAllIssues();
      const cached = await service.fetchAllIssues();

      expect(mockPaginate).toHaveBeenCalledTimes(1);
      expect(cached).toHaveLength(1);
    });

    it('should throw descriptive error on 404', async () => {
      const error = new Error('Not Found') as Error & { status: number };
      error.status = 404;
      mockPaginate.mockRejectedValueOnce(error);

      await expect(service.fetchAllIssues()).rejects.toThrow(
        'not found'
      );
    });

    it('should throw descriptive error on 403', async () => {
      const error = new Error('Forbidden') as Error & { status: number };
      error.status = 403;
      mockPaginate.mockRejectedValueOnce(error);

      await expect(service.fetchAllIssues()).rejects.toThrow(
        'rate limit'
      );
    });
  });

  describe('createIssue', () => {
    it('should create an issue and invalidate cache', async () => {
      mockCreateIssue.mockResolvedValueOnce({
        data: {
          number: 42,
          title: 'New issue',
          body: 'Issue body',
          state: 'open',
          html_url: 'https://github.com/TestOwner/TestRepo/issues/42',
        },
      });

      const issue = await service.createIssue({
        title: 'New issue',
        body: 'Issue body',
      });

      expect(issue.number).toBe(42);
      expect(issue.url).toBe(
        'https://github.com/TestOwner/TestRepo/issues/42'
      );
    });
  });

  describe('addComment', () => {
    it('should add a comment to an existing issue', async () => {
      mockCreateComment.mockResolvedValueOnce({});

      await service.addComment(1, 'Test comment');

      expect(mockCreateComment).toHaveBeenCalledWith({
        owner: 'TestOwner',
        repo: 'TestRepo',
        issue_number: 1,
        body: 'Test comment',
      });
    });
  });

  describe('refreshCache', () => {
    it('should force a fresh fetch on next call', async () => {
      mockPaginate
        .mockResolvedValueOnce([
          {
            number: 1,
            title: 'Old',
            body: '',
            state: 'open',
            html_url: 'https://github.com/TestOwner/TestRepo/issues/1',
          },
        ])
        .mockResolvedValueOnce([
          {
            number: 1,
            title: 'Old',
            body: '',
            state: 'open',
            html_url: 'https://github.com/TestOwner/TestRepo/issues/1',
          },
          {
            number: 2,
            title: 'New',
            body: '',
            state: 'open',
            html_url: 'https://github.com/TestOwner/TestRepo/issues/2',
          },
        ]);

      await service.fetchAllIssues();
      await service.refreshCache();
      const issues = await service.fetchAllIssues();

      expect(mockPaginate).toHaveBeenCalledTimes(2);
      expect(issues).toHaveLength(2);
    });
  });
});
