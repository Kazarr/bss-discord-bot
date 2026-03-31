---
phase: planner
status: in-review
created: 2026-03-31
updated: 2026-03-31
task_count: 10
estimated_files: 23
risk_level: medium
---

# Implementation Plan — Discord Bot Issue Collector

## Chosen Approach

**Standalone Node.js Discord bot** in a new directory `bss-discord-bot/` at the working directory root. The bot uses:
- **Private threads in a regular text channel** (not Forum channel — Forum doesn't support private threads)
- **Prompt-based semantic similarity** via Claude API (no embeddings API available)
- **Configurable GitHub target** via `GITHUB_OWNER` + `GITHUB_REPO` env vars

### Approach Comparison — Thread Type

| Criterion | A: Private thread in text channel | B: Public forum post | C: DM-based conversation |
|-----------|----------------------------------|---------------------|--------------------------|
| Privacy | Full (only invoker + admins) | None | Full |
| UX | Thread in server context | Forum organization, tags | Disconnected from server |
| Complexity | Low | Low | Medium |
| Meets requirements | YES | NO (privacy violation) | Partial (no server context) |

**Decision: Approach A** — private threads in a regular text channel. Only approach that fully meets privacy requirements.

---

## Change Plan

### TASK-001: Project Scaffolding

**What:** Create the project directory and all configuration files.

**Files:**
| File | Action | Lines |
|------|--------|-------|
| `bss-discord-bot/package.json` | CREATE | ~45 |
| `bss-discord-bot/tsconfig.json` | CREATE | ~20 |
| `bss-discord-bot/.prettierrc` | CREATE | ~3 |
| `bss-discord-bot/eslint.config.mjs` | CREATE | ~20 |
| `bss-discord-bot/vitest.config.ts` | CREATE | ~15 |
| `bss-discord-bot/tsup.config.ts` | CREATE | ~10 |
| `bss-discord-bot/.gitignore` | CREATE | ~15 |
| `bss-discord-bot/.env.example` | CREATE | ~15 |
| `bss-discord-bot/.nvmrc` | CREATE | ~1 |

**Conventions:**
- TypeScript strict mode, ES2022 target, nodenext module resolution
- ESM (`"type": "module"` in package.json)
- Single quotes (`.prettierrc: { "singleQuote": true }`)
- Node.js >= 20 LTS

**Dependencies:**
- discord.js ^14.26.0
- @anthropic-ai/sdk ^0.80.0
- @octokit/rest ^22.0.1
- dotenv ^17.3.1
- typescript ~5.9.2

**Dev dependencies:**
- vitest ^4.1.2
- tsx ^4.21.0
- tsup ^8.5.1
- prettier ^2.6.2
- eslint ^9.8.0
- typescript-eslint ^8.40.0
- @types/node ^20.19.9

**Verify:** `cd bss-discord-bot && npm install` succeeds without errors.

---

### TASK-002: Config Module

**What:** Environment variable loading and validation with fail-fast on missing required vars.

**Files:**
| File | Action | Lines |
|------|--------|-------|
| `bss-discord-bot/src/config.ts` | CREATE | ~60 |

**Details:**
- Load env vars via `dotenv/config` import
- Validate all required vars: DISCORD_TOKEN, DISCORD_GUILD_ID, DISCORD_CHANNEL_ID, ANTHROPIC_API_KEY, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO
- Optional vars with defaults: CLAUDE_MODEL (default: `claude-sonnet-4-20250514`), SIMILARITY_THRESHOLD (not numeric — used as guidance in Claude prompt)
- Export a typed `config` object
- Throw descriptive error on missing required vars

**Verify:** `npx tsx src/config.ts` with missing vars throws descriptive error.

---

### TASK-003: TypeScript Types

**What:** Shared interfaces and types used across all services.

**Files:**
| File | Action | Lines |
|------|--------|-------|
| `bss-discord-bot/src/types/index.ts` | CREATE | ~50 |

**Types:**
- `ConversationState` — { threadId, userId, messages: Message[], phase: 'collecting' | 'summarizing' | 'confirming' | 'done', summary?: string }
- `IssueData` — { title, body, labels? }
- `GitHubIssue` — { number, title, body, state, url }
- `SimilarityResult` — { matched: boolean, issue?: GitHubIssue, confidence?: string }
- `BotConfig` — typed config object shape

**Verify:** `npx tsc --noEmit` passes.

---

### TASK-004: GitHub Service

**What:** Octokit wrapper for reading, creating, and commenting on GitHub issues.

**Files:**
| File | Action | Lines |
|------|--------|-------|
| `bss-discord-bot/src/services/github.service.ts` | CREATE | ~90 |

**API:**
- `fetchAllIssues(): Promise<GitHubIssue[]>` — paginate all open+closed issues, cache result
- `createIssue(data: IssueData): Promise<GitHubIssue>` — create new issue, invalidate cache
- `addComment(issueNumber: number, body: string): Promise<void>` — add comment to existing issue
- `refreshCache(): Promise<void>` — force cache refresh

**Details:**
- Use `octokit.paginate()` for automatic pagination
- In-memory cache with TTL (refresh on create or after 15 min)
- Error handling for 404 (repo not found), 403 (rate limit), network errors

**Verify:** Unit tests pass (TASK-010).

---

### TASK-005: Claude Service

**What:** Anthropic API wrapper for conversation management, summarization, scope filtering, and semantic similarity.

**Files:**
| File | Action | Lines |
|------|--------|-------|
| `bss-discord-bot/src/services/claude.service.ts` | CREATE | ~150 |

**API:**
- `chat(conversationMessages: Message[], userMessage: string): Promise<string>` — multi-turn conversation with game feedback system prompt
- `summarize(conversationMessages: Message[]): Promise<string>` — generate issue summary from conversation
- `isGameRelated(message: string): Promise<boolean>` — scope filter (reject off-topic)
- `findSimilarIssue(summary: string, issues: GitHubIssue[]): Promise<SimilarityResult>` — prompt-based semantic similarity

**System prompts:**
- Conversation prompt: "You are a game feedback collector for By Sword and Seal. Communicate in Slovak. Ask clarifying questions to understand the issue. Accept: game mechanics, bugs, UI/UX. Reject: completely off-topic."
- Similarity prompt: "Compare this summary against the following GitHub issues. If one is clearly about the same topic, return its number. If none match, return 'none'."

**Details:**
- Conversation history managed externally (passed in, not stored)
- Claude model configurable via CLAUDE_MODEL env var
- Scope filter runs on first user message — if off-topic, reject immediately

**Verify:** Unit tests pass (TASK-010).

---

### TASK-006: Thread Service

**What:** Discord thread lifecycle management — create, message, archive.

**Files:**
| File | Action | Lines |
|------|--------|-------|
| `bss-discord-bot/src/services/thread.service.ts` | CREATE | ~60 |

**API:**
- `createPrivateThread(channel: TextChannel, user: User, name: string): Promise<ThreadChannel>` — create private thread, add user, set auto-archive
- `sendMessage(thread: ThreadChannel, content: string): Promise<Message>` — send bot message in thread
- `closeThread(thread: ThreadChannel): Promise<void>` — archive + lock thread

**Details:**
- Thread type: `ChannelType.PrivateThread`
- `invitable: false` — prevent others from joining
- `autoArchiveDuration: 60` — auto-archive after 60 min of inactivity
- Thread name format: `Issue: {username} - {date}`

**Verify:** Unit tests pass (TASK-010).

---

### TASK-007: Message Handler

**What:** State machine that routes messages in threads through the conversation flow.

**Files:**
| File | Action | Lines |
|------|--------|-------|
| `bss-discord-bot/src/handlers/message.handler.ts` | CREATE | ~120 |

**State Machine:**
```
[collecting] → user message → Claude chat → bot reply → [collecting]
[collecting] → Claude determines enough info → Claude summarize → [summarizing]
[summarizing] → bot shows summary + "Vytvoriť?" → [confirming]
[confirming] → user says "áno/yes" → GitHub action → close thread → [done]
[confirming] → user says "nie/no" → bot asks "refine or cancel?" → [collecting] or → close thread → [done]
```

**Details:**
- `Map<string, ConversationState>` — in-memory state keyed by thread ID
- `handleMessage(message: Message): Promise<void>` — main entry point
- Integrates: ClaudeService (chat, summarize, isGameRelated, findSimilarIssue), GitHubService (createIssue, addComment), ThreadService (sendMessage, closeThread)
- On GitHub action: format comment/issue body with Discord user info and conversation summary
- Cleanup: remove state entry when thread reaches 'done'

**Verify:** Unit tests pass (TASK-010).

---

### TASK-008: Slash Command Handler

**What:** `/issue` slash command definition and interaction handler.

**Files:**
| File | Action | Lines |
|------|--------|-------|
| `bss-discord-bot/src/commands/issue.ts` | CREATE | ~50 |

**Details:**
- `SlashCommandBuilder` with name `issue` and description
- Handler: validate channel is the designated channel, create private thread, add user, send welcome message, initialize ConversationState
- Reply to interaction with ephemeral message: "Vytvoril som ti privátne vlákno. Pokračuj tam."
- Error handling: wrong channel, missing permissions, thread creation failure

**Verify:** Unit tests pass (TASK-010).

---

### TASK-009: Bot Entry Point + Command Registration

**What:** Bot startup, Discord client initialization, event wiring, and command deployment script.

**Files:**
| File | Action | Lines |
|------|--------|-------|
| `bss-discord-bot/src/index.ts` | CREATE | ~60 |
| `bss-discord-bot/src/commands/index.ts` | CREATE | ~40 |

**index.ts:**
- Import `dotenv/config` at top
- Create Discord `Client` with required intents (Guilds, GuildMessages, MessageContent)
- Register event handlers: `interactionCreate` → command router, `messageCreate` → message handler
- Login with `DISCORD_TOKEN`
- Graceful shutdown on SIGINT/SIGTERM

**commands/index.ts:**
- `deployCommands()` function — registers slash commands via Discord REST API
- Uses `Routes.applicationGuildCommands()` for guild-specific registration
- Called from `index.ts` on bot ready event

**Verify:** `npx tsx src/index.ts` starts without error (with valid env vars). `npx tsc --noEmit` passes.

---

### TASK-010: Unit Tests

**What:** Comprehensive unit tests for all services and handlers.

**Files:**
| File | Action | Lines |
|------|--------|-------|
| `bss-discord-bot/tests/config.spec.ts` | CREATE | ~50 |
| `bss-discord-bot/tests/services/github.service.spec.ts` | CREATE | ~100 |
| `bss-discord-bot/tests/services/claude.service.spec.ts` | CREATE | ~120 |
| `bss-discord-bot/tests/services/thread.service.spec.ts` | CREATE | ~80 |
| `bss-discord-bot/tests/handlers/message.handler.spec.ts` | CREATE | ~100 |

**Test coverage:**
- **config.spec.ts:** Missing required vars throw, defaults applied for optional vars
- **github.service.spec.ts:** Fetch with pagination, create issue, add comment, cache invalidation, 404/403 error handling
- **claude.service.spec.ts:** Multi-turn chat, summarization, scope filter (game-related / off-topic), similarity matching (match found / no match)
- **thread.service.spec.ts:** Create private thread with correct params, send message, archive+lock
- **message.handler.spec.ts:** Full state machine flow — collecting → summarizing → confirming → done (create new), confirming → done (attach existing), decline → refine, decline → cancel, off-topic rejection

**Mock strategy:**
- `vi.mock('discord.js')` — mock Client, TextChannel, ThreadChannel, Message
- `vi.mock('@anthropic-ai/sdk')` — mock Anthropic client and messages.create
- `vi.mock('@octokit/rest')` — mock Octokit and all REST methods

**Verify:** `npx vitest run` passes all tests.

---

## Implementation Order

```
TASK-001 (scaffolding)
    ↓
TASK-002 (config) + TASK-003 (types)  ← can be parallel
    ↓
TASK-004 (github) + TASK-005 (claude) + TASK-006 (thread)  ← can be parallel
    ↓
TASK-007 (message handler)  ← depends on all services
    ↓
TASK-008 (slash command)  ← depends on thread service + message handler
    ↓
TASK-009 (entry point + registration)  ← depends on all above
    ↓
TASK-010 (tests)  ← depends on all source files
```

Sequential execution order: 001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009 → 010

---

## Impact Analysis

### What Changes
- **New directory:** `bss-discord-bot/` with 23 new files (~1,340 lines total)
- **External APIs used:** Discord API, Anthropic Messages API, GitHub REST API

### What Does NOT Change
1. **Game monorepo source code** — `apps/client/`, `apps/server/`, `libs/shared/` are untouched
2. **Game monorepo configuration** — `package.json`, `tsconfig.base.json`, `nx.json`, etc. unchanged
3. **Database schema** — no Prisma migrations, no new tables
4. **Existing tests** — no `.spec.ts` files are modified
5. **CI/CD pipeline** — game monorepo CI is not affected
6. **Game server runtime** — bot runs as a separate process, no coupling

---

## Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Discord `MessageContent` privileged intent not enabled | Medium | High | Document in .env.example, fail with descriptive error |
| GitHub repo doesn't exist at runtime | High | Medium | Configurable via env vars, graceful error message |
| Claude API costs per invocation | Low | Low | Acceptable for v1 low volume |
| Bot restart loses conversations | Low | Low | Accepted limitation, orphaned threads auto-archive |
| Prompt-based similarity doesn't scale past ~200 issues | Low (v1) | Low | v2 can add embeddings |

---

## Testing Strategy

- **Framework:** Vitest 4.x (ESM-native, fast)
- **Approach:** All external APIs mocked (`vi.mock`)
- **Coverage targets:** All service methods, all state machine transitions, config validation
- **No integration tests for v1** — cost, rate limits, test isolation concerns
- **All state machine branches tested** — including "dormant" paths (decline, cancel, off-topic)
- **Verify command:** `npx vitest run`
