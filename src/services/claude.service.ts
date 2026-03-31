import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import {
  ConversationMessage,
  GitHubIssue,
  SimilarityResult,
} from '../types/index.js';

const CONVERSATION_SYSTEM_PROMPT = `Si zberateľ spätnej väzby pre hru By Sword and Seal. Komunikuj po slovensky.

Tvoja úloha:
- Pýtaj sa upresňujúce otázky, aby si dobre porozumel problému alebo návrhu používateľa.
- Akceptuj: herné mechaniky (produkcia, budovy, zdroje, populácia, ekonomika), technické problémy (prihlásenie, načítavanie, chyby), UI/UX spätnú väzbu (vizuálne problémy, čitateľnosť, rozloženie).
- Odmietni: témy úplne nesúvisiace s hrou.
- Keď máš dostatok informácií na vytvorenie prehľadného reportu, odpovedz PRESNE textom: [READY_TO_SUMMARIZE]

Dôležité:
- Buď stručný a priateľský.
- Nepýtaj sa príliš veľa otázok — 2-3 upresňujúce otázky by mali stačiť.
- Keď používateľ poskytne dostatok detailov, ukonči zber informácií.`;

const SUMMARIZE_SYSTEM_PROMPT = `Analyze the following conversation between a game feedback collector and a user. Create a concise GitHub issue summary in English.

Format:
Title: [brief title describing the issue]
---
[Detailed description of the issue/feedback, including:
- What the user reported
- Steps to reproduce (if applicable)
- Expected vs actual behavior (if applicable)
- Any additional context provided]

Important:
- Write in English (the conversation may be in Slovak).
- Be concise but include all relevant details.
- Use technical language appropriate for a GitHub issue.`;

const SCOPE_FILTER_SYSTEM_PROMPT = `You are a scope filter for a game feedback bot. The game is "By Sword and Seal" — a strategy game with mechanics including production, buildings, resources, population, and economy.

Determine if the following message is related to the game in ANY way:
- Game mechanics, bugs, features, balance → RELATED
- Technical issues (login, loading, errors, UI) → RELATED
- UI/UX feedback (visuals, layout, readability) → RELATED
- Completely unrelated topics (recipes, weather, other games) → UNRELATED

Respond with EXACTLY one word: "RELATED" or "UNRELATED"`;

export class ClaudeService {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: config.anthropic.apiKey });
  }

  async chat(
    conversationMessages: ConversationMessage[],
    userMessage: string
  ): Promise<string> {
    const messages: Anthropic.MessageParam[] = [
      ...conversationMessages.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user' as const, content: userMessage },
    ];

    const response = await this.client.messages.create({
      model: config.anthropic.model,
      max_tokens: 1024,
      system: CONVERSATION_SYSTEM_PROMPT,
      messages,
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock ? textBlock.text : '';
  }

  async summarize(conversationMessages: ConversationMessage[]): Promise<string> {
    const conversationText = conversationMessages
      .map((msg) => `${msg.role === 'user' ? 'User' : 'Bot'}: ${msg.content}`)
      .join('\n');

    const response = await this.client.messages.create({
      model: config.anthropic.model,
      max_tokens: 1024,
      system: SUMMARIZE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: conversationText }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock ? textBlock.text : '';
  }

  async isGameRelated(message: string): Promise<boolean> {
    const response = await this.client.messages.create({
      model: config.anthropic.model,
      max_tokens: 10,
      system: SCOPE_FILTER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: message }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    const result = textBlock ? textBlock.text.trim().toUpperCase() : 'UNRELATED';
    return result === 'RELATED';
  }

  async findSimilarIssue(
    summary: string,
    issues: GitHubIssue[]
  ): Promise<SimilarityResult> {
    if (issues.length === 0) {
      return { matched: false };
    }

    const issueList = issues
      .map(
        (issue) =>
          `#${issue.number}: ${issue.title}\n${issue.body.substring(0, 200)}`
      )
      .join('\n\n');

    const prompt = `Compare the following new issue summary against the existing GitHub issues listed below.
If one of the existing issues is clearly about the same topic or problem (similarity threshold: ${config.similarityThreshold}), return its number.
If none match closely enough, return "none".

New issue summary:
${summary}

Existing issues:
${issueList}

Respond in this exact format:
MATCH: #<number> (confidence: high/medium/low)
or
MATCH: none`;

    const response = await this.client.messages.create({
      model: config.anthropic.model,
      max_tokens: 50,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    const result = textBlock ? textBlock.text.trim() : 'MATCH: none';

    const matchResult = result.match(/MATCH:\s*#(\d+)\s*\(confidence:\s*(\w+)\)/i);
    if (matchResult) {
      const issueNumber = parseInt(matchResult[1], 10);
      const confidence = matchResult[2];
      const matchedIssue = issues.find((i) => i.number === issueNumber);
      if (matchedIssue) {
        return { matched: true, issue: matchedIssue, confidence };
      }
    }

    return { matched: false };
  }
}
