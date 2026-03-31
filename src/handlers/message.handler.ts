import { Message, ThreadChannel } from 'discord.js';
import { ClaudeService } from '../services/claude.service.js';
import { GitHubService } from '../services/github.service.js';
import { ThreadService } from '../services/thread.service.js';
import { ConversationState } from '../types/index.js';

const READY_TO_SUMMARIZE = '[READY_TO_SUMMARIZE]';

export class MessageHandler {
  private conversations = new Map<string, ConversationState>();
  private claudeService: ClaudeService;
  private githubService: GitHubService;
  private threadService: ThreadService;

  constructor(
    claudeService: ClaudeService,
    githubService: GitHubService,
    threadService: ThreadService
  ) {
    this.claudeService = claudeService;
    this.githubService = githubService;
    this.threadService = threadService;
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

    if (!state) {
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
        case 'done':
          break;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `Error handling message in thread ${thread.id}:`,
        errorMessage
      );
      await this.threadService.sendMessage(
        thread,
        'Nastala chyba pri spracovaní tvojej správy. Skús to prosím znova.'
      );
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
        await this.threadService.sendMessage(
          thread,
          'Prepáč, ale táto téma nesúvisí s hrou By Sword and Seal. ' +
            'Toto vlákno bude zatvorené.'
        );
        this.conversations.delete(thread.id);
        state.phase = 'done';
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
      await this.createOrAttachIssue(state, thread, message);
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
    message: Message
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

      const newIssue = await this.githubService.createIssue({ title, body });
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

  private isAffirmative(answer: string): boolean {
    return ['áno', 'ano', 'yes', 'y', 'á'].includes(answer);
  }

  private isNegative(answer: string): boolean {
    return ['nie', 'no', 'n'].includes(answer);
  }
}
