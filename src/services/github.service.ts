import { Octokit } from '@octokit/rest';
import { config } from '../config.js';
import { GitHubIssue, IssueData } from '../types/index.js';

const CACHE_TTL_MS = 15 * 60 * 1000;

export class GitHubService {
  private octokit: Octokit;
  private cachedIssues: GitHubIssue[] = [];
  private cacheTimestamp = 0;

  constructor() {
    this.octokit = new Octokit({ auth: config.github.token });
  }

  async fetchAllIssues(): Promise<GitHubIssue[]> {
    const now = Date.now();
    if (this.cachedIssues.length > 0 && now - this.cacheTimestamp < CACHE_TTL_MS) {
      return this.cachedIssues;
    }

    try {
      const issues = await this.octokit.paginate(
        this.octokit.rest.issues.listForRepo,
        {
          owner: config.github.owner,
          repo: config.github.repo,
          state: 'all',
          per_page: 100,
        }
      );

      this.cachedIssues = issues.map((issue) => ({
        number: issue.number,
        title: issue.title,
        body: issue.body || '',
        state: issue.state ?? 'open',
        url: issue.html_url,
      }));
      this.cacheTimestamp = Date.now();

      return this.cachedIssues;
    } catch (error) {
      if (error instanceof Error && 'status' in error) {
        const status = (error as { status: number }).status;
        if (status === 404) {
          throw new Error(
            `GitHub repository ${config.github.owner}/${config.github.repo} not found. ` +
              'Check GITHUB_OWNER and GITHUB_REPO environment variables.'
          );
        }
        if (status === 403) {
          throw new Error(
            'GitHub API rate limit exceeded or insufficient permissions. ' +
              'Check GITHUB_TOKEN permissions.'
          );
        }
      }
      throw error;
    }
  }

  async createIssue(data: IssueData): Promise<GitHubIssue> {
    const response = await this.octokit.rest.issues.create({
      owner: config.github.owner,
      repo: config.github.repo,
      title: data.title,
      body: data.body,
      labels: data.labels,
    });

    this.cacheTimestamp = 0;

    return {
      number: response.data.number,
      title: response.data.title,
      body: response.data.body || '',
      state: response.data.state ?? 'open',
      url: response.data.html_url,
    };
  }

  async addComment(issueNumber: number, body: string): Promise<void> {
    await this.octokit.rest.issues.createComment({
      owner: config.github.owner,
      repo: config.github.repo,
      issue_number: issueNumber,
      body,
    });
  }

  async refreshCache(): Promise<void> {
    this.cacheTimestamp = 0;
    await this.fetchAllIssues();
  }
}
