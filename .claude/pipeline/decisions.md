# Decision Log

> Maintained by Pipeline Phases 1-3 (Clarifier, Scout, Planner)
> Last updated: 2026-04-14

## v2 Feature Implementation — Phase 1 (Clarifier)

### Session: 2026-04-14

#### D-v2-001: Four New Commands vs. Single Extensible Command

**Question:** Should v2 add four separate slash commands (`/analyze`, `/story`, `/research`, `/workbench`) or extend v1 `/issue` with options?

**Decision:** Four separate commands.

**Rationale:**
- Each command has distinct workflow and purpose (analysis, story generation, research, free-form)
- Separate commands provide clearer user intent + easier state machine routing
- v1 `/issue` remains untouched and deployable independently
- Admin-only gating is cleaner with separate commands (can gate v2 without affecting v1)
- Discord UX: distinct commands are more discoverable than options

---

#### D-v2-002: Command Isolation — Independent State Machine Branches

**Question:** Should v2 command states reuse or extend the v1 state machine?

**Decision:** Extend. New phases (`v2-analyzing`, `v2-story-drafting`, `v2-research-investigating`, `v2-workbench`) added to `ConversationPhase` enum. Same `MessageHandler` routes based on phase.

**Rationale:**
- Reuses proven v1 pattern (fewer lines of new code)
- v1 tests unaffected (new phases are new branches)
- Single location for all message routing logic
- Thread ID is unique; state lookup by thread ID isolates v1 and v2 conversations

---

#### D-v2-003: Agent SDK Spawning Strategy

**Question:** When should Agent SDK be spawned? Always, on-demand, or never?

**Decision:** On-demand, with command-specific defaults:
- `/analyze`: Always spawn (code analysis is the primary purpose)
- `/research`: Spawn if Claude determines code context is valuable (may be optional)
- `/story`: Spawn if Claude determines code context is valuable (may be optional)
- `/workbench`: Spawn if Claude determines code context is valuable (user-driven)

**Rationale:**
- Balances code-awareness with simplicity
- Reduces unnecessary API calls and token cost
- `/analyze` is primary code-access command; others are secondary
- Agent SDK errors on optional spawns can fall back to non-code mode (except `/analyze`)
- Future v2+ can make spawning configurable per command

---

#### D-v2-004: Codebase Clone Management — Local Copy with Pre-Session Git Pull

**Question:** How should the bot maintain access to the BSS codebase for Agent SDK?

**Decision:** Local persistent clone of `By-Sword-and-Seal-Playground`. Fresh `git pull` before each Agent SDK session.

**Rationale:**
- Simple to implement (no webhook listener needed)
- Ensures code is always fresh relative to command invocation time
- Read-only access (Agent SDK cannot write)
- No external service dependency (git is available on Linux/Mac)
- Acceptable for v1 volume (pull takes <1s typically)
- v2 can add more sophisticated caching/invalidation if needed

---

#### D-v2-005: GitHub Issue Labels — Three New Labels in Same Target Repo

**Question:** Where should v2 artifacts be stored? New repo, new labels in v1 repo, or somewhere else?

**Decision:** Same repo as v1 (`Kazarr/BySwordandSeal`, configurable via `GITHUB_OWNER`/`GITHUB_REPO`). New labels: `analysis`, `user-story`, `research`.

**Rationale:**
- Centralized issue tracking (v1 feedback + v2 artifacts in one place)
- Labels provide clear categorization without repo proliferation
- Backward compatible with v1 (can migrate existing issues if needed)
- Single environment variable config applies to both v1 and v2
- Labels can be created by bot if they don't exist (simple API call)

---

#### D-v2-006: Admin-Only Gating — All Four v2 Commands

**Question:** Who should have access to v2 commands? All users, admins only, or configurable?

**Decision:** Admins only (for v2 initial release).

**Rationale:**
- v2 features are experimental/new; reduce spam/abuse risk
- Existing v1 `/issue` remains open to all users (unchanged)
- Discord community already has admin model
- Can be loosened in v2+ if needed
- Simpler than per-user role configuration

---

#### D-v2-007: Artifact Confirmation Flow — Same as v1

**Question:** Should v2 confirmation flow match v1 (show summary → approve/decline → refine or cancel)?

**Decision:** Yes, use identical flow for all four v2 commands.

**Rationale:**
- Consistent UX for users familiar with v1
- Proven state machine pattern
- Ensures human review before artifact creation
- Reduces implementation complexity (reuse state machine)

---

#### D-v2-008: Backward Compatibility — Strict Additive Only

**Question:** Can v2 modify or refactor v1 code? What changes are acceptable?

**Decision:** Strict: v2 is additive only. No changes to v1 code paths, services, or types (except adding new methods to existing services).

**Rationale:**
- Reduces regression risk
- v1 can be deployed and tested independently of v2
- v1 tests do not require modification
- Isolates v2 bugs from v1 stability
- Allows v1 to go to production while v2 is in development

---

#### D-v2-009: Conversation Language — Slovak (Same as v1)

**Question:** What language should v2 bot responses use?

**Decision:** Slovak, following v1 system prompt pattern.

**Rationale:**
- Consistent with v1 (same Discord community)
- System prompt already specifies Slovak
- All v2 bot responses (questions, confirmations, errors) are in Slovak

---

#### D-v2-010: State Machine Design — Single MessageHandler, Multiple Phases

**Question:** Should v2 use a separate handler for each command or extend MessageHandler?

**Decision:** Extend `MessageHandler`. Add v2 phases to `ConversationPhase` enum. Same routing logic.

**Rationale:**
- Centralizes all message handling
- Reuses v1 infrastructure (service injection, error handling)
- Simpler to test (one handler, many phases)
- Less code duplication

---

#### D-v2-011: Agent SDK Tool Access — Read-Only File Operations Only

**Question:** What tools should Agent SDK have? (file read, grep, ls, git operations, etc.)

**Decision:** Read-only tools only: `ls` (file listing), `read` (file content), `grep` (search). No writes, no git operations, no modifications.

**Rationale:**
- Limits attack surface (read-only code access is safer than write access)
- Simplifies Agent SDK tool definitions
- Sufficient for analysis, story generation, and research
- No need to persist changes (codebase is external artifact)

---

#### D-v2-012: Workbench Artifact Proposal Logic — Claude Discretion with Guidance

**Question:** When should `/workbench` propose artifacts? Fixed rules or Claude judgment?

**Decision:** Claude judgment, with clear guidance in system prompt: "Propose an artifact ONLY if conversation produced concrete, actionable output (analysis, story, or research notes). Do not propose artifacts for casual discussion."

**Rationale:**
- More flexible than hardcoded heuristics (word count, keyword matching)
- Claude can assess conversation quality contextually
- Prevents spurious artifact creation from casual chats
- Can be refined in v2+ if needed (heuristics learned from usage)

---

#### D-v2-013: Error Recovery — Thread Stays Open Except on Agent Spawn Failure

**Question:** If a v2 command encounters an error, should the thread close immediately or remain open for retry?

**Decision:** Thread stays open (user can retry), except for Agent SDK spawn failures (which close thread gracefully).

**Rationale:**
- Consistent with v1 (GitHub errors don't close thread)
- Allows user recovery without re-invoking command
- Agent SDK spawn failures are fatal (no fallback for `/analyze`); close to avoid orphaned threads

---

#### D-v2-014: Dependency: Agent SDK Not Yet Integrated

**Question:** Does Agent SDK already exist in project? If not, is it a new dependency?

**Decision:** Agent SDK is new dependency. Must be added to `package.json`. All Agent SDK calls mocked in unit tests.

**Rationale:**
- v1 did not use Agent SDK (new to v2)
- Testing pattern follows v1 (all external APIs mocked)
- No integration blocker; standard NPM dependency

---

## v1 Implementation Plan Reference

From earlier pipeline runs (v1 planning phase):

| # | Task | Status | Dependencies |
|---|------|--------|--------------|
| 001 | Project Scaffolding | Ready | — |
| 002 | Config Module | Ready | 001 |
| 003 | TypeScript Types | Ready | 001 |
| 004 | GitHub Service | Ready | 002, 003 |
| 005 | Claude Service | Ready | 002, 003 |
| 006 | Thread Service | Ready | 002, 003 |
| 007 | Message Handler | Ready | 004, 005, 006 |
| 008 | /issue Command | Ready | 006, 007 |
| 009 | Entry Point + Deployment | Ready | All services |
| 010 | Unit Tests | Ready | All source files |

---

## Known Unknowns & Clarification Points

These items are within scope but will be detailed by Scout (Phase 2) and Planner (Phase 3):

1. **Agent SDK Tool Definitions** — Exact tool signatures, error handling, timeout values
2. **Artifact Proposal Heuristic (Workbench)** — Exact system prompt guidance, confidence thresholds
3. **GitHub Label Pre-Creation** — Should bot create labels at startup, or assume they exist?
4. **Codebase Clone Path** — Where should local clone be stored? (`/tmp/`, `.cache/`, absolute path?)
5. **Agent SDK Token Limits** — Max tokens per Agent SDK session? Context window management?
6. **Error Messages (v2)** — Exact Slovak phrasing for Agent SDK errors, spawn failures, fallback modes
7. **Rate Limiting v2** — Should v2 commands have per-user rate limits? (e.g., max 1 analysis per hour)

These will be addressed in Phase 3 (Planner) when detailed design is produced.

---

## v2 Feature Implementation — Phase 3 (Planner)

### Session: 2026-04-14

#### D-v2-101: Git Clone via child_process Instead of simple-git

**Decision:** Use Node.js built-in `child_process` to run `git clone` and `git pull` commands instead of external `simple-git` library.

**Rationale:**
- No new npm dependency; `git` binary is standard on Linux/Mac CI/CD environments
- Simpler error handling (shell exit codes) vs library abstractions
- Direct control over git command arguments and token-in-URL pattern
- Acceptable for v1 volume and single-clone-per-bot scenario

**Trade-off:**
- Requires fallback handling for systems without `git` binary installed (edge case for local dev on Windows without Git Bash)
- Slightly more verbose error handling vs library wrapper
- No automatic credential management (must handle token-in-URL explicitly)

---

#### D-v2-102: Clone Location: ./.cache/bss-game/

**Decision:** Store local codebase clone at `./.cache/bss-game/` (relative to bot working directory). Add `.cache/` to `.gitignore` if not already present.

**Rationale:**
- Hidden by dot-prefix (indicates internal implementation detail)
- Persists across bot restarts (data in working directory, not /tmp)
- Clearly named path indicates purpose (bss-game = By Sword and Seal game)
- Gitignored (not checked into source control)
- Single clone location (no per-session clones)

**Trade-off:**
- Disk I/O on every bot run (git pull, even if cache is fresh)
- No TTL-based freshness check (could optimize later)
- Requires disk cleanup if cache grows large (game repo ~40 MB, acceptable)

---

#### D-v2-103: Agent SDK Tool Scoping via cwd Option

**Decision:** Scope Agent SDK tools to codebase directory using `options.cwd` parameter in Agent SDK query. No parent directory access allowed.

**Rationale:**
- Verified in external facts (Agent SDK supports `cwd` option)
- Filesystem sandboxing is clean and simple
- Tools attempt to read/list files outside `cwd` will error (Agent SDK behavior)
- No need for custom path validation layer

**Assumption:**
- Agent SDK tool errors when accessing parent directories are user-friendly or can be caught and wrapped
- If error messages are verbose, Implementor can sanitize in exception handler

---

#### D-v2-104: Artifact Proposal Logic: Claude Heuristic with System Prompt Guidance

**Decision:** At end of `/workbench` conversation, call `claudeService.proposeArtifacts(conversationHistory)` which asks Claude: "Review this conversation. Should we create one or more artifacts (analysis, user-story, research)? Respond with: PROPOSE: {type}|{title} or NO_ARTIFACT."

**Rationale:**
- Leverages Claude's semantic understanding of conversation content
- No hand-rolled heuristics (word count, keyword matching)
- Flexible — can be tuned via system prompt in future
- Handles edge cases well (long conversations, short conversations, off-topic)

**Assumption:**
- Claude's judgment is reliable enough for artifact proposals
- Parsing response is straightforward (PROPOSE: type|title or NO_ARTIFACT)
- If parsing fails, default to NO_ARTIFACT (safe fallback)

**Trade-off:**
- Adds one API call to workbench flow (token cost)
- Proposal quality depends on system prompt (must be tested)

---

#### D-v2-105: ConversationPhase Type Extension with Five v2 Phases

**Decision:** Extend `ConversationPhase` union type to include:
- `'v2-analyzing'` — `/analyze` conversation phase
- `'v2-story-drafting'` — `/story` conversation phase
- `'v2-research-investigating'` — `/research` conversation phase
- `'v2-workbench'` — `/workbench` free-form conversation phase
- `'v2-proposing-artifacts'` — `/workbench` artifact proposal phase

**Rationale:**
- Follows v1 naming pattern (strings, union type)
- Clear isolation: v1 phases vs v2 phases (distinct prefixes)
- Single source of truth (type system prevents typos)
- Scalable (easy to add more v2 phases in future)

**Trade-off:**
- Union type becomes long (8 members total); could switch to enum if grows beyond 10
- Phase names are verbose; shorter names would be ambiguous

---

#### D-v2-106: Optional commandType Field in ConversationState

**Decision:** Add optional field `commandType?: 'issue' | 'analyze' | 'story' | 'research' | 'workbench'` to `ConversationState` interface.

**Rationale:**
- Enables message handler to route v2 messages to correct handler (distinguishes v1 from v2)
- Optional field is backward compatible (v1 state entries lack this field)
- Clear routing: check both `phase` and `commandType` in message handler switch

**Alternative considered:**
- Infer command type from phase alone (e.g., `'v2-analyzing'` implies `'analyze'`)
- Trade-off: less explicit; makes phase enum carry semantic weight

**Chosen approach:**
- Explicit `commandType` is clearer in message handler logic
- Phase names need not encode command type

---

#### D-v2-107: Admin Permission Check via PermissionsBitField.Flags.Administrator

**Decision:** Implement admin check in utility function `checkAdminPermission(interaction)` that validates `(interaction.member?.permissions as PermissionsBitField).has(PermissionsBitField.Flags.Administrator)`.

**Rationale:**
- Verified pattern from discord.js v14 documentation and external facts
- Centralized utility (DRY across all four v2 commands)
- Consistent permission check for all v2 commands

**Error response:**
- Non-admin user: ephemeral reply "Príkaz je dostupný iba administrátorom." (Command is available to admins only.)
- Prevents accidental or intentional abuse of experimental v2 features

---

#### D-v2-108: Extending MessageHandler.confirming Phase Handler for v2 Labels

**Decision:** Modify existing `handleConfirming()` to check `state.commandType` and pass appropriate labels to `githubService.createIssue()`:
- `commandType === 'analyze'` → labels: `['analysis']`
- `commandType === 'story'` → labels: `['user-story']`
- `commandType === 'research'` → labels: `['research']`
- `commandType === 'workbench'` → labels: multiple based on artifact proposals
- `commandType === 'issue'` (or undefined) → labels: none (v1 default)

**Rationale:**
- Single confirming handler for all v2 commands (code reuse)
- Labels are the only difference between v1 and v2 issue creation
- Optional `commandType` makes change backward compatible

**Implementation detail:**
- Update `createOrAttachIssue()` signature to accept optional `labels: string[]` parameter
- Pass labels to `createIssue({ title, body, labels })`

---

#### D-v2-109: Agent SDK Tools: Read, Glob, Grep (No Write Operations)

**Decision:** Agent SDK will have three read-only tools: `Read`, `Glob`, `Grep`. No write operations, no git commands.

**Rationale:**
- Read-only limits attack surface (no code modification risk)
- Sufficient for analysis, story, and research use cases
- Prevents accidental changes to codebase
- Simplifies tool definitions (no transaction handling, rollback, etc.)

**Trade-off:**
- Cannot use Agent SDK for code generation or modification (future v3 feature)
- Agent SDK cannot auto-fix or propose patches

---

#### D-v2-110: Workbench Max Conversation Turns: None (Rely on Auto-Archive)

**Decision:** No explicit max turn limit for `/workbench` conversations. Rely on Discord's 60-minute auto-archive to prevent unbounded conversations.

**Rationale:**
- Simpler implementation
- Discord's auto-archive is natural boundary (threads archived are read-only)
- Users can see remaining archive time and anticipate timeout
- Can be refined in v2+ if needed (add turn limit, time limit)

**Trade-off:**
- Conversations near 60-min boundary may be cut off abruptly
- No explicit "conversation ending" signal before auto-archive
- Memory/token cost risk if conversation is very long (high-volume use unlikely)

**Future improvement:**
- Add explicit limit: max 20 turns or 30 min, whichever first
- Send warning at 50-min mark: "Thread will archive soon. Finalize and propose artifacts?"

---

#### D-v2-111: Test Mocking: vi.hoisted() Pattern per Lesson #14

**Decision:** All Agent SDK mocks in tests MUST use `vi.hoisted()` pattern to comply with ESM hoisting rules (Lesson #14 from conventions.md).

**Example pattern:**
```typescript
const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn().mockResolvedValue('analysis output'),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  query: mockQuery,
}));

import { AgentService } from '../../src/services/agent.service.js';
```

**Rationale:**
- ESM hoisting rules prevent module-scope `vi.fn()` without `vi.hoisted()` lift
- Ensures mocks are available before service imports
- Standard pattern for Vitest + ESM projects

---

#### D-v2-112: v2 Tests Include Unit + Basic Integration Tests

**Decision:** Implement comprehensive unit tests for all v2 components (services, handlers, commands). Include integration-style tests for key flows (e.g., `/analyze` end-to-end with mocked Agent SDK). No real API tests.

**Rationale:**
- Unit tests verify individual components (admin check, phase handlers, artifact generation)
- Integration tests verify multi-component flows (command → handler → message handler → artifact → GitHub)
- All external services mocked (no real Discord, Claude, GitHub, or Agent SDK)
- Follows v1 testing pattern (all mocked)

**Coverage targets:**
- Admin permission: pass/fail for admin and non-admin
- Command handlers: thread creation, state init, welcome message
- Phase handlers: message routing, service calls, phase transitions
- Artifact generation: content quality, label assignment
- Error handling: Agent SDK spawn failure, GitHub API errors

---

#### D-v2-113: v1 Tests Remain Unmodified

**Decision:** All v1 unit tests (`tests/config.spec.ts`, `tests/services/*.spec.ts`, `tests/handlers/message.handler.spec.ts`) remain unchanged. v2 tests are in new files.

**Rationale:**
- v1 code paths unchanged (no modifications to v1 source)
- v1 tests verify v1 behavior end-to-end
- v2 tests verify v2 behavior in isolation
- Clear separation of concerns

**Verification:**
- `npm run test` runs all tests (v1 + v2)
- v1 tests must pass without modification
- v2 tests are new and must pass

---

#### D-v2-114: Package.json: Agent SDK Already in @anthropic-ai/sdk

**Decision:** Agent SDK is part of `@anthropic-ai/sdk` (same package as Messages API). No new npm dependency; assume `@anthropic-ai/sdk` v0.80.0+ is already installed.

**Rationale:**
- Verified in external facts (Agent SDK import: `import { query } from "@anthropic-ai/sdk";`)
- Reduces dependency bloat (not a separate package)
- Token usage is unified (same API key, single session management)

**Note:**
- v1 already requires `@anthropic-ai/sdk` for Claude API
- v2 adds Agent SDK import alongside existing SDK usage

---

#### D-v2-115: No New Environment Variables

**Decision:** v2 reuses all v1 environment variables. No new env vars required.

**Variables reused:**
- DISCORD_TOKEN, DISCORD_GUILD_ID, DISCORD_CHANNEL_ID
- ANTHROPIC_API_KEY (shared by Messages API and Agent SDK)
- GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO
- CLAUDE_MODEL, SIMILARITY_THRESHOLD

**Rationale:**
- Simpler deployment (fewer config changes)
- Agent SDK uses same `ANTHROPIC_API_KEY` as Messages API
- GitHub labels configurable but have sensible defaults
- All v2 features are opt-in (no mandatory new config)

---

#### D-v2-116: GitHub Label Management: Create if Missing

**Decision:** When v2 creates an issue with labels (`analysis`, `user-story`, `research`), check if labels exist. If missing, create them with default properties (e.g., color, description).

**Rationale:**
- Removes manual setup step (labels don't need to pre-exist)
- Gracefully handles label race conditions (if label created between check and create, catch 422)
- Labels are cheap to create (simple GitHub API call)

**Alternative (not chosen):**
- Assume labels pre-exist in target repo (requires repo admin setup)
- Trade-off: simpler code, but adds manual deployment step

#### D-v2-117: Correct Agent SDK Package Name — @anthropic-ai/claude-agent-sdk (Not Part of @anthropic-ai/sdk)

**Question:** Which SDK package provides Agent SDK? Is it part of the main Anthropic SDK (`@anthropic-ai/sdk`), or a separate package?

**Decision:** Agent SDK is a separate package: `@anthropic-ai/claude-agent-sdk` (NOT part of `@anthropic-ai/sdk`).

**Rationale:**
- Verified from official Agent SDK documentation (code.claude.com/docs/en/agent-sdk/typescript)
- `@anthropic-ai/sdk` provides the Messages API (used for v1 Claude calls)
- `@anthropic-ai/claude-agent-sdk` provides the Agent SDK (for agentic code retrieval in v2)
- These are distinct packages serving different purposes

**Impact:**
- New dependency must be added in TASK-000: `npm install @anthropic-ai/claude-agent-sdk`
- Import: `import { query } from "@anthropic-ai/claude-agent-sdk";` (separate from `@anthropic-ai/sdk` imports)
- All Agent SDK mocks in tests use `vi.mock('@anthropic-ai/claude-agent-sdk', ...)` (not `@anthropic-ai/sdk`)
- Corrects plan.md sections: Critical External Facts (line 36), What Does NOT Change (line 528), Testing Strategy (line 560)

**Status:** VERIFIED — Plan corrected and finalized

---

## Metadata

- **Phase:** 1 — Clarifier
- **Date:** 2026-04-14
- **Clarifications source:** User system message (v2 scope briefing)
- **Status:** COMPLETED — All mandatory requirement areas covered
- **Next phase:** 2 — Scout (codebase exploration, technology verification)

---

## Planner Phase Additions (Phase 3)

- **Date:** 2026-04-14
- **Phase:** 3 — Planner
- **Status:** COMPLETED AND CORRECTED — Detailed implementation plan with 19 TASKs (TASK-000 through TASK-018) written to `.claude/pipeline/plan.md`
  - TASK-000: Install @anthropic-ai/claude-agent-sdk dependency (newly added after correction)
  - TASK-001 through TASK-018: Original v2 implementation tasks
- **Decisions added:** D-v2-101 through D-v2-117 (17 new planning decisions, including Agent SDK package correction)
- **Plan approval:** Awaits Gate 2 (orchestrator approval)
- **Next phase:** 4 — Implementor (TASK execution based on approved plan)

