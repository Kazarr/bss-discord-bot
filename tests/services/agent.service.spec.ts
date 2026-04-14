import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process using vi.hoisted pattern for ESM
const { mockExecFile } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFile: mockExecFile,
}));

// Mock fs using vi.hoisted pattern
const { mockStat, mockMkdir } = vi.hoisted(() => ({
  mockStat: vi.fn(),
  mockMkdir: vi.fn(),
}));

vi.mock('fs', () => ({
  promises: {
    stat: mockStat,
    mkdir: mockMkdir,
  },
}));

// Mock util
vi.mock('util', () => ({
  promisify: (fn: any) => fn,
}));

// Must import config before AgentService to ensure mocks are applied
vi.mock('../../src/config.js', () => ({
  config: {
    github: {
      token: 'mock-github-token',
    },
  },
}));

// Mock Agent SDK with vi.hoisted pattern (Lesson #14)
const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: mockQuery,
}));

// Helper: build an async iterable yielding the given messages
function asyncIter<T>(messages: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const m of messages) {
        yield m;
      }
    },
  };
}

import { AgentService } from '../../src/services/agent.service.js';

describe('AgentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with default repo path', () => {
    const service = new AgentService();
    expect(service).toBeDefined();
  });

  it('should initialize with custom repo path', () => {
    const service = new AgentService({ repoPath: '/custom/path' });
    expect(service).toBeDefined();
  });

  it('should initialize with custom timeout', () => {
    const service = new AgentService({ timeout: 120000 });
    expect(service).toBeDefined();
  });

  it('should clone repo if directory does not exist', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT: no such file'));
    mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });
    mockMkdir.mockResolvedValue(undefined);

    const service = new AgentService();
    await service.ensureRepoInitialized();

    expect(mockMkdir).toHaveBeenCalled();
    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['clone']),
      expect.any(Object)
    );
  });

  it('should pull repo if directory exists', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });

    const service = new AgentService();
    await service.ensureRepoInitialized();

    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      ['pull'],
      expect.objectContaining({ cwd: './.cache/bss-game' })
    );
  });

  it('should handle git errors gracefully', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockExecFile.mockRejectedValue(new Error('git command failed'));
    mockMkdir.mockResolvedValue(undefined);

    const service = new AgentService();
    // Should attempt to clone as fallback
    await expect(
      service.ensureRepoInitialized()
    ).rejects.toThrow('git command failed');
  });

  it('should use provided repo path in analyzeCode', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });
    mockQuery.mockReturnValue(asyncIter([{ type: 'result', result: 'analysis output' }]));

    const customPath = '/custom/repo/path';
    const service = new AgentService({ repoPath: customPath });

    const result = await service.analyzeCode('analyze this code');

    expect(result).toBe('analysis output');
    // Verify that ensureRepoInitialized was called
    expect(mockExecFile).toHaveBeenCalled();
    // Verify Agent SDK was called with correct cwd and allowedTools
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'analyze this code',
        options: expect.objectContaining({
          cwd: customPath,
          allowedTools: ['Read', 'Glob', 'Grep'],
        }),
      })
    );
  });

  it('should throw if Agent SDK returns no result', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });
    mockQuery.mockReturnValue(asyncIter<{ type: string; result?: string }>([]));

    const service = new AgentService();
    await expect(service.analyzeCode('p')).rejects.toThrow('Agent SDK returned no result');
  });

  it('should ignore non-result messages', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });
    mockQuery.mockReturnValue(
      asyncIter([
        { type: 'assistant', content: 'thinking...' },
        { type: 'tool_use', tool: 'Read' },
        { type: 'result', result: 'final answer' },
      ])
    );

    const service = new AgentService();
    const result = await service.analyzeCode('p');
    expect(result).toBe('final answer');
  });
});
