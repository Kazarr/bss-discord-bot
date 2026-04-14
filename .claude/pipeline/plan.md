---
phase: planner
status: ready_for_approval
created: 2026-04-14
task_count: 19
estimated_files: 19
risk_level: medium
---

# Implementation Plan: v2 Feature — Four Code-Aware Analysis Commands

## Overview

This plan adds four new v2 slash commands (`/analyze`, `/story`, `/research`, `/workbench`) to the bss-discord-bot, enabling code-aware analysis and structured artifact generation via Claude Agent SDK. v1 (`/issue`) remains fully isolated and unchanged.

**Key approach:** Extend existing patterns (thread creation, message handler routing, Claude service calls) with minimal impact to v1 code. All v2 code is isolated to new files and new state machine branches. v1 unit tests remain unaffected.

---

## Chosen Approach

**Description:** Additive implementation following established v1 patterns. Four new command handlers create private threads and initialize v2-specific conversation states. A new `AgentService` spawns Agent SDK sessions for code analysis when needed. Extend `ClaudeService` with methods for artifact generation (analysis, story, research proposals). Extend `MessageHandler` state machine with v2 phase handlers and routing logic. All v1 code paths preserved exactly.

**Rationale:**
- **Isolation:** New code in new files; v1 remains untouched
- **Reuse:** Leverages proven ThreadService, existing Discord integration, familiar state machine pattern
- **Safety:** v2 features are admin-gated; low risk of impact on open `/issue` feedback channel
- **Extensibility:** Agent SDK integration sets foundation for future code-aware features

---

## Critical External Facts — Verified

Per task briefing, these are confirmed facts (do NOT re-verify):

1. **Agent SDK Package:** `@anthropic-ai/claude-agent-sdk` (separate from main Anthropic SDK, ESM-compatible)
   - Import: `import { query } from "@anthropic-ai/claude-agent-sdk";`
   - Usage: `query({ prompt, options: { cwd, allowedTools, ... } })`
   - Tools: `Read`, `Glob`, `Grep` (read-only sandbox)
   - **Note:** This is a new dependency, distinct from `@anthropic-ai/sdk` (which is used for Messages API)

2. **Admin Permission Check (discord.js v14):**
   ```typescript
   import { PermissionsBitField } from 'discord.js';
   if (!(member?.permissions as PermissionsBitField).has(PermissionsBitField.Flags.Administrator)) {
     await interaction.reply({ content: '...', ephemeral: true });
     return;
   }
   ```

3. **Git Clone Strategy:**
   - Location: `./.cache/bss-game/` (gitignored, persists across restarts)
   - Library: Node's `child_process` (no extra dependency)
   - Strategy: Single clone, git pull on each command
   - Auth: Token-in-URL pattern: `https://x-access-token:${GITHUB_TOKEN}@github.com/Kazarr/By-Sword-and-Seal-Playground.git`

---

## Approach Comparison

No alternatives are presented because:

- **v2 isolation from v1 is mandatory** per requirements (separate workflows, no interference)
- **Admin-gating is specified** (not optional)
- **Agent SDK integration is required** for code-aware analysis
- **Thread creation pattern is proven** in v1 (no reason to deviate)

This is a straightforward additive feature with a single, correct approach.

---

## Detailed Implementation Plan: 19 TASKS (TASK-000 through TASK-018)

### TASK-000: Add @anthropic-ai/claude-agent-sdk dependency

- **Files:** `package.json`, `package-lock.json`
- **Depends on:** none
- **Change:** Install new npm package `@anthropic-ai/claude-agent-sdk` by running `npm install @anthropic-ai/claude-agent-sdk`. Add entry to `package.json` under `dependencies`. Update `package-lock.json` with resolved version and integrity hashes.

- **Pattern reference:** `package.json` (any existing dependency entry) — follow standard npm dependency format
- **Acceptance:** `@anthropic-ai/claude-agent-sdk` appears in `package.json` `dependencies` section with a specific version (e.g., `"^0.1.0"` or similar). Package-lock.json updated with lock entry. Import statement `import { query } from "@anthropic-ai/claude-agent-sdk";` works without errors.
- **Verify:** `npm list @anthropic-ai/claude-agent-sdk` shows installed version; `grep "@anthropic-ai/claude-agent-sdk" package.json` confirms presence
- **Estimated lines:** ~3 added to package.json
- **Risk:** None (dependency installation is standard npm workflow)

### TASK-001: Extend ConversationPhase type with v2 phases

- **Files:** `src/types/index.ts`
- **Depends on:** TASK-000
- **Change:** Add new union members to `ConversationPhase` type:
  - `'v2-analyzing'` — `/analyze` conversation phase
  - `'v2-story-drafting'` — `/story` conversation phase
  - `'v2-research-investigating'` — `/research` conversation phase
  - `'v2-workbench'` — `/workbench` free-form conversation phase
  - `'v2-proposing-artifacts'` — `/workbench` artifact proposal phase
  - Update type to: `ConversationPhase = 'collecting' | 'summarizing' | 'confirming' | 'done' | 'v2-analyzing' | 'v2-story-drafting' | 'v2-research-investigating' | 'v2-workbench' | 'v2-proposing-artifacts'`

- **Pattern reference:** `src/types/index.ts` (lines 19-23) — follow existing union type pattern
- **Acceptance:** TypeScript compiles, new phases available for v2 handlers
- **Verify:** `npm run build`
- **Estimated lines:** ~8 modified
- **Risk:** Low

### TASK-002: Add optional commandType field to ConversationState

- **Files:** `src/types/index.ts`
- **Depends on:** TASK-001
- **Change:** Add optional field `commandType?: 'issue' | 'analyze' | 'story' | 'research' | 'workbench'` to `ConversationState` interface. This enables the message handler to route messages to the correct v2 handler based on command type (not just phase).

- **Pattern reference:** `src/types/index.ts` (lines 30-36) — follow existing interface extension pattern
- **Acceptance:** Field is optional (backward compatible with v1 state init without this field)
- **Verify:** `npm run build`
- **Estimated lines:** ~2 modified
- **Risk:** Low (additive, optional)

### TASK-003: Add ArtifactProposal type for workbench artifact proposals

- **Files:** `src/types/index.ts`
- **Depends on:** TASK-001
- **Change:** Add new interface:
  ```typescript
  interface ArtifactProposal {
    type: 'analysis' | 'user-story' | 'research';
    title: string;
    content: string;
  }
  ```
  Export from module.

- **Pattern reference:** Follow existing interface pattern in same file (e.g., `IssueData` interface lines 38-42)
- **Acceptance:** Type available for workbench artifact logic
- **Verify:** `npm run build`
- **Estimated lines:** ~6 added
- **Risk:** Low

### TASK-004: Extend ClaudeService with artifact generation methods

- **Files:** `src/services/claude.service.ts`
- **Depends on:** TASK-001, TASK-003
- **Change:** Add four new public methods to `ClaudeService` class:
  1. `async generateCodeAnalysis(analysisPrompt: string, codeContext: string): Promise<string>` — accepts user's analysis request + code snippet context, returns formatted analysis document
  2. `async generateUserStory(requirements: string, codeContext?: string): Promise<string>` — accepts story requirements + optional code context, returns INVEST-compliant user story
  3. `async generateResearch(question: string, codeContext?: string): Promise<string>` — accepts research question + optional code context, returns research/investigation notes
  4. `async proposeArtifacts(conversationHistory: ConversationMessage[]): Promise<ArtifactProposal[]>` — analyzes workbench conversation, returns zero or more artifact proposals (type, title, content)

  Each method uses existing `messages.create()` API with new system prompts specific to the artifact type. Max tokens: 2048 (increased from 1024 for longer artifact content).

- **Pattern reference:** `src/services/claude.service.ts` (lines 30-60) — follow existing method structure, try/catch error handling, and system prompt pattern
- **Acceptance:** All four methods are callable, return expected types
- **Verify:** `npm run test -- services/claude.service.spec.ts`
- **Estimated lines:** ~150 added
- **Risk:** Medium (new methods, but follow established Claude API pattern)

### TASK-005: Create AdminGuard utility

- **Files:** `src/services/admin.guard.ts` (NEW)
- **Depends on:** none
- **Change:** New utility file exporting a single async function:
  ```typescript
  export async function checkAdminPermission(interaction: ChatInputCommandInteraction): Promise<boolean>
  ```
  Validates `interaction.member?.permissions` has `Administrator` flag using `PermissionsBitField.Flags.Administrator`. Returns boolean.

- **Pattern reference:** No existing guard pattern in v1. Reference discord.js v14 PermissionsBitField API directly. Create simple, testable utility function.
- **Acceptance:** Function correctly identifies admin users, returns false for non-admins
- **Verify:** Manual test — call with mock admin and non-admin interactions
- **Estimated lines:** ~15 added
- **Risk:** Low (simple utility, fully isolated)

### TASK-006: Create AgentService for Agent SDK integration

- **Files:** `src/services/agent.service.ts` (NEW)
- **Depends on:** TASK-001
- **Change:** New service class `AgentService` with public methods:
  1. `constructor(options?: AgentOptions)` — stores git repo path (default `./.cache/bss-game/`)
  2. `async ensureRepoInitialized(): Promise<void>` — clones or pulls latest code from `By-Sword-and-Seal-Playground` repo
  3. `async analyzeCode(prompt: string, options?: AgentOptions): Promise<string>` — spawns Agent SDK session with file/grep tools scoped to repo directory, returns analysis result
  4. `private async spawnSession(userPrompt: string, cwd: string): Promise<string>` — internal method to spawn query, handle tools, collect result

  Uses Node.js `child_process.exec()` or similar for git operations (simple, no extra dependency). Agent SDK tools limited to `Read`, `Glob`, `Grep`. No write operations.

- **Pattern reference:** Create new service class following `ClaudeService` pattern (constructor injection, public async methods, error handling, logging)
- **Acceptance:** Service initializes, clones/pulls repo, spawns agent session, collects output
- **Verify:** Unit test with mocked SDK (via `vi.hoisted()` pattern per Lesson #14)
- **Estimated lines:** ~120 added
- **Risk:** Medium (Agent SDK integration, external process spawning, new error modes)

### TASK-007: Create `/analyze` command handler

- **Files:** `src/commands/analyze.ts` (NEW)
- **Depends on:** TASK-005
- **Change:** New command handler file exporting:
  - `analyzeCommand` — `SlashCommandBuilder` with name 'analyze', description 'Code-aware analysis of the BSS game codebase'
  - `handleAnalyzeCommand(interaction, threadService, messageHandler, agentService)` — async function that:
    1. Checks admin permissions via `checkAdminPermission(interaction)`; if not admin, reply ephemeral "Admin only." and return
    2. Validates channel is correct (same as v1: `DISCORD_CHANNEL_ID`)
    3. Creates private thread via `threadService.createPrivateThread()` (naming: `Issue: {username} - {YYYY-MM-DD}`)
    4. Initializes conversation state with phase `'v2-analyzing'`, commandType `'analyze'`
    5. Sends welcome message in Slovak: "Čo by si chcel analyzovať?" (What would you like to analyze?)
    6. Replies to interaction ephemeral: "Vytvoril som ti privátne vlákno." (I created a private thread.)

- **Pattern reference:** `src/commands/issue.ts` (lines 35-60) — follow exact same structure: validation, thread creation, state init, messaging
- **Acceptance:** Command is callable, creates thread, initializes state correctly
- **Verify:** Unit test (mocked services)
- **Estimated lines:** ~70 added
- **Risk:** Low (follows proven v1 pattern)

### TASK-008: Create `/story` command handler

- **Files:** `src/commands/story.ts` (NEW)
- **Depends on:** TASK-005
- **Change:** New command handler following same pattern as TASK-007:
  - `storyCommand` — SlashCommandBuilder for 'story' command
  - `handleStoryCommand(...)` — admin-gated, creates thread, initializes phase `'v2-story-drafting'`, commandType `'story'`
  - Welcome message: "Aký user story by si chcel vytvoriť?" (What user story would you like to produce?)

- **Pattern reference:** `src/commands/analyze.ts` (from TASK-007) and `src/commands/issue.ts`
- **Acceptance:** Same as TASK-007
- **Verify:** Unit test (mocked services)
- **Estimated lines:** ~70 added
- **Risk:** Low

### TASK-009: Create `/research` command handler

- **Files:** `src/commands/research.ts` (NEW)
- **Depends on:** TASK-005
- **Change:** New command handler following same pattern:
  - `researchCommand` — SlashCommandBuilder for 'research' command
  - `handleResearchCommand(...)` — admin-gated, creates thread, initializes phase `'v2-research-investigating'`, commandType `'research'`
  - Welcome message: "Čo by si chcel skúmať?" (What would you like to research?)

- **Pattern reference:** TASK-007 and TASK-008
- **Acceptance:** Same as TASK-007
- **Verify:** Unit test
- **Estimated lines:** ~70 added
- **Risk:** Low

### TASK-010: Create `/workbench` command handler

- **Files:** `src/commands/workbench.ts` (NEW)
- **Depends on:** TASK-005
- **Change:** New command handler following same pattern:
  - `workbenchCommand` — SlashCommandBuilder for 'workbench' command
  - `handleWorkbenchCommand(...)` — admin-gated, creates thread, initializes phase `'v2-workbench'`, commandType `'workbench'`
  - Welcome message: "Ahoj! Tu môžeme spolu diskutovať. Čím ti môžem pomôcť?" (Hi! Let's discuss. How can I help?)

- **Pattern reference:** TASK-007, TASK-008, TASK-009
- **Acceptance:** Same as TASK-007
- **Verify:** Unit test
- **Estimated lines:** ~70 added
- **Risk:** Low

### TASK-011: Register four new commands in deployCommands()

- **Files:** `src/commands/index.ts`
- **Depends on:** TASK-007, TASK-008, TASK-009, TASK-010
- **Change:** Import four new command builders from v2 command files. Add to `commands` array before `rest.put()`:
  ```typescript
  const commands = [
    issueCommand.toJSON(),
    analyzeCommand.toJSON(),
    storyCommand.toJSON(),
    researchCommand.toJSON(),
    workbenchCommand.toJSON(),
  ];
  ```

- **Pattern reference:** `src/commands/index.ts` (lines 16-25) — follow existing array pattern
- **Acceptance:** All five commands registered (v1 + v2)
- **Verify:** `npm run build`
- **Estimated lines:** ~5 modified
- **Risk:** Low

### TASK-012: Wire v2 command handlers in entry point

- **Files:** `src/index.ts`
- **Depends on:** TASK-007, TASK-008, TASK-009, TASK-010, TASK-011
- **Change:** Import four new command handlers. Add conditional branches in InteractionCreate event (after line 40):
  ```typescript
  } else if (interaction.commandName === 'analyze') {
    await handleAnalyzeCommand(interaction, threadService, messageHandler, agentService);
  } else if (interaction.commandName === 'story') {
    await handleStoryCommand(interaction, threadService, messageHandler, agentService);
  } else if (interaction.commandName === 'research') {
    await handleResearchCommand(interaction, threadService, messageHandler, agentService);
  } else if (interaction.commandName === 'workbench') {
    await handleWorkbenchCommand(interaction, threadService, messageHandler, agentService);
  }
  ```
  Instantiate `AgentService` near top (line 21, after other services).

- **Pattern reference:** `src/index.ts` (lines 33-41) — follow existing if/else structure
- **Acceptance:** All four v2 commands routed correctly to handlers
- **Verify:** `npm run build`
- **Estimated lines:** ~10 modified, ~1 new service instance
- **Risk:** Low

### TASK-013: Extend MessageHandler with v2-analyzing phase handler

- **Files:** `src/handlers/message.handler.ts`
- **Depends on:** TASK-001, TASK-004, TASK-006
- **Change:** Add new private method `handleV2Analyzing(...)` that:
  1. On first user message: spawn Agent SDK via `agentService.analyzeCode(userMessage)` (await codebase initialization)
  2. Pass code analysis result + user message to `claudeService.generateCodeAnalysis(...)`
  3. Transition to `'confirming'` phase (reuse confirming logic)
  4. Show summary in thread: "Tu je analýza:\n\n{analysis}\n\nChceš vytvoriť GitHub issue? Odpovedz **áno** alebo **nie**."

  Update switch statement (line 51-57) to add case `'v2-analyzing'` → call `handleV2Analyzing()`.

- **Pattern reference:** `src/handlers/message.handler.ts` (lines 77-113, `handleCollecting` method) — follow try/catch, message.content parsing, claude service call pattern
- **Acceptance:** Phase handler processes messages, calls agent + claude, transitions phase
- **Verify:** Unit test with mocked AgentService and ClaudeService
- **Estimated lines:** ~50 added, ~3 modified (switch statement)
- **Risk:** Medium (Agent SDK integration in hot path, error handling)

### TASK-014: Extend MessageHandler with v2-story-drafting phase handler

- **Files:** `src/handlers/message.handler.ts`
- **Depends on:** TASK-001, TASK-004
- **Change:** Add new private method `handleV2StoryDrafting(...)` that:
  1. On each user message: call `claudeService.generateUserStory(userMessage, optionalCodeContext?)`
  2. Accumulate messages (same as collecting)
  3. When user provides summary or Claude signals ready (via `[READY_TO_STORY]` marker), generate final story
  4. Transition to `'confirming'` phase and show story
  5. Reuse confirming logic (artifact type = 'user-story')

  Update switch statement to add case `'v2-story-drafting'` → call `handleV2StoryDrafting()`.

- **Pattern reference:** `src/handlers/message.handler.ts` (lines 77-113)
- **Acceptance:** Story drafted and confirmed
- **Verify:** Unit test
- **Estimated lines:** ~40 added, ~3 modified
- **Risk:** Medium

### TASK-015: Extend MessageHandler with v2-research-investigating phase handler

- **Files:** `src/handlers/message.handler.ts`
- **Depends on:** TASK-001, TASK-004
- **Change:** Add new private method `handleV2ResearchInvestigating(...)` following same pattern as TASK-014:
  1. Accumulate user messages
  2. Call `claudeService.generateResearch(messages, optionalCodeContext?)`
  3. When ready, show research notes and transition to `'confirming'`
  4. Reuse confirming (artifact type = 'research')

  Update switch statement to add case `'v2-research-investigating'`.

- **Pattern reference:** TASK-014, `src/handlers/message.handler.ts` (lines 77-113)
- **Acceptance:** Research notes drafted
- **Verify:** Unit test
- **Estimated lines:** ~40 added, ~3 modified
- **Risk:** Medium

### TASK-016: Extend MessageHandler with v2-workbench phase handler

- **Files:** `src/handlers/message.handler.ts`
- **Depends on:** TASK-001, TASK-003, TASK-004
- **Change:** Add two new private methods:
  1. `handleV2Workbench(...)` — free-form conversation:
     - Accumulate user messages
     - Call `claudeService.chat(...)` (same as v1 collecting, but with workbench system prompt)
     - When user indicates end (e.g., "done" or after N turns) OR Claude signals `[END_CONVERSATION]`, transition to `'v2-proposing-artifacts'`

  2. `handleV2ProposingArtifacts(...)` — artifact proposal:
     - Call `claudeService.proposeArtifacts(state.messages)` → returns `ArtifactProposal[]`
     - If proposals exist: show "Tu som našiel tieto artefakty:" + list + "Chceš ich vytvoriť? **áno** / **nie**"
     - If no proposals: show "Žiadne artefakty na vytvorenie. Vlákno bude zatvorené." → transition to `'done'`, close thread
     - On confirmation: transition to `'confirming'` with artifact metadata stored

  Update switch statement to add cases `'v2-workbench'` and `'v2-proposing-artifacts'`.

- **Pattern reference:** TASK-014, TASK-015, `src/handlers/message.handler.ts`
- **Acceptance:** Free-form conversation flows, artifact proposals generated
- **Verify:** Unit test
- **Estimated lines:** ~80 added, ~6 modified
- **Risk:** High (complex state transitions, artifact proposal logic, multiple branches)

### TASK-017: Extend confirming handler to support v2 artifact types

- **Files:** `src/handlers/message.handler.ts`
- **Depends on:** TASK-001, TASK-003, TASK-016
- **Change:** Modify `handleConfirming()` method (lines 130-153) to:
  1. Check `state.commandType` to determine artifact type
  2. If `commandType === 'analyze'` → create issue with label `'analysis'`
  3. If `commandType === 'story'` → create issue with label `'user-story'`
  4. If `commandType === 'research'` → create issue with label `'research'`
  5. If `commandType === 'workbench'` → create one issue per artifact proposal with appropriate labels
  6. Reuse existing `createOrAttachIssue()` logic, pass `labels` param to `githubService.createIssue()`

  Update `createOrAttachIssue()` signature to accept optional `labels: string[]` parameter and pass to `githubService.createIssue({ title, body, labels })`.

- **Pattern reference:** `src/handlers/message.handler.ts` (lines 130-200)
- **Acceptance:** Issues created with correct labels (v1 no label, v2 with label)
- **Verify:** Unit test covering all label types
- **Estimated lines:** ~20 modified, ~15 added
- **Risk:** Medium (changes existing confirming logic, but backward compatible for v1)

### TASK-018: Create comprehensive tests for v2 features

- **Files:** `tests/commands/analyze.spec.ts`, `tests/commands/story.spec.ts`, `tests/commands/research.spec.ts`, `tests/commands/workbench.spec.ts`, `tests/services/agent.service.spec.ts`, `tests/handlers/message.handler.v2.spec.ts` (NEW)
- **Depends on:** TASK-001 through TASK-017
- **Change:** Create test files:
  1. **v2 command tests** (analyze, story, research, workbench):
     - Admin permission check (pass for admin, fail for non-admin)
     - Channel validation
     - Thread creation and state initialization
     - Welcome message delivery

  2. **AgentService tests**:
     - Repository initialization (clone/pull)
     - Code analysis spawn (mocked via `vi.hoisted()` pattern per Lesson #14)
     - Tool scoping validation
     - Error handling (repo unavailable, spawn failure)

  3. **MessageHandler v2 tests**:
     - v2-analyzing phase: message → agent spawn → claude artifact generation → confirming
     - v2-story-drafting phase: messages → story generation → confirming
     - v2-research-investigating phase: messages → research generation → confirming
     - v2-workbench phase: multi-turn → artifact proposal → confirming or no-artifact → done
     - Confirming handler with v2 labels (analysis, user-story, research)
     - Edge cases: agent spawn failure, no artifacts proposed, user declines

  Use `vi.hoisted()` mocking pattern for Agent SDK (per Lesson #14). Mock ClaudeService, AgentService, ThreadService, GitHubService. No real API calls.

- **Pattern reference:** `tests/handlers/message.handler.spec.ts` (v1 pattern), `tests/services/` structure, Lesson #14 `vi.hoisted()` pattern from conventions.md
- **Acceptance:** All new tests pass, v1 tests remain passing
- **Verify:** `npm run test`
- **Estimated lines:** ~600 added (6 new spec files)
- **Risk:** Low (testing new code, mocked dependencies)

---

## File Summary

| # | File | Task | Change | Est. Lines | Risk |
|---|------|------|--------|------------|------|
| 0 | package.json | TASK-000 | Add @anthropic-ai/claude-agent-sdk | ~3 added | None |
| 1 | src/types/index.ts | TASK-001 | Add v2 ConversationPhase values | ~8 modified | Low |
| 2 | src/types/index.ts | TASK-002 | Add commandType field | ~2 modified | Low |
| 3 | src/types/index.ts | TASK-003 | Add ArtifactProposal interface | ~6 added | Low |
| 4 | src/services/claude.service.ts | TASK-004 | Add 4 artifact methods | ~150 added | Medium |
| 5 | src/services/admin.guard.ts | TASK-005 | New admin guard utility | ~15 added | Low |
| 6 | src/services/agent.service.ts | TASK-006 | New Agent SDK integration | ~120 added | Medium |
| 7 | src/commands/analyze.ts | TASK-007 | New /analyze command | ~70 added | Low |
| 8 | src/commands/story.ts | TASK-008 | New /story command | ~70 added | Low |
| 9 | src/commands/research.ts | TASK-009 | New /research command | ~70 added | Low |
| 10 | src/commands/workbench.ts | TASK-010 | New /workbench command | ~70 added | Low |
| 11 | src/commands/index.ts | TASK-011 | Register v2 commands | ~5 modified | Low |
| 12 | src/index.ts | TASK-012 | Wire v2 handlers | ~10 modified + 1 service | Low |
| 13 | src/handlers/message.handler.ts | TASK-013 | v2-analyzing handler | ~50 added, ~3 modified | Medium |
| 14 | src/handlers/message.handler.ts | TASK-014 | v2-story-drafting handler | ~40 added, ~3 modified | Medium |
| 15 | src/handlers/message.handler.ts | TASK-015 | v2-research-investigating handler | ~40 added, ~3 modified | Medium |
| 16 | src/handlers/message.handler.ts | TASK-016 | v2-workbench + proposing handlers | ~80 added, ~6 modified | High |
| 17 | src/handlers/message.handler.ts | TASK-017 | Extend confirming for v2 labels | ~20 modified, ~15 added | Medium |
| 18 | tests/*.spec.ts | TASK-018 | v2 tests + AgentService tests | ~600 added | Low |

**Total:** ~1,300 lines added / ~100 lines modified across 7 source files (including package.json) and 6 new test files.

---

## Implementation Order

**Rationale:** Dependencies first (Agent SDK package), then types (enable other code to reference them), then services (core logic), then commands and handlers (use services), then tests (verify behavior). Agent integration (AgentService) comes before commands that use it.

1. **TASK-000** — Install @anthropic-ai/claude-agent-sdk dependency (prerequisite for all agent code)
2. **TASK-001, TASK-002, TASK-003** — Type definitions (foundational)
3. **TASK-004** — Extend ClaudeService with artifact methods (core logic)
4. **TASK-005** — Admin guard utility (simple prerequisite)
5. **TASK-006** — AgentService implementation (complex, uses Agent SDK from TASK-000, used by commands)
6. **TASK-007 through TASK-010** — Four v2 command handlers (depend on services)
7. **TASK-011** — Register commands in deployCommands()
8. **TASK-012** — Wire handlers in entry point (depends on all command handlers)
9. **TASK-013 through TASK-017** — Extend MessageHandler with v2 phase handlers (depends on all previous)
10. **TASK-018** — Create comprehensive tests (final verification)

---

## Impact Analysis

### Downstream Dependencies

**Files modified (v1 + extension):**
- `src/types/index.ts` — extended with new ConversationPhase values, new interface, optional field (backward compatible)
- `src/services/claude.service.ts` — new public methods added (no existing method signature changes)
- `src/commands/index.ts` — imports and registers v2 commands (v1 command untouched)
- `src/index.ts` — adds event handler branches for v2 commands (v1 branch untouched)
- `src/handlers/message.handler.ts` — new phase handlers added in switch statement (v1 phases preserved in separate branches)

**Files added (v2 only, no impact on v1):**
- `src/commands/analyze.ts`, `src/commands/story.ts`, `src/commands/research.ts`, `src/commands/workbench.ts` — new command files
- `src/services/agent.service.ts` — new service
- `src/services/admin.guard.ts` — new utility

### Interface Changes

**Backward compatible:**
- `ConversationPhase` type extension (new values, existing values unchanged)
- `ConversationState` optional field `commandType` (optional, v1 state entries work without it)
- `ClaudeService` public methods (all additions, no signature changes)
- `MessageHandler` switch statement (new cases, existing cases preserved)

**Minor extension:**
- `createOrAttachIssue()` now accepts `labels` param, but is backward compatible (optional param)

### Shared Code Risk Assessment

| Component | Impact | Risk | Mitigation |
|-----------|--------|------|-----------|
| `ThreadService.createPrivateThread()` | Called 5 ways (1 v1 + 4 v2) | Low | Stable API, no changes needed |
| `ClaudeService.chat()` | Called by v1 + v2 workbench | Low | Same call pattern as v1 |
| `MessageHandler` state machine | Extended with v2 phases | Medium | v1 phases isolated in separate switch cases; v1 tests verify v1 paths still work |
| `ConversationPhase` type | Extended | Low | Union type extension; backward compatible |
| GitHub issue creation | New labels (analysis, user-story, research) | Low | GitHubService already supports labels param |

### Test Coverage Impact

**v1 tests:** All existing v1 tests (config, ClaudeService, GitHubService, ThreadService, MessageHandler) must continue to pass without modification. v2 code is isolated in new files and new handler branches, so v1 test paths are unaffected.

**v2 tests:** New test files for v2 features (command handlers, AgentService, new message handler phases). Must achieve:
- Unit test coverage for AgentService (mocked Agent SDK)
- Unit tests for v2 command handlers (admin check, thread creation)
- Unit tests for v2 phase handlers (message routing, artifact generation)
- Integration-style test for `/workbench` artifact proposal flow

Per Lesson #14, Agent SDK must be mocked using `vi.hoisted()` pattern (ESM-specific, required for module-level mocking).

### Critical Path Components

**Admin-gating:** All v2 commands must pass admin permission check before execution. If permission check fails (v1 pattern not verified or incorrectly implemented), v2 commands become accessible to non-admins. **Mitigation:** Admin guard is a simple utility (TASK-005, low risk), and each v2 command explicitly calls it at the top of the handler.

**Agent SDK integration:** New external dependency. If Agent SDK spawn fails (repo unavailable, malformed session, tool errors), conversation terminates. **Mitigation:** Agent spawn wrapped in try/catch; Claude can proceed without code context for `/story` and `/research`; `/analyze` failure closes thread with error message.

---

## What Does NOT Change

- **v1 `/issue` command** — no modifications to `src/commands/issue.ts` (completely untouched)
- **v1 conversation flow** — phases `'collecting'`, `'summarizing'`, `'confirming'`, `'done'` behavior is unchanged
- **v1 GitHub integration** — issue creation logic reused, only new labels added for v2
- **v1 Discord intents** — no new intents required (v2 uses same three: Guilds, GuildMessages, MessageContent)
- **v1 Discord permissions** — no new permissions required beyond v1 (SendMessages, CreatePrivateThreads, SendMessagesInThreads, ManageThreads, ReadMessageHistory)
- **Environment variables** — v2 reuses all v1 config (no new env vars: DISCORD_TOKEN, DISCORD_GUILD_ID, DISCORD_CHANNEL_ID, ANTHROPIC_API_KEY, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, CLAUDE_MODEL, SIMILARITY_THRESHOLD)
- **Database or persistence** — v2 uses same in-memory `Map<threadId, ConversationState>` pattern as v1 (state lost on restart, accepted limitation)
- **Package.json dependencies** — Agent SDK is a new dependency `@anthropic-ai/claude-agent-sdk` (separate from existing `@anthropic-ai/sdk`). Must be added in TASK-000 via `npm install @anthropic-ai/claude-agent-sdk`. Note: `simple-git` is NOT used; plan uses built-in `child_process` instead
- **v1 test files** — no modifications to existing test files; v1 tests continue to verify v1 paths

---

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| **Agent SDK spawn fails at runtime** | Medium | High — `/analyze` command cannot proceed; user sees error; thread remains open for retry or manual close | Wrap Agent SDK spawn in try/catch; provide clear error message in Slovak; log full error for debugging. Implementor to test Agent SDK spawn in dev environment before deployment. |
| **Admin permission check API pattern is incorrect** | Low | High — v2 commands accessible to non-admins; spam/abuse risk | Use verified pattern from task briefing (PermissionsBitField.Flags.Administrator). Test with mock admin and non-admin interactions during TASK-005. Document pattern clearly. |
| **GitHub labels do not exist in target repo** | Low | Low — issue creation fails with 422 (label not found); conversation orphaned or retry manual | Handle 422 gracefully in GitHubService.createIssue() (catch and log). Alternatively, create labels proactively if they don't exist. Document as pre-deployment checklist (repo admin creates labels, or bot auto-creates on first use). |
| **Artifact proposal heuristic is too strict/loose** | Medium | Medium — `/workbench` either always/never proposes artifacts; user experience degraded | Implement heuristic via Claude prompt: "Propose artifacts ONLY if conversation yielded concrete, actionable output. Respond with: PROPOSE: {type} or NO_ARTIFACT." Test with multiple workbench scenarios during TASK-018. |
| **Git clone becomes stale during long bot session** | Low | Low — Agent SDK sees outdated code; analysis is stale | Strategy: Pull before each Agent SDK session (line in `ensureRepoInitialized()`). Adds ~2 sec latency per `/analyze` command. Acceptable for v1 low-volume usage. |
| **v1 message handler switch statement becomes complex** | Medium | Medium — hard to maintain, high risk of breaking existing branches | Mitigation: Keep v1 and v2 branches strictly isolated in switch cases. Use clear phase naming (v1: `'collecting'`, v2: `'v2-analyzing'`). Add comments marking v1 vs v2 sections. Unit tests verify v1 paths still work. |
| **Breaking change in ConversationPhase or ConversationState** | Low | Low — code that references these types breaks at compile time | TypeScript strict mode catches at compile time (not runtime). Union type extension is additive (backward compatible). Optional field is optional. Run `npm run build` and all consumers flagged if incompatible. |
| **MessageContent intent not enabled in Discord Developer Portal** | Low | Medium — bot receives empty message.content in threads; v2 features fail silently | This is a v1 issue, not new to v2. Mitigation: Document in README. Both v1 and v2 require MessageContent. Fail explicitly if message.content is empty. |
| **Workbench conversation grows unbounded (memory, token cost)** | Low | Medium — long conversations consume memory and API tokens indefinitely | Mitigation: Set max turn limit (e.g., 20 turns per conversation) or max time (1 hour = auto-archive). Implement in workbench phase handler: count turns and transition to `'v2-proposing-artifacts'` when limit reached. Default to Claude signal `[END_CONVERSATION]` for user-initiated end. |

---

## Testing Strategy

### Unit Tests (Mandatory for all new code)

**Per Lesson #14, Agent SDK mocking MUST use `vi.hoisted()` pattern:**

```typescript
const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn().mockResolvedValue('analysis output'),
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: mockQuery,
}));

// Then import service under test
import { AgentService } from '../../src/services/agent.service.js';
```

**Test scope:**

1. **Config validation** (existing v1, no changes) — verify v1 tests still pass
2. **ClaudeService artifact methods** (TASK-004) — each of 4 methods returns expected string format, handles errors
3. **AdminGuard utility** (TASK-005) — pass/fail for admin and non-admin interactions
4. **AgentService** (TASK-006) — repo init, code analysis spawn, error handling (all with mocked Agent SDK)
5. **v2 command handlers** (TASK-007 through TASK-010) — permission check, thread creation, state init, welcome message
6. **MessageHandler v2 phases** (TASK-013 through TASK-017) — each phase handler routes correctly, calls services, transitions phase
7. **Label support** (TASK-017) — issue creation includes labels for v2 artifact types

### Integration Tests (Recommended, not mandatory for v1 scope)

- Full `/analyze` flow: command → agent spawn → claude analysis → confirm → issue creation with label
- Full `/workbench` flow: command → multi-turn chat → artifact proposal → confirm → issue creation
- Admin permission rejection: non-admin user tries v2 command → ephemeral error

### Manual Testing (Before deployment)

1. Verify all v2 commands appear in Discord slash command menu
2. Verify only admins can invoke v2 commands (non-admin sees ephemeral error)
3. Verify threads created correctly with naming convention
4. Verify Agent SDK spawn and code analysis (if repo clone works locally)
5. Verify GitHub issues created with correct labels

---

## Decisions (Append to decisions.md)

| # | Decision | Rationale | Tradeoff |
|----|----------|-----------|----------|
| D001 | **Git clone via `child_process.exec()`** — no external dependency | Simple, no extra npm package; `git` binary present on most systems | Requires error handling for missing `git` binary; slightly more verbose than `simple-git` library |
| D002 | **Clone location: `./.cache/bss-game/`** — gitignored, persists across restarts | Balances persistence (data survives restart) vs cleanliness (not in source tree) | Adds disk I/O on each bot run; cache invalidation strategy needed |
| D003 | **Agent SDK tools scoped via `cwd` option** — read-only filesystem sandbox | Verified in verified facts; Agent SDK supports this directly | Tool errors if user attempts parent directory access; error messages may be verbose |
| D004 | **Artifact proposals via Claude heuristic** — ask Claude "should we create artifacts?" | Leverages Claude's reasoning; no hand-rolled heuristic | Adds API call + parsing; failure modes less deterministic than hardcoded rules |
| D005 | **v2 conversation states as new ConversationPhase values** — `'v2-analyzing'`, `'v2-story-drafting'`, etc. | Reuses existing state machine pattern; clear isolation from v1 | Phase names grow long; enum could become unwieldy at 10+ values |
| D006 | **Optional `commandType` field in ConversationState** — distinguishes v1 from v2 routing | Backward compatible; v1 state entries work without it | Adds routing complexity; message handler must check both phase and commandType |
| D007 | **Admin-only gating for all v2 commands** — prevents spam/abuse on experimental features | Protects from abuse; can be loosened later if needed | v1 `/issue` remains open; inconsistent gating (may confuse users) |
| D008 | **Reuse `confirming` phase handler for all v2 artifacts** — minimal code duplication | Existing logic handles yes/no confirmation; only label changes | Assumes same confirm flow for all artifacts (may not fit `/workbench` 0+ artifacts case) |

---

## Acceptance Criteria (From requirements.md)

All acceptance criteria from requirements.md are addressed by this plan:

- [x] Four new slash commands registered and visible in Discord
- [x] All four commands gated to server admins only (via `checkAdminPermission()` in each handler)
- [x] All four commands visible only in designated issue channel (same validation as v1 `/issue`)
- [x] `/analyze`, `/story`, `/research`, `/workbench` open private threads with appropriate welcome messages
- [x] All threads follow v1 naming convention and auto-archive after 60 min
- [x] Agent SDK integration via `AgentService` for code-aware analysis (TASK-006)
- [x] Agent SDK tools limited to Read, Glob, Grep; read-only; scoped to codebase
- [x] Git repository pulled before each Agent SDK session
- [x] Artifacts generated via extended `ClaudeService` methods
- [x] GitHub issues created with labels `'analysis'`, `'user-story'`, `'research'`
- [x] User confirmation flow with yes/no responses (reused from v1)
- [x] Error handling for Agent SDK failures, GitHub API errors, graceful fallback
- [x] All responses in Slovak (system prompts for artifact methods)
- [x] v1 `/issue` behavior unchanged; v1 tests unmodified
- [x] No new environment variables; v1 config reused
- [x] No new Discord intents or permissions beyond v1
- [x] No writes to BSS codebase (read-only Agent SDK tools)
- [x] All artifacts created in target GitHub repo (configurable via env vars)

---

## Known Limitations & Future Considerations

1. **Workbench conversation unbounded** — No hard limit on conversation length. Suggest future improvement: max 20 turns or 1-hour session duration.

2. **Artifact proposal heuristic is subjective** — Claude's "should we create artifacts?" response depends on system prompt quality. May propose too aggressively or too conservatively. Future: add confidence score to ArtifactProposal.

3. **Agent SDK tool errors verbose** — If user attempts `../` or other parent directory access, error message may expose filesystem structure. Future: wrap tool responses with sanitized error messages.

4. **Bot restart orphans conversations** — In-memory state means active v2 workbench conversations are lost on restart (same as v1). Future: persist to database (Redis, PostgreSQL).

5. **Git clone cache stale** — Fresh pull before each Agent SDK session adds latency. Future: configurable TTL or webhook-triggered pull on repo changes.

6. **Prompt-based similarity scales poorly** — v1 pattern of sending all issues to Claude doesn't scale beyond ~200 issues. Future: switch to embeddings API.

---

## References

- Requirements: `.claude/pipeline/requirements.md`
- Codebase Map: `.claude/pipeline/codebase-map.md`
- Conventions: `.claude/context/conventions.md` (Lesson #14: `vi.hoisted()` mocking pattern)
- Architecture: `.claude/context/architecture.md`
- Knowledge: `.claude/context/knowledge.md` (verified facts on Agent SDK, discord.js v14, git clone strategy)

