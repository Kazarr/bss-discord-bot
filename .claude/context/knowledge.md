# Accumulated Project Knowledge

> Auto-maintained by Knowledge Agent. Last updated: 2026-04-14
> Contains resolved questions and verified facts from pipeline runs.
> Current run: v2 scope assessment and v1 convention verification

## Project Bootstrap

**Status (v1):** Greenfield project — no source code exists yet. v1 planning phase complete (CLAUDE.md, conventions, architecture documented in .claude/context/).

**v1 Pipeline Artifacts:** Original requirements.md, codebase-map.md, plan.md, decisions.md from v1 pipeline run were referenced in knowledge.md but are no longer in .claude/pipeline/ (likely archived or passed to Implementor phase as output).

**v1 Next phase:** Phase 4 (Implementor) to begin source implementation based on plan.md (10 TASKs documented in v1 knowledge.md below).

**v2 Status:** Planning phase — scope informally noted per task briefing. No formal requirements or implementation plan yet (awaiting Clarifier formal approval in future pipeline run).

---

## Critical Findings (from Codebase Map)

### CRITICAL FINDING #1: Forum Channels Cannot Have Private Threads

**Problem:** Requirements specify "designated Discord Forum channel" with "private threads." Discord Forum channels only support `PublicThread` (type 11). Private threads (`PrivateThread`, type 12) only work in regular text channels.

**Impact:** BLOCKER — cannot use Forum channel for privacy requirements.

**Decision:** Approach A (private threads in regular text channel) chosen in plan.md. Provides full privacy, multi-turn conversation in server context, no channel clutter.

**Implementation:** `ThreadService.createPrivateThread()` uses `ChannelType.PrivateThread` in text channel, not Forum.

**Verified:** discord.js 14 documentation confirms thread type restrictions.

---

### CRITICAL FINDING #2: Target GitHub Repository Does Not Exist

**Problem:** Requirements reference `Kazarr/BySwordandSeal` but this repository does NOT exist on GitHub. The actual game repo is `Kazarr/By-Sword-and-Seal-Playground`.

**Impact:** Bot's GitHub integration target is ambiguous at development time. Runtime will fail with 404 if repo doesn't exist.

**Decision:** Made GitHub owner/repo configurable via `GITHUB_OWNER` and `GITHUB_REPO` environment variables (plan.md TASK-002).

**Implementation:** All GitHub operations use `config.github.owner` and `config.github.repo` (not hardcoded).

**Note:** User may intend to create `Kazarr/BySwordandSeal` as a separate repo. Configuration approach handles both cases.

---

### CRITICAL FINDING #3: Anthropic SDK Has No Embeddings API

**Problem:** Requirements mention "Claude API embeddings or similarity" but Anthropic SDK does not provide embeddings endpoint.

**Impact:** Semantic comparison cannot use traditional embeddings + vector search.

**Decision:** Use prompt-based semantic similarity (plan.md TASK-005). Send all existing issues to Claude, ask for best match.

**Trade-off:** Higher token cost per comparison, doesn't scale past ~200 issues. Acceptable for v1 (currently 0 issues, expected <100).

**Implementation:** `ClaudeService.findSimilarIssue()` sends issue list in prompt, Claude returns best match.

---

### MEDIUM RISK: Discord MessageContent Privileged Intent

**Problem:** Reading message content in threads requires `MessageContent` privileged intent. Must be manually enabled in Discord Developer Portal under Bot settings.

**Impact:** First-time setup has a manual step. If not enabled, bot receives empty message content and cannot process feedback.

**Mitigation:** Document in README + .env.example. Fail with clear error message if intent not enabled.

**Implementation:** Required intent is listed in `Client` constructor.

---

### MEDIUM RISK: Bot Restart Loses Conversation State

**Problem:** Active conversations stored in-memory (`Map<threadId, ConversationState>`). Process restart orphans threads.

**Impact:** Accepted limitation per requirements ("stateless for v1"). Orphaned threads auto-archive after 60 minutes.

**Mitigation:** Bot could detect orphaned threads on startup and send "conversation interrupted" message.

**Implementation:** v1 accepts this. v2 can add database persistence.

---

## Technology Stack (Verified)

| Category | Technology | Version | Rationale |
|----------|-----------|---------|-----------|
| **Language** | TypeScript | ~5.9.2 | Strict mode mandatory, matches game monorepo |
| **Runtime** | Node.js | >= 20 LTS | Octokit requires >= 20 |
| **Module System** | ESM | — | `"type": "module"`, nodenext resolution |
| **Discord** | discord.js | 14.26.0 | Latest stable, private thread support confirmed |
| **AI** | @anthropic-ai/sdk | 0.80.0 | Multi-turn API, no embeddings |
| **GitHub** | @octokit/rest | 22.0.1 | REST API, pagination support |
| **Config** | dotenv | 17.3.1 | Standard env var loading |
| **Build (Dev)** | tsx | 4.21.0 | Fast TS execution, no compilation |
| **Build (Prod)** | tsup | 8.5.1 | TypeScript bundler |
| **Test** | Vitest | 4.1.2 | ESM-native, fast, matches monorepo client tests |
| **Lint** | ESLint 9.8.0 + typescript-eslint 8.40.0 | — | Flat config, TypeScript-aware |
| **Format** | Prettier | 2.6.2 | Single quotes (per monorepo convention) |

---

## Conventions (Verified Against Monorepo)

| Convention | Pattern | Verified |
|-----------|---------|----------|
| **Quotes** | Single quotes | ✓ `.prettierrc: { "singleQuote": true }` |
| **Semicolons** | Always | ✓ Prettier default |
| **Indentation** | 2 spaces | ✓ game monorepo standard |
| **Class names** | PascalCase | ✓ `ClaudeService`, `GitHubService` |
| **Method names** | camelCase | ✓ `findSimilarIssue()`, `createPrivateThread()` |
| **Constants** | UPPER_SNAKE_CASE | ✓ `AUTO_ARCHIVE_DURATION_MIN` |
| **File names** | kebab-case | ✓ `claude.service.ts`, `message.handler.ts` |
| **Test files** | `*.spec.ts` | ✓ `github.service.spec.ts` |
| **Module system** | ES6 named imports | ✓ `import { X } from 'y'` |
| **Env var access** | Bracket notation | ✓ `process.env['KEY']` |
| **dotenv load** | At entry point | ✓ `import 'dotenv/config'` in index.ts |
| **Secrets** | Env vars only | ✓ `.env.example` pattern |

---

## Implementation Plan Summary (10 TASKs)

| # | Task | Status | Dependencies |
|---|------|--------|--------------|
| 001 | Project Scaffolding (package.json, config files) | Ready | — |
| 002 | Config Module (env var loading) | Ready | 001 |
| 003 | TypeScript Types (interfaces) | Ready | 001 |
| 004 | GitHub Service (Octokit wrapper, caching) | Ready | 002, 003 |
| 005 | Claude Service (conversation, summarization, similarity) | Ready | 002, 003 |
| 006 | Thread Service (Discord thread lifecycle) | Ready | 002, 003 |
| 007 | Message Handler (state machine) | Ready | 004, 005, 006 |
| 008 | Slash Command Handler (/issue) | Ready | 006, 007 |
| 009 | Entry Point + Command Registration | Ready | All services |
| 010 | Unit Tests (all services + handlers) | Ready | All source files |

**Implementation order:** Sequential 001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009 → 010

---

## Known Gotchas & Lessons

### Conversation Flow State Machine

The state machine has 5 phases, not 4:
1. **collecting** — user provides feedback
2. **summarizing** — Claude generates summary (not user-visible state)
3. **confirming** — user approves/declines
4. **creating** — GitHub action in progress (not user-visible state)
5. **done** — cleanup, state entry removed

Test coverage must include:
- Full happy path: collecting → summarizing → confirming (approve) → creating → done
- Decline path: confirming → ask refine? → decline → done
- Refine path: confirming → ask refine? → refine → back to collecting
- Off-topic rejection: first message rejected → done

---

### Environment Variable Validation

The `config.ts` module must validate at startup, not lazily:
- Required vars: DISCORD_TOKEN, DISCORD_GUILD_ID, DISCORD_CHANNEL_ID, ANTHROPIC_API_KEY, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO
- Optional vars with defaults: CLAUDE_MODEL, SIMILARITY_THRESHOLD
- Fail-fast pattern — throw descriptive error on missing required var
- Do NOT allow undefined/null propagation to service layers

---

### Discord Privileged Intents

Three intents required:
- `Guilds` — regular
- `GuildMessages` — regular
- `MessageContent` — **PRIVILEGED** (must enable in Discord Developer Portal)

If `MessageContent` not enabled, bot receives empty `message.content` and cannot process feedback. This should fail explicitly, not silently.

---

### GitHub Issue Caching

Cache must be invalidated after `createIssue()`:
1. User creates new issue → GitHubService.createIssue()
2. Cache is now stale (new issue not in cached list)
3. Must call `refreshCache()` before next similarity check

Otherwise, semantic similarity won't know about newly created issues and may create duplicates.

---

### Prompt-Based Similarity Approach

Sending all issue titles/bodies to Claude in a single prompt has trade-offs:
- **Pro:** Simple, leverages Claude's reasoning, no vector DB
- **Con:** Token cost linear with issue count, doesn't scale past ~200 issues

For v1 (currently 0 issues, expected <100):
- Cost is negligible
- Latency is acceptable
- v2 can switch to embeddings API if volume grows

Include `SIMILARITY_THRESHOLD` as a configurable parameter (passed to Claude in prompt), not a computed value.

---

### In-Memory State Cleanup

Threads are orphaned if:
1. Bot process crashes/restarts
2. Thread is manually deleted in Discord
3. User leaves server

Mitigation:
- Threads auto-archive after 60 minutes of inactivity (Discord default)
- Bot could detect orphaned threads on startup and log warning
- v2 can add database persistence

For v1, accept that restarts will lose active conversations.

---

## Environment Variables (Final List)

```env
# Discord
DISCORD_TOKEN=your-discord-bot-token
DISCORD_GUILD_ID=your-discord-server-id
DISCORD_CHANNEL_ID=channel-id-for-issue-threads

# Anthropic (Claude API)
ANTHROPIC_API_KEY=your-anthropic-api-key
CLAUDE_MODEL=claude-sonnet-4-20250514  # optional, has default

# GitHub
GITHUB_TOKEN=your-github-personal-access-token
GITHUB_OWNER=Kazarr
GITHUB_REPO=BySwordandSeal

# Bot Configuration
SIMILARITY_THRESHOLD=0.7  # optional, used in prompt
```

---

## References & Links

| Item | Location | Notes |
|------|----------|-------|
| **CLAUDE.md** | `/CLAUDE.md` | Primary source of truth, project instructions |
| **Requirements** | `.claude/pipeline/requirements.md` | Gate 1 approved |
| **Codebase Map** | `.claude/pipeline/codebase-map.md` | Technology research, critical findings |
| **Implementation Plan** | `.claude/pipeline/plan.md` | Gate 2 in-review, 10 TASKs |
| **Decisions Log** | `.claude/pipeline/decisions.md` | Decision rationale |
| **Discord.js Docs** | https://discord.js.org | Thread type reference |
| **Anthropic SDK** | https://github.com/anthropics/anthropic-sdk-python | Python docs (SDK similar cross-language) |
| **Octokit Docs** | https://octokit.js.org | GitHub REST API client |

---

## Question Log (Resolved)

| # | Question | Answer | Resolved By | Date |
|---|----------|--------|-------------|------|
| 1 | Can Forum channels have private threads? | No. Only text channels support PrivateThread type. | codebase-map.md CRITICAL FINDING | 2026-03-31 |
| 2 | What is the target GitHub repository? | Configurable via GITHUB_OWNER + GITHUB_REPO env vars. Recommended because `Kazarr/BySwordandSeal` doesn't exist. | codebase-map.md + plan.md | 2026-03-31 |
| 3 | How to implement semantic similarity without embeddings API? | Prompt-based: send all issues to Claude, ask for best match. | codebase-map.md Recommendation | 2026-03-31 |
| 4 | Where to store conversation state? | In-memory Map<threadId, ConversationState>. Lost on restart (v1 limitation). | codebase-map.md + plan.md | 2026-03-31 |
| 5 | What is the recommended Discord thread approach? | Approach A: Private threads in regular text channel (full privacy, server context). | codebase-map.md Alternative Approaches | 2026-03-31 |

---

## Assumptions & Unknowns

| Item | Status | Notes |
|------|--------|-------|
| **GitHub repo will be created** | ASSUMED | User may need to create `Kazarr/BySwordandSeal` before bot goes live. Made configurable to handle delays. |
| **Discord MessageContent intent will be enabled** | ASSUMED | First-time setup step. Bot should fail gracefully if missing. |
| **Issue volume will remain <100 for v1** | ASSUMED | Prompt-based similarity works fine at this scale. v2 can add embeddings. |
| **Conversation language is Slovak** | VERIFIED | System prompt specifies Slovak communication. |
| **Node.js >= 20 available** | ASSUMED | Octokit requires >= 20. Include `.nvmrc` to pin version. |

---

## Next Steps for Implementor (Phase 4)

1. **Scaffold project** (TASK-001) — Create all config files, package.json, install dependencies
2. **Implement services** (TASK-004, 005, 006) — Can be done in parallel
3. **Implement handlers & commands** (TASK-007, 008) — Depend on services
4. **Wire entry point** (TASK-009) — Depends on all components
5. **Write tests** (TASK-010) — After all source files exist

**Test command:** `npm run test` → `vitest run`
**Linting command:** `npm run lint` → `eslint .`
**Formatting command:** `npm run format` → `prettier --write .`

---

## Review Findings (Phase 5)

### Verified Conventions (2026-03-31)

- **Confirmed:** All source files use ESM `.js` extensions in local import paths (nodenext compliance verified across all 9 source files).
- **Confirmed:** Bracket notation `process.env['KEY']` used consistently; no dot notation found in any source file.
- **Confirmed:** `dotenv/config` imported only at entry point (`src/index.ts` line 1), not in any other module.
- **Confirmed:** No hardcoded secrets in any source file. All sensitive values loaded from environment variables.
- **Confirmed:** All 5 test files use `vi.mock()` for external API mocking. No real API calls in tests.
- **Confirmed:** File naming follows kebab-case convention: `claude.service.ts`, `message.handler.ts`, `github.service.spec.ts`.

### Known Issue: Cancel Path Not Implemented

- **Location:** `src/handlers/message.handler.ts` lines 137-144
- **Issue:** When user declines summary ("nie"), bot asks "upravit alebo zrusit?" but immediately sets phase to `collecting`. The "zrusit" (cancel) option is not handled as a direct cancel command -- it will be processed by Claude chat instead.
- **Impact:** Low for v1. Claude may interpret "zrusit" contextually, but there's no guaranteed close-thread path.
- **Fix:** Add a check in `handleCollecting` for cancel keywords, or add a transitional `declining` phase.

### Codebase Map Error: Thread Close Order

- **Location:** `.claude/pipeline/codebase-map.md` lines 132-133
- **Issue:** Codebase map shows `setArchived(true)` before `setLocked(true)`. While this actually works (Discord API allows modifying `locked` on archived threads), the conventional and safer order is lock-first, archive-second.
- **Impact:** None at runtime (API accepts both orders). Noted for documentation accuracy.

---

## v2 Scope & Extensibility (Verified 2026-04-14)

Per requirements.md (Gate 1 approved), v2 adds four new commands with Agent SDK integration:
- **`/analyze`** — Code-aware analysis with Agent SDK spawning
- **`/story`** — INVEST-style user story generation (optional code context)
- **`/research`** — Investigation notes (optional code context)
- **`/workbench`** — Free-form conversation with optional artifact proposal

**Architecture Pattern:**
- v1 and v2 are **isolated workflows** — no v1 code path modified
- v2 extends (does not replace) MessageHandler state machine, types, services
- New phase values added to `ConversationPhase` enum
- New handlers added to MessageHandler switch statement
- New command files in `src/commands/` directory
- New service: `AgentService` for Claude Agent SDK spawning

**Extensibility Points Mapped:**
1. `src/types/index.ts` — Extend `ConversationPhase` enum + add optional `commandType` field
2. `src/commands/index.ts` — Register four new commands in `deployCommands()`
3. `src/index.ts` (line 38-40) — Route new commands in InteractionCreate handler
4. `src/handlers/message.handler.ts` (line 51-57 switch) — Add v2 phase cases, preserve v1
5. `src/services/claude.service.ts` — Add new artifact generation methods
6. `src/services/github.service.ts` — No changes (labels already supported)
7. `src/services/thread.service.ts` — No changes (reused as-is)

**v1 Code Paths Unaffected:**
- `/issue` command handler unchanged
- v1 phases (collecting → summarizing → confirming → done) isolated in switch cases
- v1 tests remain valid and unmodified
- v1 GitHub integration (createIssue, addComment) reused unchanged

**Test Infrastructure:**
- ESM mocking pattern (`vi.hoisted()`) REQUIRED for v2 Agent SDK mocks
- Mock Agent SDK session, tools, and responses (file read, ls, grep)
- Existing v1 test patterns sufficient for v2

**Critical Unverified Assumptions (v2 Planner to Research):**
1. **Agent SDK details** — Package name, version, Node.js/ESM compatibility, session API, tool configuration
2. **Admin permission check** — Discord.js v14 `PermissionsBitField.Flags.Administrator` API pattern
3. **Git clone strategy** — Clone location, freshness heuristic, Node.js package choice (simple-git vs isomorphic-git)
4. **Workbench artifact proposal** — Exact heuristic for triggering artifact proposal based on conversation
5. **Label management** — Race condition handling if labels don't exist (create vs pre-create vs ignore)

**Impact on v1 Implementation:**
- Phase 4 (v1 Implementor) can proceed independently
- v1 tests should pass without modification after implementation
- No env vars required for v2 (reuses v1 config)
- No new Discord intents or permissions needed for v2 (same as v1)

---

## Discovered: 2026-04-14 by Implementor (v2 Implementation)

- **Finding:** MessageHandler constructor now has optional AgentService parameter (backward compatible). Test mocking via `vi.hoisted()` pattern is CRITICAL for ESM projects to avoid module-scope mocking errors.
- **File:** src/handlers/message.handler.ts, tests/services/agent.service.spec.ts
- **Impact:** Future Agent SDK integration tests MUST use `vi.hoisted()` pattern; direct `vi.fn()` at module level will fail in ESM.

---

## Metadata

- **Project:** bss-discord-bot (Discord bot for game feedback collection)
- **Phase:** 4 (Implementor) — v2 feature implementation complete
- **Date Created:** 2026-03-31
- **Last Updated:** 2026-04-14
- **Status:** v1 conventions verified and stable. v2 features implemented (19 TASKs). Ready for Phase 5 (Reviewer).
- **Context Files:** conventions.md, architecture.md, knowledge.md (this file)
- **Pipeline Artifacts Status:** v1 + v2 artifacts in .claude/pipeline/ (requirements.md, codebase-map.md, plan.md, decisions.md, changes.md).
