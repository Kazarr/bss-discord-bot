<!-- Scout | 2026-03-31 | Codebase Map -->
<!-- Project: bss-discord-bot (new standalone repo — Kazarr/bss-discord-bot) -->
<!-- Task: Build a Discord bot that collects game feedback via Forum channel private threads, uses Claude API for conversation + semantic similarity, and creates/attaches GitHub issues -->

## Note: New Project — No Existing Codebase

This is a **greenfield standalone project** in a new repository (`Kazarr/bss-discord-bot`). There is no existing codebase to map. Instead, this document covers:
1. Technology research (discord.js, Anthropic SDK, Octokit)
2. Reference patterns from the game monorepo
3. Discord Forum channel + private thread feasibility
4. GitHub issues volume analysis
5. Proposed project structure and conventions

---

## Technology Stack Research

### Core Dependencies (Pinned Versions)

| Package | Version | Node.js Req | Purpose |
|---------|---------|-------------|---------|
| `discord.js` | 14.26.0 | >= 18 | Discord bot framework (slash commands, forum channels, threads) |
| `@anthropic-ai/sdk` | 0.80.0 | (none specified) | Claude API client (multi-turn conversation, semantic comparison) |
| `@octokit/rest` | 22.0.1 | >= 20 | GitHub REST API client (read/create issues, add comments) |
| `dotenv` | 17.3.1 | — | Environment variable loading |
| `typescript` | ~5.9.2 | — | Match game monorepo version for consistency |

### Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `vitest` | ^4.1.2 | Unit testing (match game monorepo's client-side test framework) |
| `tsx` | ^4.21.0 | TypeScript execution for development (replaces ts-node, faster) |
| `tsup` | ^8.5.1 | TypeScript bundler for production build |
| `prettier` | ^2.6.2 | Code formatting (match game monorepo version) |
| `eslint` | ^9.8.0 | Linting (match game monorepo version for consistency) |
| `typescript-eslint` | ^8.40.0 | TypeScript ESLint integration |
| `@types/node` | ^20.19.9 | Node.js type definitions (match game monorepo) |

### discord.js 14 Key Dependencies (auto-installed)

| Package | Version | Purpose |
|---------|---------|---------|
| `@discordjs/builders` | ^1.14.0 | Slash command builders |
| `@discordjs/rest` | ^2.6.1 | REST API for command registration |
| `@discordjs/ws` | ^1.2.3 | WebSocket connection |
| `discord-api-types` | ^0.38.40 | Discord API type definitions |

---

## Discord Forum Channel + Private Thread Research

### CRITICAL FINDING: Forum Channels Do NOT Support Private Threads

Discord Forum channels (channel type 15 / `GuildForum`) have a fundamental limitation:

**Forum threads are ALWAYS public within the channel.** Discord's Forum channel type only supports `PublicThread` (type 11). The `PrivateThread` type (type 12) is only available in **regular text channels**, not in Forum channels.

Discord thread types:
- `PublicThread` (11) — available in text channels AND forum channels
- `PrivateThread` (12) — available ONLY in text channels
- `AnnouncementThread` (13) — available in announcement channels

**Source:** Discord API documentation, `discord-api-types` ChannelType enum. Forum channels use `startThread()` which creates public forum posts, not private threads.

### Alternative Approaches (for Planner to decide)

| Approach | Privacy | UX | Complexity |
|----------|---------|-----|-----------|
| **A: Private thread in a regular text channel** | Full privacy (only invoker + admins) | No forum-like organization, threads in a text channel | Low — discord.js fully supports `ThreadChannel.create({ type: ChannelType.PrivateThread })` on text channels |
| **B: Forum post (public) + DM for sensitive info** | Partial (forum post visible to all, DM private) | Split conversation, confusing | Medium |
| **C: Ephemeral replies + DM-based conversation** | Full privacy (DM only) | No server context, may feel disconnected | Medium |
| **D: Forum post (public) accepting visibility** | No privacy | Best UX (forum organization, tags, search) | Lowest |
| **E: Dedicated private text channel per user** | Full privacy | Creates channel clutter | High |

**Recommendation for Planner:** Approach A (private thread in a regular text channel) is the closest to the requirements. The `/issue` command would be used in a designated text channel, and the bot creates a private thread there. This gives:
- Full privacy (only invoker + users with `MANAGE_THREADS` permission see it)
- Multi-turn conversation in the thread
- Thread auto-archiving after completion
- No channel clutter (threads collapse)

### Discord.js Required Intents

| Intent | Reason | Privileged? |
|--------|--------|-------------|
| `Guilds` | Access guild/channel structure | No |
| `GuildMessages` | Receive messages in threads | No |
| `MessageContent` | Read message content in threads | **Yes** (must enable in Developer Portal) |

**Note:** `MessageContent` is a **privileged intent** that must be explicitly enabled in the Discord Developer Portal under Bot settings. Without it, the bot cannot read user messages in threads.

### Discord Bot Permissions Required

| Permission | Bit | Reason |
|------------|-----|--------|
| `SendMessages` | 0x800 | Send messages in channels/threads |
| `CreatePrivateThreads` | 0x4000000000 | Create private threads |
| `SendMessagesInThreads` | 0x4000000000 | Send messages inside threads |
| `ManageThreads` | 0x400000000 | Archive/close threads, manage thread settings |
| `ReadMessageHistory` | 0x10000 | Read conversation history in threads |
| `UseApplicationCommands` | — | Implicit for slash commands |

### Slash Command Registration

discord.js 14 uses `SlashCommandBuilder` from `@discordjs/builders`:
```typescript
new SlashCommandBuilder()
  .setName('issue')
  .setDescription('Report a game issue, bug, or feature request')
```

Commands are registered via `REST.put(Routes.applicationGuildCommands(...))` for guild-specific commands (recommended for development) or `Routes.applicationCommands(...)` for global commands.

### Thread Lifecycle in discord.js 14

```typescript
// Create private thread in a text channel
const thread = await channel.threads.create({
  name: `Issue: ${user.username}`,
  type: ChannelType.PrivateThread,
  autoArchiveDuration: 60, // minutes
  invitable: false, // prevent others from joining
});

// Add the invoking user
await thread.members.add(user.id);

// Send messages
await thread.send('Describe your issue...');

// Close/archive when done
await thread.setArchived(true);
await thread.setLocked(true);
```

---

## Anthropic SDK Research

### Multi-Turn Conversation

The `@anthropic-ai/sdk` supports multi-turn conversations via the Messages API:

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  system: 'You are a game feedback collector...',
  messages: [
    { role: 'user', content: 'I found a bug...' },
    { role: 'assistant', content: 'Can you describe...' },
    { role: 'user', content: 'When I click...' },
  ],
});
```

The bot must maintain conversation history per thread (in-memory Map keyed by thread ID). On bot restart, orphaned threads lose their conversation context (accepted limitation per requirements).

### Semantic Similarity Strategy

The Anthropic SDK does **NOT** provide a dedicated embeddings/similarity API. Two approaches for semantic comparison:

| Approach | Pros | Cons |
|----------|------|------|
| **A: Claude prompt-based classification** — Send the summary + all existing issue titles/bodies to Claude and ask "which issue is most similar, if any?" | Simple, leverages Claude's understanding, no vector DB needed | Higher token cost per comparison (must send all issues), latency |
| **B: Text embeddings via separate service** — Use a dedicated embeddings API (e.g., Voyage AI, OpenAI) + cosine similarity | More precise similarity scores, lower per-comparison cost at scale | Extra dependency, extra API key, vector storage complexity |

**Recommendation for Planner:** Approach A (prompt-based) is best for v1 given:
- No database requirement (stateless)
- Small issue volume (currently 0 issues, expected <100 in near term)
- Simplicity — single API dependency
- Claude can reason about semantic meaning, not just keyword overlap

The prompt would include all issue titles + short descriptions and ask Claude to identify the most similar one (or "none" if no match).

---

## GitHub API Research (Octokit)

### Issue Operations Needed

```typescript
import { Octokit } from '@octokit/rest';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// Read all issues (open + closed)
const issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
  owner: 'Kazarr',
  repo: 'BySwordandSeal',  // NOTE: repo may not exist yet — see CRITICAL FINDING below
  state: 'all',
  per_page: 100,
});

// Create new issue
await octokit.rest.issues.create({
  owner: 'Kazarr',
  repo: 'BySwordandSeal',
  title: 'Bug: ...',
  body: '...',
});

// Add comment to existing issue
await octokit.rest.issues.createComment({
  owner: 'Kazarr',
  repo: 'BySwordandSeal',
  issue_number: 42,
  body: 'Related report from Discord user...',
});
```

### Rate Limits

| Auth Method | Rate Limit | Notes |
|-------------|-----------|-------|
| Personal Access Token | 5,000 requests/hour | Sufficient for this use case |
| No auth | 60 requests/hour | Insufficient |

With 0 current issues and expected low volume (<100 issues), rate limits are not a concern. The bot should cache the issue list to minimize API calls (refresh on each `/issue` invocation or every N minutes).

### CRITICAL FINDING: Target Repository Name Mismatch

- **Requirements state:** `Kazarr/BySwordandSeal`
- **Actual repository:** `Kazarr/By-Sword-and-Seal-Playground`
- The repo `Kazarr/BySwordandSeal` does **NOT exist** on GitHub

The requirements document references a repository that doesn't exist. The Planner should:
1. Use `Kazarr/By-Sword-and-Seal-Playground` (the actual repo), OR
2. The user plans to create `Kazarr/BySwordandSeal` as a separate repo, OR
3. Make the target repo configurable via environment variable (recommended)

**Recommendation:** Make the GitHub owner and repo configurable via `GITHUB_OWNER` and `GITHUB_REPO` environment variables so the bot works regardless of which repo is targeted.

### GitHub Issues Volume

- **Current issue count:** 0 (zero) issues in `Kazarr/By-Sword-and-Seal-Playground`
- **PRs count:** 14 (merged pull requests exist, but PRs are not issues for our purpose)
- **Impact:** Semantic comparison will be trivially fast initially. The bot should handle scaling to hundreds of issues gracefully (pagination, caching).

---

## Reference Patterns from Game Monorepo

### TypeScript Configuration (to carry over)

From `tsconfig.base.json`:
| Setting | Value | Carry Over? |
|---------|-------|-------------|
| `strict` | true | Yes |
| `target` | ES2022 | Yes |
| `module` | nodenext | Yes |
| `moduleResolution` | nodenext | Yes |
| `isolatedModules` | true | Yes |
| `noImplicitReturns` | true | Yes |
| `noUnusedLocals` | true | Yes |
| `noFallthroughCasesInSwitch` | true | Yes |
| `skipLibCheck` | true | Yes |
| `lib` | ["es2022"] | Yes |
| `composite` | true | No (not needed for standalone) |
| `declarationMap` | true | No (not a library) |
| `emitDeclarationOnly` | true | No (need JS output) |
| `customConditions` | ["@bss/source"] | No (monorepo-specific) |

### Code Style (to carry over)

| Convention | Value | Source |
|------------|-------|--------|
| Quotes | Single quotes | `.prettierrc: { "singleQuote": true }` |
| Semicolons | Required | Prettier default |
| Indentation | 2 spaces | Convention from monorepo |
| Import style | ES6 named imports | `import { X } from 'y'` pattern |
| Error handling | Typed exceptions, try/catch | NestJS pattern simplified for bot |
| Secrets | Environment variables only | `.env.example` pattern |
| Module system | ESM (`"type": "module"` in package.json) | nodenext resolution |

### NestJS Module Pattern (reference, not used directly)

The game server organizes code into modules with controller/service/module files:
```
auth/
  auth.module.ts      — Module registration
  auth.controller.ts  — HTTP endpoints
  auth.service.ts     — Business logic
  jwt.strategy.ts     — Passport strategy
  jwt-auth.guard.ts   — Route guard
  *.spec.ts           — Co-located tests
```

The Discord bot won't use NestJS (too heavy for a single-purpose bot), but the organizational pattern of separating concerns into service files is worth following.

### Node.js Version

- **Current local Node.js:** v24.7.0
- **discord.js requirement:** >= 18
- **Octokit requirement:** >= 20
- **Recommendation:** Target Node.js >= 20 (LTS). Pin in `.nvmrc` or `engines` field.

---

## Proposed Project Structure

```
bss-discord-bot/
├── src/
│   ├── index.ts                  # Entry point — bot startup, login
│   ├── config.ts                 # Environment variable loading and validation
│   ├── commands/
│   │   ├── index.ts              # Command registration (deploy commands to Discord API)
│   │   └── issue.ts              # /issue slash command handler
│   ├── services/
│   │   ├── claude.service.ts     # Anthropic API wrapper (conversation, summarization, similarity)
│   │   ├── github.service.ts     # Octokit wrapper (read issues, create issue, add comment)
│   │   └── thread.service.ts     # Thread lifecycle management (create, message, archive)
│   ├── handlers/
│   │   └── message.handler.ts    # Message handler for thread conversations
│   └── types/
│       └── index.ts              # TypeScript interfaces (ConversationState, IssueData, etc.)
├── tests/
│   ├── services/
│   │   ├── claude.service.spec.ts
│   │   ├── github.service.spec.ts
│   │   └── thread.service.spec.ts
│   ├── commands/
│   │   └── issue.spec.ts
│   └── handlers/
│       └── message.handler.spec.ts
├── .env.example                  # Template for required environment variables
├── .gitignore
├── .prettierrc                   # { "singleQuote": true }
├── eslint.config.mjs             # Flat ESLint config
├── tsconfig.json                 # TypeScript configuration
├── vitest.config.ts              # Vitest configuration
├── package.json
└── tsup.config.ts                # Build configuration (optional, tsx for dev)
```

### Environment Variables (.env.example)

```
# Discord
DISCORD_TOKEN=your-discord-bot-token
DISCORD_GUILD_ID=your-discord-server-id
DISCORD_CHANNEL_ID=channel-id-for-issue-threads

# Anthropic (Claude API)
ANTHROPIC_API_KEY=your-anthropic-api-key
CLAUDE_MODEL=claude-sonnet-4-20250514

# GitHub
GITHUB_TOKEN=your-github-personal-access-token
GITHUB_OWNER=Kazarr
GITHUB_REPO=BySwordandSeal

# Bot Configuration
SIMILARITY_THRESHOLD=0.7
```

---

## Relevant Files from Game Monorepo (Reference Only)

These files are NOT modified — they serve as reference patterns for the Planner.

| # | File | Lines | Description | Relevance |
|---|------|-------|-------------|-----------|
| 1 | `tsconfig.base.json` | 21 | Base TypeScript config | Carry over strict mode, ES2022, nodenext settings |
| 2 | `.prettierrc` | 3 | Prettier config | Carry over `{ "singleQuote": true }` |
| 3 | `package.json` | 95 | Root package.json | Reference for Node.js version, TypeScript version |
| 4 | `apps/server/src/main.ts` | 43 | Server entry point | Reference for environment-based config pattern |
| 5 | `apps/server/src/app/auth/auth.module.ts` | 21 | NestJS module pattern | Reference for modular code organization |
| 6 | `apps/server/src/app/auth/auth.service.ts` | ~150 | Service pattern | Reference for service class structure |
| 7 | `apps/server/.env.example` | 2 | Env example | Reference for `.env.example` pattern |
| 8 | `apps/server/jest.config.js` | 41 | Jest config | Reference for test configuration (but bot uses Vitest) |

---

## Existing Conventions (to carry over to new project)

Verified from 5+ files in the game monorepo:

1. **Single quotes** — enforced by `.prettierrc` (`{ "singleQuote": true }`)
2. **ES module imports** — `import { X } from 'package'` style, no CommonJS
3. **PascalCase for classes** — `AuthService`, `GameEngineService`
4. **camelCase for functions/methods** — `getProvince()`, `constructBuilding()`
5. **UPPER_SNAKE_CASE for constants** — `ECONOMY_TICK_INTERVAL_MS`
6. **kebab-case for file names** — `auth.service.ts`, `game-engine.service.ts`
7. **Co-located tests** — `*.spec.ts` alongside source files
8. **Secrets via env vars** — `process.env['KEY']` with bracket notation (not dot notation)
9. **Private readonly for injected deps** — `private readonly prisma: PrismaService`
10. **dotenv loaded at entry point** — `import 'dotenv/config'` at top of main.ts
11. **Strict TypeScript** — all strict checks enabled

---

## Test Infrastructure

### Recommended for Bot Project

| Category | Technology | Rationale |
|----------|-----------|-----------|
| Test Framework | Vitest 4.x | Faster than Jest, ESM-native, matches game monorepo client tests |
| Mocking | Vitest built-in (`vi.mock`, `vi.fn`) | No extra dependency needed |
| Coverage | `@vitest/coverage-v8` | Match game monorepo pattern |
| Test Location | `tests/` directory | Cleaner for small projects vs co-located |
| Test Naming | `*.spec.ts` | Match game monorepo convention |

### What to Test

| Component | Test Strategy |
|-----------|--------------|
| `claude.service.ts` | Mock `@anthropic-ai/sdk` — test conversation flow, summarization prompt, similarity comparison logic |
| `github.service.ts` | Mock `@octokit/rest` — test issue fetching, creation, comment attachment, pagination |
| `thread.service.ts` | Mock `discord.js` — test thread creation, message sending, archiving |
| `issue.ts` (command) | Mock all services — test slash command handler flow, confirmation logic |
| `message.handler.ts` | Mock services — test multi-turn conversation routing, scope filtering |
| `config.ts` | Test env var validation, missing var errors |

---

## Risks and Unexpected Findings

### CRITICAL FINDING: Forum Channels Cannot Have Private Threads
- **Problem:** Requirements specify "a designated Discord Forum channel" with "private threads." Discord Forum channels only support public threads (PublicThread type 11). Private threads (type 12) only work in regular text channels.
- **Impact:** The bot CANNOT use a Forum channel if privacy is a hard requirement. The Planner must choose an alternative approach (recommended: private threads in a regular text channel).
- **Severity:** HIGH — fundamentally changes the Discord integration design.

### CRITICAL FINDING: Target GitHub Repository Does Not Exist
- **Problem:** Requirements reference `Kazarr/BySwordandSeal` but this repository does not exist on GitHub. The actual game repository is `Kazarr/By-Sword-and-Seal-Playground`.
- **Impact:** The bot's GitHub integration target is ambiguous. If the repo doesn't exist at runtime, all GitHub operations will fail with 404.
- **Recommendation:** Make GitHub owner/repo configurable via environment variables. The user may plan to create the repo separately.

### MEDIUM RISK: Anthropic SDK Has No Embeddings API
- **Problem:** The requirements mention "Claude API embeddings or similarity" but the Anthropic SDK does not provide an embeddings endpoint. Semantic comparison must be done via prompt-based classification (sending all issues to Claude and asking for the best match).
- **Impact:** Higher token cost per comparison, and the approach may not scale well beyond ~200 issues (context window limits). For v1 with near-zero issues, this is fine.

### MEDIUM RISK: Privileged Intent Required (MessageContent)
- **Problem:** Reading message content in threads requires the `MessageContent` privileged intent, which must be manually enabled in the Discord Developer Portal. If not enabled, the bot receives empty message content.
- **Impact:** First-time setup requires a manual step in the Discord Developer Portal. Should be documented in README/setup guide.

### LOW RISK: Bot Restart Loses Conversation State
- **Problem:** The bot stores active conversations in-memory (Map keyed by thread ID). If the bot process restarts, all in-progress conversations are lost.
- **Impact:** Accepted limitation per requirements ("stateless for v1"). Orphaned threads will need manual cleanup. The bot could attempt to detect orphaned threads on startup and send a "conversation interrupted" message.

### LOW RISK: No .nvmrc in Game Monorepo
- **Problem:** The game monorepo doesn't have an `.nvmrc` file. Current local Node.js is v24.7.0 but the bot's minimum is v20 (Octokit requirement).
- **Impact:** The standalone project should include an `.nvmrc` pinning to Node.js 20 LTS for reproducibility.

---

## Recommendations for Planner

1. **Resolve the Forum vs. Text Channel decision** — Private threads are ONLY available in text channels. Decide between: (A) private threads in a text channel (recommended — full privacy), (B) public forum posts (no privacy), or (C) DM-based conversations (disconnected from server). This is the most impactful architectural decision.

2. **Use prompt-based semantic similarity** — Since Anthropic has no embeddings API, use Claude to compare the new issue summary against all existing issue titles/descriptions. For v1 with <100 issues, this is efficient. Include a configurable similarity threshold.

3. **Make GitHub target configurable** — Use `GITHUB_OWNER` and `GITHUB_REPO` env vars instead of hardcoding `Kazarr/BySwordandSeal`. The repo may not exist yet or may use a different name.

4. **Use Vitest (not Jest)** — Match the game monorepo's direction (Vitest for client + shared, moving away from Jest). Vitest has better ESM support and is faster.

5. **Use `tsx` for development, `tsup` for production build** — `tsx` provides fast TypeScript execution without compilation step for dev. `tsup` bundles for production. Alternatively, just use `tsx` for both (simpler, slightly larger footprint).

6. **Carry over these conventions from the game monorepo:** Single quotes, strict TypeScript, ES modules, `dotenv/config` import at entry point, `.env.example` pattern, bracket notation for `process.env['KEY']`.

7. **Document the Discord Developer Portal setup** — The bot needs: (a) application created, (b) bot token generated, (c) `MessageContent` privileged intent enabled, (d) bot invited to server with correct permissions. This should be in a setup section of the README.

8. **In-memory conversation state with thread ID key** — Use a `Map<string, ConversationState>` to track active conversations. Each entry holds the Claude message history and current state (collecting / summarizing / confirming / done). On thread archive or timeout, remove the entry.

9. **Conversation language** — The confirmation prompt uses Slovak ("Vytvorit?") per requirements. The system prompt for Claude should specify that the conversation is in Slovak but the GitHub issue should be written in English (or configurable).

10. **Issue caching strategy** — Fetch all issues from GitHub when the bot starts and cache them. Refresh the cache either (a) after each issue creation, or (b) periodically (every 15 minutes). For v1, per-invocation fetch is also acceptable given the low volume.

11. **Test strategy** — Mock all external APIs (Discord, Claude, GitHub) in unit tests. No integration tests with real APIs for v1 (cost, rate limits, test isolation). Use Vitest's `vi.mock()` for module-level mocking.

12. **Implementation order suggestion:**
    1. Project scaffolding (package.json, tsconfig, config, etc.)
    2. `config.ts` — env var loading and validation
    3. `github.service.ts` — issue CRUD (most testable, no Discord dependency)
    4. `claude.service.ts` — conversation + similarity (testable in isolation)
    5. `thread.service.ts` — Discord thread lifecycle
    6. `commands/issue.ts` — slash command handler
    7. `handlers/message.handler.ts` — thread message routing
    8. `index.ts` — bot startup, event wiring
    9. Command registration script
    10. Tests for all services
