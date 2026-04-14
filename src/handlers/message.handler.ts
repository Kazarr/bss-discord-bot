import { Message, ThreadChannel } from 'discord.js';
import { ClaudeService } from '../services/claude.service.js';
import { GitHubService } from '../services/github.service.js';
import { ThreadService } from '../services/thread.service.js';
import { AgentService } from '../services/agent.service.js';
import {
  ArtifactProposal,
  ConversationState,
} from '../types/index.js';

const READY_TO_SUMMARIZE = '[READY_TO_SUMMARIZE]';

export class MessageHandler {
  private conversations = new Map<string, ConversationState>();
  private claudeService: ClaudeService;
  private githubService: GitHubService;
  private threadService: ThreadService;
  private agentService: AgentService;

  constructor(
    claudeService: ClaudeService,
    githubService: GitHubService,
    threadService: ThreadService,
    agentService?: AgentService
  ) {
    this.claudeService = claudeService;
    this.githubService = githubService;
    this.threadService = threadService;
    this.agentService = agentService || new AgentService();
  }

  initConversation(threadId: string, userId: string): void {
    this.conversations.set(threadId, {
      threadId,
      userId,
      messages: [],
      phase: 'collecting',
    });
  }

  getConversation(threadId: string): ConversationState | undefined {
    return this.conversations.get(threadId);
  }

  async handleMessage(message: Message): Promise<void> {
    const thread = message.channel as ThreadChannel;
    const state = this.conversations.get(thread.id);

    if (!state || state.phase === 'done') {
      return;
    }

    if (message.author.id !== state.userId) {
      return;
    }

    try {
      switch (state.phase) {
        case 'collecting':
          await this.handleCollecting(state, thread, message);
          break;
        case 'confirming':
          await this.handleConfirming(state, thread, message);
          break;
        case 'v2-analyzing':
          await this.handleV2Analyzing(state, thread, message);
          break;
        case 'v2-story-drafting':
          await this.handleV2StoryDrafting(state, thread, message);
          break;
        case 'v2-research-investigating':
          await this.handleV2ResearchInvestigating(state, thread, message);
          break;
        case 'v2-workbench':
          await this.handleV2Workbench(state, thread, message);
          break;
        case 'v2-proposing-artifacts':
          await this.handleV2ProposingArtifacts(state, thread, message);
          break;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `Error handling message in thread ${thread.id}:`,
        errorMessage
      );
      try {
        await this.threadService.sendMessage(
          thread,
          'Nastala chyba pri spracovaní tvojej správy. Skús to prosím znova.'
        );
      } catch {
        // Thread may already be archived, nothing to do
      }
    }
  }

  private async handleCollecting(
    state: ConversationState,
    thread: ThreadChannel,
    message: Message
  ): Promise<void> {
    const userMessage = message.content;

    if (state.messages.length === 0) {
      const isGameRelated = await this.claudeService.isGameRelated(userMessage);
      if (!isGameRelated) {
        state.phase = 'done';
        this.conversations.delete(thread.id);
        await this.threadService.sendMessage(
          thread,
          'Prepáč, ale táto téma nesúvisí s hrou By Sword and Seal. ' +
            'Toto vlákno bude zatvorené.'
        );
        await this.threadService.closeThread(thread);
        return;
      }
    }

    const response = await this.claudeService.chat(
      state.messages,
      userMessage
    );

    state.messages.push({ role: 'user', content: userMessage });
    state.messages.push({ role: 'assistant', content: response });

    if (response.includes(READY_TO_SUMMARIZE)) {
      state.phase = 'summarizing';
      await this.handleSummarizing(state, thread);
    } else {
      await this.threadService.sendMessage(thread, response);
    }
  }

  private async handleSummarizing(
    state: ConversationState,
    thread: ThreadChannel
  ): Promise<void> {
    const summary = await this.claudeService.summarize(state.messages);
    state.summary = summary;
    state.phase = 'confirming';

    await this.threadService.sendMessage(
      thread,
      `Tu je zhrnutie tvojho reportu:\n\n${summary}\n\n` +
        'Chceš vytvoriť GitHub issue? Odpovedz **áno** alebo **nie**.'
    );
  }

  private async handleConfirming(
    state: ConversationState,
    thread: ThreadChannel,
    message: Message
  ): Promise<void> {
    const answer = message.content.trim().toLowerCase();

    if (this.isAffirmative(answer)) {
      const labels = this.getLabelsForCommand(state);
      await this.createOrAttachIssue(state, thread, message, labels);
    } else if (this.isNegative(answer)) {
      await this.threadService.sendMessage(
        thread,
        'Chceš upraviť popis, alebo úplne zrušiť? ' +
          'Odpovedz **upraviť** alebo **zrušiť**.'
      );
      state.phase = 'collecting';
      state.summary = undefined;
    } else {
      await this.threadService.sendMessage(
        thread,
        'Odpovedz prosím **áno** na vytvorenie issue, alebo **nie** na úpravu/zrušenie.'
      );
    }
  }

  private async createOrAttachIssue(
    state: ConversationState,
    thread: ThreadChannel,
    message: Message,
    labels?: string[]
  ): Promise<void> {
    if (!state.summary) {
      return;
    }

    const issues = await this.githubService.fetchAllIssues();
    const similarityResult = await this.claudeService.findSimilarIssue(
      state.summary,
      issues
    );

    if (similarityResult.matched && similarityResult.issue) {
      const commentBody = this.formatComment(
        message.author.username,
        state.summary,
        thread.url
      );
      await this.githubService.addComment(
        similarityResult.issue.number,
        commentBody
      );
      await this.threadService.sendMessage(
        thread,
        `Podobný issue už existuje: ${similarityResult.issue.url}\n` +
          'Tvoj report bol pridaný ako komentár k existujúcemu issue. Ďakujem!'
      );
    } else {
      const titleMatch = state.summary.match(/Title:\s*(.+)/);
      const title = titleMatch ? titleMatch[1].trim() : 'User reported issue';
      const body = `${state.summary}\n\n---\nReported by Discord user: ${message.author.username}\nThread: ${thread.url}`;

      const newIssue = await this.githubService.createIssue({
        title,
        body,
        labels,
      });
      await this.threadService.sendMessage(
        thread,
        `Nový GitHub issue bol vytvorený: ${newIssue.url}\nĎakujem za tvoj report!`
      );
    }

    state.phase = 'done';
    this.conversations.delete(thread.id);
    await this.threadService.closeThread(thread);
  }

  private formatComment(
    username: string,
    summary: string,
    threadUrl: string
  ): string {
    return `Related report from Discord user ${username}:\n\n${summary}\n\nThread: ${threadUrl}`;
  }

  private async handleV2Analyzing(
    state: ConversationState,
    thread: ThreadChannel,
    message: Message
  ): Promise<void> {
    const userMessage = message.content;

    try {
      const codeAnalysis = await this.agentService.analyzeCode(userMessage);
      const analysis = await this.claudeService.generateCodeAnalysis(
        userMessage,
        codeAnalysis
      );

      state.messages.push({ role: 'user', content: userMessage });
      state.messages.push({ role: 'assistant', content: analysis });
      state.summary = analysis;
      state.phase = 'confirming';

      await this.threadService.sendMessage(
        thread,
        `Tu je analýza:\n\n${analysis}\n\n` +
          'Chceš vytvoriť GitHub issue? Odpovedz **áno** alebo **nie**.'
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error('Error in handleV2Analyzing:', errorMessage);
      await this.threadService.sendMessage(
        thread,
        'Nastala chyba pri analýze kódu. Skús to prosím znova.'
      );
    }
  }

  private async handleV2StoryDrafting(
    state: ConversationState,
    thread: ThreadChannel,
    message: Message
  ): Promise<void> {
    const userMessage = message.content;

    try {
      const story = await this.claudeService.generateUserStory(userMessage);

      state.messages.push({ role: 'user', content: userMessage });
      state.messages.push({ role: 'assistant', content: story });
      state.summary = story;
      state.phase = 'confirming';

      await this.threadService.sendMessage(
        thread,
        `Tu je user story:\n\n${story}\n\n` +
          'Chceš vytvoriť GitHub issue? Odpovedz **áno** alebo **nie**.'
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error('Error in handleV2StoryDrafting:', errorMessage);
      await this.threadService.sendMessage(
        thread,
        'Nastala chyba pri generovaní user story. Skús to prosím znova.'
      );
    }
  }

  private async handleV2ResearchInvestigating(
    state: ConversationState,
    thread: ThreadChannel,
    message: Message
  ): Promise<void> {
    const userMessage = message.content;

    try {
      const research = await this.claudeService.generateResearch(userMessage);

      state.messages.push({ role: 'user', content: userMessage });
      state.messages.push({ role: 'assistant', content: research });
      state.summary = research;
      state.phase = 'confirming';

      await this.threadService.sendMessage(
        thread,
        `Tu sú výskumné zistenia:\n\n${research}\n\n` +
          'Chceš vytvoriť GitHub issue? Odpovedz **áno** alebo **nie**.'
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error('Error in handleV2ResearchInvestigating:', errorMessage);
      await this.threadService.sendMessage(
        thread,
        'Nastala chyba pri výskume. Skús to prosím znova.'
      );
    }
  }

  private async handleV2Workbench(
    state: ConversationState,
    thread: ThreadChannel,
    message: Message
  ): Promise<void> {
    const userMessage = message.content;

    // Check for explicit end markers
    const lowerContent = userMessage.toLowerCase();
    if (
      ['hotovo', 'done', 'koniec', 'end', 'finish'].includes(lowerContent)
    ) {
      state.phase = 'v2-proposing-artifacts';
      await this.handleV2ProposingArtifacts(state, thread, message);
      return;
    }

    try {
      const response = await this.claudeService.chat(
        state.messages,
        userMessage
      );

      state.messages.push({ role: 'user', content: userMessage });
      state.messages.push({ role: 'assistant', content: response });

      // Check for end-of-conversation marker
      if (response.includes('[END_CONVERSATION]')) {
        state.phase = 'v2-proposing-artifacts';
        await this.handleV2ProposingArtifacts(state, thread, message);
      } else {
        await this.threadService.sendMessage(thread, response);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error('Error in handleV2Workbench:', errorMessage);
      await this.threadService.sendMessage(
        thread,
        'Nastala chyba pri spracovaní správy. Skús to prosím znova.'
      );
    }
  }

  private async handleV2ProposingArtifacts(
    state: ConversationState,
    thread: ThreadChannel,
    message: Message
  ): Promise<void> {
    try {
      const proposals = await this.claudeService.proposeArtifacts(
        state.messages
      );

      if (proposals.length > 0) {
        state.phase = 'confirming';

        const proposalList = proposals
          .map((p) => `- ${p.type}: ${p.title}`)
          .join('\n');

        await this.threadService.sendMessage(
          thread,
          `Tu som našiel tieto artefakty:\n${proposalList}\n\n` +
            'Chceš ich vytvoriť? Odpovedz **áno** alebo **nie**.'
        );

        // Store proposals in state for later use
        (state as any).proposals = proposals;
      } else {
        state.phase = 'done';
        this.conversations.delete(thread.id);

        await this.threadService.sendMessage(
          thread,
          'Žiadne artefakty na vytvorenie. Vlákno bude zatvorené.'
        );
        await this.threadService.closeThread(thread);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error('Error in handleV2ProposingArtifacts:', errorMessage);
      await this.threadService.sendMessage(
        thread,
        'Nastala chyba pri analýze artefaktov. Skús to prosím znova.'
      );
    }
  }

  private getLabelsForCommand(state: ConversationState): string[] {
    if (!state.commandType) {
      return [];
    }

    switch (state.commandType) {
      case 'analyze':
        return ['analysis'];
      case 'story':
        return ['user-story'];
      case 'research':
        return ['research'];
      case 'workbench':
        // For workbench, labels come from proposals
        const proposals = (state as any).proposals as
          | ArtifactProposal[]
          | undefined;
        if (!proposals || proposals.length === 0) {
          return [];
        }
        return proposals.map((p) => {
          if (p.type === 'user-story') {
            return 'user-story';
          }
          return p.type;
        });
      default:
        return [];
    }
  }

  private isAffirmative(answer: string): boolean {
    return ['áno', 'ano', 'yes', 'y', 'á'].includes(answer);
  }

  private isNegative(answer: string): boolean {
    return ['nie', 'no', 'n'].includes(answer);
  }
}
