import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import {
  ArtifactProposal,
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

const CODE_ANALYSIS_SYSTEM_PROMPT = `You are a code-aware analysis assistant for the "By Sword and Seal" game codebase.
Your task is to analyze game code and provide structured, technical analysis in English.

Based on the user's analysis request and provided code context:
- Identify key components, patterns, and relationships
- Explain design decisions and implementation details
- Suggest improvements or highlight potential issues
- Use technical language appropriate for developers

Format your analysis clearly with sections and bullet points.`;

const USER_STORY_SYSTEM_PROMPT = `You are a user story generation assistant for game development.
Your task is to create INVEST-compliant user stories in English.

Guidelines for INVEST stories:
- Independent: Can be implemented without dependencies on other stories
- Negotiable: Details can be refined with the team
- Valuable: Delivers clear user value
- Estimable: Team can estimate effort
- Small: Can be completed in one sprint
- Testable: Acceptance criteria are clear and measurable

Based on user requirements and optional code context, generate a complete user story with:
- Title
- As a... / I want to... / So that... description
- Acceptance Criteria (testable conditions)
- Notes (technical considerations, dependencies)`;

const RESEARCH_SYSTEM_PROMPT = `You are a research and investigation assistant for game development.
Your task is to produce research notes and investigation findings in English.

Based on the user's research question and optional code context:
- Gather and synthesize relevant information
- Identify patterns, trends, or insights
- Include code references when relevant
- Provide recommendations based on findings
- Structure findings clearly with sections and bullet points`;

const WORKBENCH_SYSTEM_PROMPT = `Si asistent pre vývoj hier "By Sword and Seal". Komunikuj po slovensky.

Tvoja úloha:
- Viesť bezpečnú, priateľskú konverzáciu s vývojárom
- Pomôcť s analýzou, návrhmi, testovaním, alebo inými vývojovými otázkami
- Keď na konci konverzácie je konkrétny, akčný výstup (analýza, príbeh, výskum), signalizuj: [ARTIFACTS: {typy}]
- Ak konverzácia smeruje k žiadnym konkrétnym artefaktom, napíš: [NO_ARTIFACTS]

Príklady výstupov:
- "Tu je analýza architektúry..." → ARTIFACTS: analysis
- "Tu je návrh user story..." → ARTIFACTS: user-story
- "Tu sú výskumné zistenia..." → ARTIFACTS: research
- "Len nedelášeme všeobecný rozhovor." → NO_ARTIFACTS`;

const ARTIFACT_PROPOSAL_SYSTEM_PROMPT = `Analyze the following conversation between a development assistant and a user.
Determine if the conversation produced concrete, actionable artifacts worth creating as GitHub issues.

Types of artifacts:
- analysis: Code-aware analysis, architecture review, design pattern study
- user-story: INVEST-compliant user story with acceptance criteria
- research: Investigation findings, research notes, technical exploration

Respond with EXACTLY:
- "PROPOSE: analysis" (if analysis artifact was generated)
- "PROPOSE: user-story" (if user story was generated)
- "PROPOSE: research" (if research findings were generated)
- "NO_ARTIFACTS" (if conversation was general discussion with no artifact output)

You may respond with multiple PROPOSE lines if multiple artifacts are present in the conversation.`;

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

  async generateCodeAnalysis(
    analysisPrompt: string,
    codeContext: string
  ): Promise<string> {
    const prompt = `User's analysis request:
${analysisPrompt}

Code context:
${codeContext}

Please provide a comprehensive code-aware analysis.`;

    const response = await this.client.messages.create({
      model: config.anthropic.model,
      max_tokens: 2048,
      system: CODE_ANALYSIS_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock ? textBlock.text : '';
  }

  async generateUserStory(
    requirements: string,
    codeContext?: string
  ): Promise<string> {
    const prompt = codeContext
      ? `User story requirements:
${requirements}

Code context (for reference):
${codeContext}

Generate an INVEST-compliant user story.`
      : `User story requirements:
${requirements}

Generate an INVEST-compliant user story.`;

    const response = await this.client.messages.create({
      model: config.anthropic.model,
      max_tokens: 2048,
      system: USER_STORY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock ? textBlock.text : '';
  }

  async generateResearch(
    question: string,
    codeContext?: string
  ): Promise<string> {
    const prompt = codeContext
      ? `Research question:
${question}

Code context (for reference):
${codeContext}

Provide research and investigation notes.`
      : `Research question:
${question}

Provide research and investigation notes.`;

    const response = await this.client.messages.create({
      model: config.anthropic.model,
      max_tokens: 2048,
      system: RESEARCH_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock ? textBlock.text : '';
  }

  async proposeArtifacts(
    conversationMessages: ConversationMessage[]
  ): Promise<ArtifactProposal[]> {
    const conversationText = conversationMessages
      .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n');

    const response = await this.client.messages.create({
      model: config.anthropic.model,
      max_tokens: 256,
      system: ARTIFACT_PROPOSAL_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: conversationText }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    const result = textBlock ? textBlock.text : '';

    const proposals: ArtifactProposal[] = [];
    const lines = result.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('PROPOSE: analysis')) {
        proposals.push({
          type: 'analysis',
          title: 'Code Analysis',
          content: conversationText,
        });
      } else if (trimmedLine.startsWith('PROPOSE: user-story')) {
        proposals.push({
          type: 'user-story',
          title: 'User Story',
          content: conversationText,
        });
      } else if (trimmedLine.startsWith('PROPOSE: research')) {
        proposals.push({
          type: 'research',
          title: 'Research Notes',
          content: conversationText,
        });
      }
    }

    return proposals;
  }
}
