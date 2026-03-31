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
  | 'done';

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
