export interface BotConfig {
  discord: {
    token: string;
    guildId: string;
    channelId: string;
  };
  anthropic: {
    apiKey: string;
    model: string;
  };
  github: {
    token: string;
    owner: string;
    repo: string;
  };
  similarityThreshold: string;
}

export type ConversationPhase =
  | 'collecting'
  | 'summarizing'
  | 'confirming'
  | 'done'
  | 'v2-analyzing'
  | 'v2-story-drafting'
  | 'v2-research-investigating'
  | 'v2-workbench'
  | 'v2-proposing-artifacts';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ConversationState {
  threadId: string;
  userId: string;
  messages: ConversationMessage[];
  phase: ConversationPhase;
  summary?: string;
  commandType?: 'issue' | 'analyze' | 'story' | 'research' | 'workbench';
}

export interface IssueData {
  title: string;
  body: string;
  labels?: string[];
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: string;
  url: string;
}

export interface SimilarityResult {
  matched: boolean;
  issue?: GitHubIssue;
  confidence?: string;
}

export interface ArtifactProposal {
  type: 'analysis' | 'user-story' | 'research';
  title: string;
  content: string;
}
