<!-- Scout | 2026-04-14 | Codebase Map (v2 Scope) -->
<!-- Project: bss-discord-bot -->
<!-- Task: Map v1 architecture and identify v2 extensibility points for four new commands (/analyze, /story, /research, /workbench) with Agent SDK integration -->

## Overview

This codebase map covers the existing v1 Discord bot implementation and identifies all extensibility points needed for v2 feature implementation. v1 is fully implemented with a single slash command (`/issue`) that manages feedback collection via private threads. v2 adds four new code-aware analysis commands with Agent SDK integration.

**Key Property:** v1 and v2 are **isolated workflows**. v2 adds new command files, a new `AgentService`, and extends the message handler state machine, but does NOT modify any v1 code paths.

---

## Relevant Files

| # | File | Lines | Current State | v2 Target |
|---|------|-------|---------------|-----------|
| 1 | `src/index.ts` | 65 | Entry point, event wiring | Add v2 command routing (line 38-40) |
| 2 | `src/config.ts` | 60 | Env var loading + validation | No change (reuses existing config) |
| 3 | `src/types/index.ts` | 57 | ConversationPhase, ConversationState | Extend: add v2 phases, optional `commandType` field |
| 4 | `src/commands/index.ts` | 25 | Command registration | Register four new v2 commands here |
| 5 | `src/commands/issue.ts` | 80 | `/issue` command handler | Unchanged (v1 isolated) |
| 6 | `src/services/claude.service.ts` | 158 | Chat, summarize, similarity, scope filter | Extend: add methods for artifact generation |
| 7 | `src/services/github.service.ts` | 96 | Issue CRUD, caching, pagination | No change (createIssue already supports labels) |
| 8 | `src/services/thread.service.ts` | 40 | Thread lifecycle | No change (reused by v2) |
| 9 | `src/handlers/message.handler.ts` | 217 | State machine router | Extend: add v2 phase handlers (preserves v1 paths) |
| 10 | `src/services/agent.service.ts` | TBD (NEW) | — | NEW: Spawn Agent SDK sessions for code analysis |
| 11 | `src/commands/analyze.ts` | TBD (NEW) | — | NEW: `/analyze` command handler |
| 12 | `src/commands/story.ts` | TBD (NEW) | — | NEW: `/story` command handler |
| 13 | `src/commands/research.ts` | TBD (NEW) | — | NEW: `/research` command handler |
| 14 | `src/commands/workbench.ts` | TBD (NEW) | — | NEW: `/workbench` command handler |
| 15 | `tests/services/agent.service.spec.ts` | TBD (NEW) | — | NEW: Tests for AgentService (mocked SDK) |
| 16 | `tests/commands/*.spec.ts` | TBD (NEW) | — | NEW: Tests for v2 command handlers |

---

## Current Architecture (v1)

### Entry Point: `src/index.ts`

**Responsibilities:**
- Load environment via `dotenv/config` import (line 1)
- Create Discord client with three required intents
- Initialize three services (Claude, GitHub, Thread)
- Initialize message handler with services
- Wire event handlers: `ClientReady`, `InteractionCreate`, `MessageCreate`
- Handle graceful shutdown on SIGINT/SIGTERM

**Extension Point (for v2):**
```typescript
// Line 38-40: InteractionCreate handler
if (interaction.commandName === 'issue') {
  await handleIssueCommand(interaction, threadService, messageHandler);
}
// v2 will add: } else if (interaction.commandName === 'analyze') { ... }
```

### Configuration: `src/config.ts`

**Public API:**
```typescript
interface BotConfig {
  discord: { token, guildId, channelId };
  anthropic: { apiKey, model };
  github: { token, owner, repo };
  similarityThreshold: string; // e.g., "0.7"
}
const config: BotConfig; // exported singleton
```

**Behavior:**
- Validates all required env vars at startup (fail-fast pattern)
- Returns typed config object
- Supports optional vars: `CLAUDE_MODEL`, `SIMILARITY_THRESHOLD`
- Throws descriptive error if required var missing

**v2 Usage:** Reuses as-is. No new env vars required per requirements.

### Type System: `src/types/index.ts`

**Current types:**
```typescript
type ConversationPhase = 'collecting' | 'summarizing' | 'confirming' | 'done';

interface ConversationState {
  threadId: string;
  userId: string;
  messages: ConversationMessage[];
  phase: ConversationPhase;
  summary?: string;
}

interface IssueData { title, body, labels? }
interface GitHubIssue { number, title, body, state, url }
interface SimilarityResult { matched, issue?, confidence? }
```

**v2 Extension Required:**
- Add new phases to `ConversationPhase`: `'v2-analyzing'`, `'v2-story-drafting'`, `'v2-research-investigating'`, `'v2-workbench'`
- Optional: Add `commandType?: 'issue' | 'analyze' | 'story' | 'research' | 'workbench'` to `ConversationState` for routing context
- New type: `ArtifactProposal { type: 'analysis' | 'user-story' | 'research'; content: string }`

### Services Layer

#### ClaudeService: `src/services/claude.service.ts`

**Current Public API:**
```typescript
class ClaudeService {
  async chat(messages: ConversationMessage[], userMessage: string): Promise<string>;
  async summarize(messages: ConversationMessage[]): Promise<string>;
  async isGameRelated(message: string): Promise<boolean>;
  async findSimilarIssue(summary: string, issues: GitHubIssue[]): Promise<SimilarityResult>;
}
```

**System Prompts (defined inline):**
- `CONVERSATION_SYSTEM_PROMPT` (line 9-20): Slovak feedback collector, game-scoped
- `SUMMARIZE_SYSTEM_PROMPT` (line 22-36): GitHub issue format, English output
- `SCOPE_FILTER_SYSTEM_PROMPT` (line 38-46): Binary classifier (RELATED/UNRELATED)

**Implementation Details:**
- Uses `@anthropic-ai/sdk` v0.80.0 (Messages API v1)
- Stateless: conversation history passed in per call
- Max tokens: 1024 per response
- Model configurable via `config.anthropic.model`

**v2 Extension Required:**
- Add methods for artifact generation:
  - `generateCodeAnalysis(analysisPrompt: string, codeContext: string): Promise<string>`
  - `generateUserStory(requirements: string, codeContext?: string): Promise<string>`
  - `generateResearch(question: string, codeContext?: string): Promise<string>`
  - `proposeArtifacts(conversationHistory: ConversationMessage[]): Promise<ArtifactProposal[]>`
- These reuse existing `messages.create()` with new system prompts

#### GitHubService: `src/services/github.service.ts`

**Current Public API:**
```typescript
class GitHubService {
  async fetchAllIssues(): Promise<GitHubIssue[]>;
  async createIssue(data: IssueData): Promise<GitHubIssue>; // supports labels
  async addComment(issueNumber: number, body: string): Promise<void>;
  async refreshCache(): Promise<void>;
}
```

**Cache Strategy:**
- 15-minute TTL with timestamp tracking
- Cache invalidated after `createIssue()` to ensure fresh state
- `refreshCache()` allows explicit invalidation

**Error Handling:**
- 404: Repository not found
- 403: Rate limit or insufficient permissions
- Network errors propagated

**v2 Usage:** No changes needed. `createIssue(data: IssueData)` already accepts `data.labels` array, which v2 will use for `["analysis"]`, `["user-story"]`, `["research"]`.

#### ThreadService: `src/services/thread.service.ts`

**Current Public API:**
```typescript
class ThreadService {
  async createPrivateThread(channel: TextChannel, user: User, name: string): Promise<ThreadChannel>;
  async sendMessage(thread: ThreadChannel, content: string): Promise<Message>;
  async closeThread(thread: ThreadChannel): Promise<void>;
}
```

**Thread Configuration:**
- Type: `ChannelType.PrivateThread` (not Forum channel — Forums only support public threads)
- Auto-archive: 60 minutes of inactivity
- Invitable: `false` (prevents others from joining)
- Naming: `Issue: {username} - {YYYY-MM-DD}` (v1 pattern)

**v2 Usage:** Same pattern for all four new commands. No service changes needed.

### Handler: `src/handlers/message.handler.ts`

**Responsibilities:**
- Maintain `Map<threadId, ConversationState>` for active conversations
- Route messages by phase (collecting, confirming)
- Transition phases: collecting → summarizing → confirming → creating → done
- Call services and update state

**State Machine (v1):**
```
START: /issue command invoked
  ↓
[collecting] ← User messages → ClaudeService.chat()
  ↓ (when Claude sends "[READY_TO_SUMMARIZE]")
[summarizing] → ClaudeService.summarize()
  ↓
[confirming] ← User responds "áno"/"nie"
  ↓
  "áno" → GitHubService.createIssue() or addComment()
           ThreadService.closeThread()
           → [done]
  "nie" → Ask "improve or cancel?" → [collecting] (loop) or [done]
```

**Public API:**
```typescript
class MessageHandler {
  constructor(claudeService, githubService, threadService);
  initConversation(threadId: string, userId: string): void;
  getConversation(threadId: string): ConversationState | undefined;
  async handleMessage(message: Message): Promise<void>;
}
```

**v2 Extension Required:**
- Add new phase handlers for v2 phases: `handleV2Analyzing`, `handleV2StoryDrafting`, `handleV2Workbench`
- Route logic (line 51-57 switch statement) adds new cases
- v1 phases preserved exactly; v2 phases isolated in separate branches
- Optional: Add `commandType` field to state to determine handler route

**Critical Detail:** State entries are initialized by command handlers (not message handler). v1 `/issue` initializes with phase `'collecting'`. v2 commands initialize with appropriate v2 phases (e.g., `'v2-analyzing'`, `'v2-story-drafting'`).

### Commands Layer

#### Command Registration: `src/commands/index.ts`

**Responsibility:** Deploy all commands to Discord API on bot ready

**Current Implementation:**
```typescript
async function deployCommands(): Promise<void> {
  const commands = [issueCommand.toJSON()];
  // ... REST.put() to Discord
}
```

**v2 Extension Required:**
- Import four new command builders: `analyzeCommand`, `storyCommand`, `researchCommand`, `workbenchCommand`
- Add to `commands` array before `rest.put()`
- v1 command remains unchanged

#### `/issue` Command: `src/commands/issue.ts`

**Responsibilities:**
1. Validate channel is designated issue channel
2. Validate channel type is GuildText
3. Create private thread via `ThreadService.createPrivateThread()`
4. Initialize conversation state via `MessageHandler.initConversation()` with phase `'collecting'`
5. Send welcome message (Slovak) to thread
6. Reply to interaction with ephemeral confirmation

**Key Detail:** Command handler is **decoupled** from message routing. It only:
- Creates thread
- Initializes state
- Sends welcome message

Message handler takes over from the message event (line 43-52 in index.ts).

**v2 Pattern:** All four v2 commands will follow this same pattern:
1. Check channel
2. Check admin permissions (NEW for v2)
3. Create thread
4. Initialize state with v2 phase and command type
5. Send welcome message (different per command)

---

## Dependencies Between Files

### Import Chain: Entry Point → Services

```
src/index.ts
  ├── config.js (loaded first via dotenv/config)
  ├── commands/index.js → deployCommands()
  ├── commands/issue.js → handleIssueCommand()
  ├── services/claude.service.js → ClaudeService
  ├── services/github.service.js → GitHubService
  ├── services/thread.service.js → ThreadService
  └── handlers/message.handler.js → MessageHandler
       ├── depends: ClaudeService
       ├── depends: GitHubService
       └── depends: ThreadService
```

### Type Dependencies

```
src/types/index.ts
  ├── BotConfig (imported by: config.ts)
  ├── ConversationMessage (imported by: claude.service.ts, handlers/message.handler.ts)
  ├── ConversationPhase (imported by: handlers/message.handler.ts, types exported)
  ├── ConversationState (imported by: handlers/message.handler.ts)
  ├── IssueData (imported by: github.service.ts, handlers/message.handler.ts)
  ├── GitHubIssue (imported by: github.service.ts, claude.service.ts, handlers/message.handler.ts)
  └── SimilarityResult (imported by: claude.service.ts)
```

### Service Dependencies

```
ClaudeService (uses: config, types)
  └── Anthropic SDK

GitHubService (uses: config, types)
  └── Octokit (GitHub REST API)

ThreadService (uses: discord.js types)
  └── discord.js
```

---

## Shared Code (Risk Assessment)

### High-Value Reusable Components

| Component | Current Consumers | Risk | v2 Impact |
|-----------|-------------------|------|-----------|
| `ThreadService.createPrivateThread()` | 1 (v1 /issue) | LOW | v2 reuses for all 4 commands — stable API |
| `ClaudeService.chat()` | 1 (message handler) | LOW | v2 reuses for multi-turn conv — no change needed |
| `ClaudeService.summarize()` | 1 (message handler) | LOW | v2 extends with new artifact generation methods |
| `GitHubService.createIssue()` | 1 (message handler) | LOW | v2 reuses with labels param (already supported) |
| `MessageHandler` state machine | 1 (index.ts routing) | MEDIUM | v2 extends: add new phases + routes. Existing v1 phases preserved. |
| `config` object | All services | LOW | No changes for v2. Reuses existing env vars. |

### New Components for v2 (No Conflicts)

| Component | Purpose | Isolation |
|-----------|---------|-----------|
| `AgentService` (NEW) | Spawn Claude Agent SDK sessions with file/grep tools | Isolated: only v2 commands use it |
| v2 command handlers (NEW) | `/analyze`, `/story`, `/research`, `/workbench` | Isolated: new files, no v1 interference |
| v2 state machine branches | New ConversationPhase values | Isolated: separate switch cases in message handler |

---

## Existing Conventions (v1)

### Naming Conventions

| Category | Pattern | Examples |
|----------|---------|----------|
| **Classes/Services** | PascalCase | `ClaudeService`, `GitHubService`, `ThreadService` |
| **Methods** | camelCase | `createPrivateThread()`, `findSimilarIssue()`, `handleMessage()` |
| **Constants** | UPPER_SNAKE_CASE | `AUTO_ARCHIVE_DURATION_MIN`, `CACHE_TTL_MS`, `READY_TO_SUMMARIZE` |
| **Files** | kebab-case | `claude.service.ts`, `message.handler.ts`, `issue.ts` |
| **Test files** | `*.spec.ts` | `claude.service.spec.ts`, `config.spec.ts` |
| **Interfaces** | PascalCase | `ConversationState`, `GitHubIssue`, `BotConfig` |

### Import Style

- **Order:** Node.js builtins → third-party packages → local modules (relative with `.js` extension)
- **Form:** Named imports only (`import { X, Y } from 'pkg'`)
- **Env var access:** Bracket notation: `process.env['KEY']` (NOT dot notation)
- **dotenv:** Imported only in `index.ts` as `import 'dotenv/config'` (before other imports)

### Code Style

| Aspect | Standard |
|--------|----------|
| **Quotes** | Single quotes (`'`) |
| **Semicolons** | Required |
| **Indentation** | 2 spaces |
| **Error handling** | try/catch with descriptive messages |
| **Async** | async/await (never callbacks) |

### State Machine Pattern

**Pattern identified in v1:**
- Phases represented as enum/union type: `'collecting' | 'summarizing' | 'confirming' | 'done'`
- State stored per-thread in `Map<threadId, ConversationState>`
- Handlers organized by phase (separate methods)
- Initialization by command handler, routing by message handler
- Cleanup: state entry deleted when phase reaches `'done'`

**v2 Extension:** Add new phases, new handlers, preserve v1 paths.

### Error Handling Pattern

- All service methods wrapped in try/catch
- Error messages include context (what failed, why, relevant IDs)
- User-facing messages in Slovak (from system prompts)
- Descriptive error logging to console
- Thread kept open for retry (except critical failures like thread create error)

### Discord Integration Details

- **Thread type:** `ChannelType.PrivateThread` (NOT Forum)
- **Intents required:** `Guilds`, `GuildMessages`, `MessageContent` (MessageContent is privileged)
- **Thread naming:** `Issue: {username} - {YYYY-MM-DD}` (sortable, descriptive)
- **Auto-archive:** 60 minutes of inactivity
- **Invitable:** `false` (privacy enforcement)

---

## Test Infrastructure

### Framework & Configuration

- **Test runner:** Vitest 4.1.2
- **Environment:** Node.js
- **File location:** `tests/` directory (not co-located with source)
- **File naming:** `*.spec.ts`
- **Coverage provider:** v8

### Mocking Patterns (CRITICAL for v2)

#### ESM Module-Level Mocking with vi.hoisted() (Lesson #14)

**Pattern:** All external API mocks MUST use `vi.hoisted()` pattern for ESM projects:

```typescript
// CORRECT (from claude.service.spec.ts):
const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: mockCreate };
  }
  return { default: MockAnthropic };
});

// Then import service under test AFTER mocking
import { ClaudeService } from '../../src/services/claude.service.js';
```

**Why:** ESM hoisting rules prevent module-scope `vi.fn()` without `vi.hoisted()`. The pattern lifts function definitions before import analysis.

#### Config Mocking

```typescript
vi.mock('../../src/config.js', () => ({
  config: {
    anthropic: { apiKey: 'test-key', model: 'test-model' },
    similarityThreshold: '0.7',
    // ... other fields
  },
}));
```

#### Service Mocking (for integration-level tests)

```typescript
function createMockServices() {
  return {
    claudeService: {
      chat: vi.fn(),
      summarize: vi.fn(),
      isGameRelated: vi.fn(),
      findSimilarIssue: vi.fn(),
    },
    githubService: {
      fetchAllIssues: vi.fn(),
      createIssue: vi.fn(),
      addComment: vi.fn(),
      refreshCache: vi.fn(),
    },
    threadService: {
      createPrivateThread: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      closeThread: vi.fn().mockResolvedValue(undefined),
    },
  };
}
```

#### Discord.js Mocking

```typescript
// Mock Message, ThreadChannel, User objects as plain objects with required properties
function createMockMessage(content: string, userId: string, threadId: string) {
  return {
    content,
    author: { id: userId, username: 'testuser' },
    channel: { id: threadId, url: 'https://discord.com/channels/test' },
  };
}
```

### Test Coverage Areas (v1)

- Config validation (missing vars, defaults)
- Claude service: chat, summarize, scope filter, similarity
- GitHub service: fetch (with cache), create, comment, rate limit errors
- Thread service: create, send, close
- Message handler: full state machine (all phases, edge cases, error handling)

### v2 Test Requirements

- **AgentService:** Mock `@anthropic-ai/sdk/agent` spawn and tool responses
- **v2 command handlers:** Mock ThreadService, MessageHandler, no real Discord API
- **Message handler extensions:** New phase handlers, routing logic (isolated from v1 tests)
- **Integration tests:** Multi-turn conversations with agent context (mocked agent)

---

## Technical Stack

| Category | Technology | Version | Notes |
|----------|-----------|---------|-------|
| **Language** | TypeScript | ~5.9.2 | Strict mode, ES2022 target |
| **Runtime** | Node.js | >= 20 LTS | Required by Octokit |
| **Module System** | ESM | — | `"type": "module"` in package.json |
| **Discord** | discord.js | 14.26.0 | Private thread support |
| **Claude API** | @anthropic-ai/sdk | ^0.80.0 | Messages API v1 |
| **Agent SDK** | @anthropic-ai/sdk (same pkg) | TBD (NEW for v2) | MUST verify exact import path and version |
| **GitHub** | @octokit/rest | ^22.0.1 | REST API, pagination |
| **Config** | dotenv | ^17.3.1 | Env var loading |
| **Build (Dev)** | tsx | ^4.21.0 | Fast TS execution |
| **Build (Prod)** | tsup | ^8.5.1 | TypeScript bundler |
| **Test** | Vitest | ^4.1.2 | ESM-native, fast |
| **Lint** | ESLint | ^9.8.0 | Flat config |
| **Format** | Prettier | ^2.6.2 | Single quotes |

---

## Risks and Unexpected Findings

### CRITICAL FINDING #1: Claude Agent SDK Dependency — Unverified

**Problem:** Requirements specify Agent SDK integration (`@anthropic-ai/sdk` with agent module) but:
- Current package.json lists `@anthropic-ai/sdk` v0.80.0 (main SDK)
- Agent SDK exact package name, version, and Node.js/ESM compatibility are UNVERIFIED
- Integration pattern (how to spawn session, pass tools, configure filesystem scope) is UNKNOWN

**Impact:** Planner cannot finalize v2 design until Agent SDK specifics are confirmed.

**Action Required:**
- [ ] Verify exact npm package name (is it `@anthropic-ai/sdk`? Separate package?)
- [ ] Confirm current stable version compatible with Node.js 20+
- [ ] Confirm ESM compatibility (no CommonJS-only exports)
- [ ] Research session spawn API and tool definition pattern
- [ ] Research filesystem tool configuration (how to limit scope to a directory, read-only access)
- [ ] Confirm whether it reuses `ANTHROPIC_API_KEY` or requires separate key
- [ ] Verify if tools can be configured for local filesystem only (no external APIs)

**Mitigation for Planner:** Document as assumption that Agent SDK is available and compatible. v1 Implementor can proceed independently. v2 Planner will address in next phase once SDK is confirmed.

---

### CRITICAL FINDING #2: Admin Permission Check in discord.js v14 — Pattern Unclear

**Problem:** Requirements specify "all v2 commands gated to server admins only" but:
- discord.js v14 doesn't provide built-in permission check decorator
- Must manually read `interaction.member.permissions` and check `Administrator` flag
- Exact API pattern for `PermissionsBitField.Flags.Administrator` not verified in this codebase

**Impact:** v2 command handlers need working permission check. Without verification, implementation may fail.

**Research Needed:**
- [ ] Confirm `PermissionsBitField` import path and API
- [ ] Confirm reading `interaction.member.permissions` contains admin flag
- [ ] Confirm bitwiseAND check: `permissions.has(PermissionsBitField.Flags.Administrator)`
- [ ] Test pattern with mock interaction

**Expected Pattern (likely):**
```typescript
import { PermissionsBitField } from 'discord.js';

if (!interaction.member?.permissions?.has(PermissionsBitField.Flags.Administrator)) {
  await interaction.reply({ content: 'Admin only.', ephemeral: true });
  return;
}
```

**Mitigation:** Planner to research discord.js v14 permission API and provide confirmed pattern to Implementor.

---

### CRITICAL FINDING #3: Git Clone Management — Pattern & Location Undefined

**Problem:** Requirements specify Agent SDK should access "fresh git pull of `By-Sword-and-Seal-Playground` repo" but:
- Exact clone location (`./.cache/bss-game/`, `./repos/`, etc.) not specified
- Git pull strategy not decided (every command? once per day? check timestamp?)
- Minimal Node.js package choice (simple-git vs isomorphic-git vs child_process) not researched
- Private GitHub repo access pattern unclear (token handling, error recovery)

**Impact:** v2 `AgentService` needs to initialize codebase clone. Without clear strategy, Implementor will have to guess.

**Research Needed:**
- [ ] Decide clone location (relative to bot working directory)
- [ ] Decide freshness strategy (e.g., "git pull if last pull >24h old")
- [ ] Evaluate Node.js packages: simple-git (recommended, high-level), isomorphic-git (pure JS, no git binary), child_process (spawn git command)
- [ ] Confirm private repo access via GitHub token (needs `git config credential.helper`)
- [ ] Error handling: repo unavailable, network timeout, token expired

**Recommendation for Planner:**
- Use `simple-git` (npm package, high-level API, handles credentials cleanly)
- Clone location: `./.cache/repos/bss-game/` (relative to cwd, not checked into git)
- Freshness: Check `.git/FETCH_HEAD` timestamp; pull if >24h old OR first init
- Error handling: Log error, return null codebase context, allow Claude to proceed without code

---

### MEDIUM FINDING: Artifact Proposal Heuristic Undefined

**Problem:** `/workbench` command should "propose zero or more artifacts" based on conversation content. Requirements state:
- "Bot analyzes dialogue and proposes artifacts (if any)"
- Clear system prompt guidance provided
- But exact criteria for triggering proposal not specified

**Impact:** Planner needs to define heuristic (word count, explicit request, Claude confidence score).

**Approach in v1 Context:** ClaudeService uses prompt-based heuristics (e.g., asking Claude "should we create an artifact?"). v2 likely follows same pattern.

**Status:** Acceptable for Planner to defer. Implement as: "At conversation end, ask Claude: Do these messages suggest creating an analysis/story/research artifact? Respond with: PROPOSE: [type] or NO_ARTIFACT. Parse response."

---

### MEDIUM FINDING: Workbench Conversation Length & Timeout

**Problem:** `/workbench` is "free-form NL conversation" but:
- No maximum conversation length specified (memory/cost risk)
- No explicit "end conversation" trigger specified
- In-memory state pattern means restart loses ongoing workbench
- 60-minute auto-archive may conflict with long conversations

**Impact:** Planner should decide:
- Max turns per conversation (e.g., 20 turns, 1 hour, or until user says "done")
- Should workbench prompt user to confirm end, or auto-detect via Claude signal?

**Current v1 Pattern:** `/issue` uses Claude signal (`[READY_TO_SUMMARIZE]`) to trigger phase transition. v2 `/workbench` likely needs similar pattern.

**Status:** Acceptable for Planner. Suggest: "After each user message, Claude responds or asks clarifying question. When Claude detects conversation has reached a good endpoint, respond with [END_CONVERSATION]. Then bot asks Claude to propose artifacts."

---

### LOW FINDING: Label Creation Race Condition

**Problem:** If GitHub labels `analysis`, `user-story`, `research` don't exist, bot should create them. But if v2 commands run in parallel, race condition could occur (both try to create same label).

**Impact:** Minor. GitHub API returns 422 if label already exists during create attempt.

**Mitigation:** Planner should decide:
- Try to create label, catch 422, continue (silently ignore)
- Pre-fetch labels on bot startup, cache, skip create if exists
- Document that labels must be pre-created in repo (simplest)

**Current Status:** Not blocking. Implementor can handle 422 gracefully.

---

### OBSERVATION: v1 Cancel Path Not Fully Specified

**Finding:** v1 message handler (line 140-145) asks "upravit alebo zrusit?" (refine or cancel?) but doesn't explicitly handle "zrusit" (cancel) as a state transition. It just loops back to `'collecting'` phase for both refine and any other response.

**Impact:** If user responds "zrusit", it's processed as a normal collecting message, which Claude tries to incorporate into feedback. This is a design quirk, not a bug, but worth noting for v2.

**v2 Implication:** v2 command handlers should be more explicit about state transitions. Add explicit `'canceling'` phase if needed to handle "cancel" cleanly.

---

### LOW FINDING: Agent SDK Tool Scoping

**Problem:** Agent SDK tools (file read, directory listing, grep) must be **read-only** and **scoped to codebase directory only**. Requirements are clear, but:
- Exact mechanism for tool scoping not researched (environment variable? path prefix? sandboxing?)
- Tool error messages if user tries to access parent directories not specified

**Impact:** Medium risk during v2 implementation. Tools must be carefully configured.

**Mitigation:** Planner should research Agent SDK tool configuration and provide security checklist to Implementor:
- [ ] Tools only accessible within codebase directory
- [ ] No write operations
- [ ] No git commands
- [ ] Error message if attempting parent directory access

---

## Recommendations for Planner

### 1. **Verify Agent SDK Availability and API**

Before designing v2 in detail:
- Confirm `@anthropic-ai/sdk` includes Agent SDK module (or separate package)
- Confirm Node.js 20+ compatibility
- Confirm ESM compatibility
- Document exact session spawn API
- Document tool definition pattern
- Plan AgentService interface based on SDK API

**Why:** All v2 command designs depend on this. Incorrect assumptions = rework.

---

### 2. **Research Discord.js v14 Permission API**

Before implementing v2 command handlers:
- Confirm `PermissionsBitField.Flags.Administrator` check pattern
- Test with mock interaction in test environment
- Document exact error message for non-admin users

**Why:** Permission check must be correct and consistent across all four v2 commands.

---

### 3. **Define Git Clone Strategy**

Before implementing AgentService:
- Choose clone location (recommend: `./.cache/repos/bss-game/`)
- Choose freshness strategy (recommend: 24h TTL with `FETCH_HEAD` timestamp)
- Choose Node.js package (recommend: `simple-git`)
- Plan error recovery (log, return null, allow Claude to proceed)

**Why:** AgentService initialization depends on this. v1 Implementor can proceed independently.

---

### 4. **Design Message Handler Extension for v2**

Message handler state machine is shared code used by both v1 and v2:
- Add new `ConversationPhase` values: `'v2-analyzing'`, `'v2-story-drafting'`, `'v2-research-investigating'`, `'v2-workbench'`
- Add optional `commandType` field to `ConversationState` to route to correct handler
- Plan new handler methods (e.g., `handleV2Analyzing`, `handleV2Workbench`)
- Plan cleanup logic (all v2 phases eventually reach `'done'` and state entry deleted)

**Why:** Message handler is critical shared component. Design must be watertight.

---

### 5. **Plan Claude Service Extensions**

ClaudeService will add new methods for artifact generation:
- `generateCodeAnalysis(question: string, codeContext: string): Promise<string>`
- `generateUserStory(requirements: string, codeContext?: string): Promise<string>`
- `generateResearch(question: string, codeContext?: string): Promise<string>`
- `proposeArtifacts(conversation: ConversationMessage[]): Promise<ArtifactProposal[]>`

Design system prompts for each. Determine if they reuse existing `messages.create()` or need new methods.

**Why:** All v2 commands depend on these. Stable API design = isolated implementation.

---

### 6. **Define Admin Permission Check Pattern**

All four v2 commands must check admin status:
```typescript
// Design pattern:
const isAdmin = interaction.member?.permissions?.has(PermissionsBitField.Flags.Administrator);
if (!isAdmin) {
  await interaction.reply({ content: 'Len administrátori...', ephemeral: true });
  return;
}
```

Confirm exact API and test pattern.

**Why:** Consistency and correctness across all v2 commands.

---

### 7. **Plan Artifact Confirmation Flow**

All v2 commands end with user confirmation before GitHub issue creation:
- Show artifact preview
- Ask user to confirm ("Vytvoriť?")
- If yes: create GitHub issue with appropriate label
- If no: ask improve/cancel → loop or close

Design is identical to v1 confirmation flow; reuse pattern.

**Why:** Familiar UX, reduces implementation complexity.

---

### 8. **Identify v1/v2 Boundary in Message Handler**

Message handler is extended (not replaced) for v2:
- v1 phases: `'collecting'`, `'summarizing'`, `'confirming'`, `'done'` → v1 handlers unchanged
- v2 phases: `'v2-analyzing'`, `'v2-story-drafting'`, `'v2-research-investigating'`, `'v2-workbench'` → new v2 handlers
- Route based on phase or `commandType` field

Ensure v1 tests still pass; v2 adds new tests for v2 handlers.

**Why:** Backward compatibility non-negotiable.

---

### 9. **Plan Test Mocking Strategy for Agent SDK**

Agent SDK session spawn and tool responses must be fully mocked:
- Mock `@anthropic-ai/sdk/agent` module (or appropriate import path)
- Mock session.run() to return tool calls and final response
- Mock file tool: return file contents from in-memory test fixture
- Mock grep tool: return matching lines from test fixture
- Mock ls tool: return directory listing from test fixture

Pattern likely follows existing `vi.hoisted()` + `vi.mock()` pattern.

**Why:** v2 tests must not require real codebase access. All external APIs mocked.

---

### 10. **Document v2 Extensibility Contract**

Create a design document for Implementor with:
- ConversationPhase enum changes (exact new values)
- ConversationState interface changes (new optional fields)
- MessageHandler extension pattern (new handler methods)
- ClaudeService new methods (signatures, system prompts)
- AgentService interface (public API)
- Command handler pattern (check channel, check admin, create thread, init state)
- Test patterns (mock setup for v2 commands)

**Why:** Clear specification = correct implementation on first try.

---

## Current State vs Target State

| Area | Current (v1) | Target (v2) |
|------|--------------|-------------|
| **Slash Commands** | 1 command (`/issue`) | 5 commands (`/issue` + `/analyze`, `/story`, `/research`, `/workbench`) |
| **ConversationPhase** | 4 phases: collecting, summarizing, confirming, done | 8 phases: v1 + v2-analyzing, v2-story-drafting, v2-research-investigating, v2-workbench |
| **Services** | 3 services: Claude, GitHub, Thread | 4 services: (same 3 + Agent SDK spawning) |
| **Message Handler** | v1 state machine (4 phases) | Extended state machine (4 v1 phases isolated, 4 v2 phases added) |
| **Permission Checks** | None (v1 open to all) | Admin check on all v2 commands |
| **Artifact Types** | Issue (single label or none) | Issue + label set (analysis, user-story, research) |
| **Code Context** | None | Agent SDK provides code-aware context |
| **External Dependency** | None new | Agent SDK (NEW) |

---

## File Organization (v1 + v2 Preview)

```
src/
├── index.ts                          # Entry point (extend: add v2 routing)
├── config.ts                         # Unchanged
├── types/
│   └── index.ts                      # Extend: add v2 phases + ArtifactProposal
├── services/
│   ├── claude.service.ts             # Extend: add artifact generation
│   ├── github.service.ts             # Unchanged (labels already supported)
│   ├── thread.service.ts             # Unchanged
│   └── agent.service.ts              # NEW (Agent SDK wrapper)
├── handlers/
│   └── message.handler.ts            # Extend: add v2 phase handlers
└── commands/
    ├── index.ts                      # Extend: register v2 commands
    ├── issue.ts                      # Unchanged (v1)
    ├── analyze.ts                    # NEW (v2)
    ├── story.ts                      # NEW (v2)
    ├── research.ts                   # NEW (v2)
    └── workbench.ts                  # NEW (v2)

tests/
├── config.spec.ts                    # Unchanged
├── services/
│   ├── claude.service.spec.ts        # Extend: test new artifact methods
│   ├── github.service.spec.ts        # Unchanged
│   ├── thread.service.spec.ts        # Unchanged
│   └── agent.service.spec.ts         # NEW (mocked Agent SDK)
├── handlers/
│   └── message.handler.spec.ts       # Extend: add v2 phase tests
└── commands/
    └── *.spec.ts                     # NEW: tests for v2 commands
```

---

## Summary for Planner

**v1 Status:** Fully implemented, 9 source files + 5 test files. Standalone Discord bot with single feedback collection command. Services are modular, state machine is extensible.

**v2 Requirements:** Add four new slash commands with code-aware analysis via Agent SDK. Reuse v1 infrastructure (thread service, message handler, GitHub service). Extend types, services, and state machine.

**Key Extensibility Points:**
1. `src/types/index.ts` — Add v2 phases and optional `commandType`
2. `src/commands/index.ts` — Register four new commands
3. `src/commands/*.ts` — Implement four new handlers (follow v1 pattern)
4. `src/index.ts` — Route new commands
5. `src/handlers/message.handler.ts` — Add v2 phase handlers (preserve v1)
6. `src/services/claude.service.ts` — Add artifact generation methods
7. `src/services/agent.service.ts` — NEW, spawn Agent SDK sessions

**Unverified Assumptions (Research Required):**
- Agent SDK package name, version, ESM compatibility, API pattern
- Discord.js v14 admin permission check API
- Git clone management strategy (location, freshness, package choice)

**Test Infrastructure:** Vitest with `vi.hoisted()` pattern for ESM mocking. Existing patterns sufficient for v2 mocks.

**Risk:** None blocking. Agent SDK research should happen before detailed design. Permission check and git strategy can be researched in parallel with design.

