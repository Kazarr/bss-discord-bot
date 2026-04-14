import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import { promisify } from 'util';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { config } from '../config.js';

const execFileAsync = promisify(execFile);

export interface AgentOptions {
  repoPath?: string;
  timeout?: number;
}

export class AgentService {
  private repoPath: string;
  private timeout: number;

  constructor(options?: AgentOptions) {
    this.repoPath = options?.repoPath ?? './.cache/bss-game';
    this.timeout = options?.timeout ?? 300000; // 5 minutes default
  }

  async ensureRepoInitialized(): Promise<void> {
    try {
      // Check if directory exists
      await fs.stat(this.repoPath);
      // Directory exists, pull latest
      await execFileAsync('git', ['pull'], {
        cwd: this.repoPath,
        timeout: this.timeout,
      });
    } catch {
      // Directory doesn't exist or pull failed, clone
      await fs.mkdir('./.cache', { recursive: true });
      const repoUrl = `https://x-access-token:${config.github.token}@github.com/Kazarr/By-Sword-and-Seal-Playground.git`;
      await execFileAsync('git', ['clone', repoUrl, this.repoPath], {
        timeout: this.timeout,
      });
    }
  }

  async analyzeCode(prompt: string, options?: AgentOptions): Promise<string> {
    await this.ensureRepoInitialized();
    const cwd = options?.repoPath ?? this.repoPath;
    return this.spawnSession(prompt, cwd);
  }

  private async spawnSession(userPrompt: string, cwd: string): Promise<string> {
    // Agent SDK call: scoped to the cloned BSS game repo, read-only tools
    const collected: string[] = [];

    for await (const message of query({
      prompt: userPrompt,
      options: {
        cwd,
        allowedTools: ['Read', 'Glob', 'Grep'],
      },
    })) {
      // Collect the final result message; ignore intermediate tool/assistant chunks
      if (message.type === 'result') {
        const result = (message as { result?: string }).result;
        if (result) {
          collected.push(result);
        }
      }
    }

    if (collected.length === 0) {
      throw new Error('Agent SDK returned no result');
    }

    return collected.join('\n');
  }
}
