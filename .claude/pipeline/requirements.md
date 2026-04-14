<!-- Pipeline | Phase 1 | Clarifier -->
<!-- Date: 2026-04-14 -->
<!-- Status: COMPLETED -->

# Requirement Specification — v2 Feature Implementation

## What needs to be done

Add four new v2 slash commands to the Discord bot for code-aware analysis and developer enablement. Each command opens a private thread (following the v1 pattern) where developers can request structured artifacts from Claude. The bot generates GitHub issues with appropriate labels and posts confirmation links back to the Discord thread.

The four new commands are:

1. **`/analyze`** — Code-aware analysis of the BSS game codebase
   - Opens thread → bot asks "What would you like to analyze?"
   - Agent SDK spawns with tool access to BSS codebase (local clone)
   - Produces code-aware analysis document
   - GitHub artifact: Issue with label `analysis`

2. **`/story`** — INVEST-style user story generation
   - Opens thread → bot asks "What user story would you like to produce?"
   - May read codebase for context (at Claude's discretion)
   - Agent SDK may be spawned if code context needed
   - Produces INVEST-compliant user story
   - GitHub artifact: Issue with label `user-story`

3. **`/research`** — Research and investigation notes
   - Opens thread → bot asks "What would you like to research?"
   - May read codebase for code references
   - Agent SDK may be spawned if investigation requires codebase inspection
   - Produces research/investigation notes (may include code references)
   - GitHub artifact: Issue with label `research`

4. **`/workbench`** — Free-form conversation with artifact proposal
   - Opens thread → free-form NL conversation with Claude
   - At end of conversation, bot may propose creating one or more artifacts
   - Artifacts proposed: zero or more of `analysis`, `user-story`, `research` (based on conversation content)
   - GitHub artifacts: One or more issues with appropriate labels (or none if conversation yields no artifact proposal)

## Change type

New feature (add four new slash commands with v2 artifact generation pipeline)

## Context and motivation

**Why:** BSS Discord community needs structured, code-aware analysis and developer enablement tools. v1 (`/issue`) is feedback-focused; v2 extends the bot to support analysis, stories, and research workflows for team collaboration.

**Who it affects:** Discord server admins (gated to admins only for v2)

**Urgency:** Medium — v2 is a planned enhancement post-v1 deployment

## Scope

### Affected areas

**Frontend (Discord side):**
- `src/commands/` — four new command files: `analyze.ts`, `story.ts`, `research.ts`, `workbench.ts`
- `src/commands/index.ts` — register four new commands in `deployCommands()`

**Backend services (new or extended):**
- `src/services/agent.service.ts` — NEW — spawn Agent SDK sessions for code-aware analysis
- `src/services/claude.service.ts` — EXTEND — new methods for multi-artifact proposal logic in `/workbench`
- `src/handlers/message.handler.ts` — EXTEND — add routing for four new command states
- `src/types/index.ts` — EXTEND — new types for artifact metadata, workbench conversation state

**GitHub integration:**
- Existing `GitHubService` unchanged — same `createIssue()` method
- New use: label artifacts with `analysis`, `user-story`, `research` (labels must exist or be created)

**External dependencies:**
- `@anthropic-ai/sdk` — EXTEND — add Agent SDK import if not already present
- `@anthropic-ai/sdk` Agent SDK — NEW — tool definitions for codebase file listing, reading, grep

### Layers

- **Discord:** Slash command handlers (4 new commands)
- **Claude:** Conversation orchestration + artifact generation (multi-turn, Agent SDK spawning)
- **GitHub:** Issue creation with labels (existing mechanism, new labels)
- **File System:** Agent SDK tool access to local BSS codebase clone (read-only, no writes)

## Acceptance criteria

All acceptance criteria are for v2 scope only. v1 `/issue` command behavior is unchanged.

### Command Registration & Access

- [ ] Four new slash commands (`/analyze`, `/story`, `/research`, `/workbench`) are registered and visible in Discord
- [ ] All four commands are gated to server admins only (non-admin users see "insufficient permissions" error)
- [ ] All four commands are visible only in the designated issue channel (same channel as v1 `/issue`)

### Thread Creation & Conversation Flow

- [ ] `/analyze`: Opens private thread → bot immediately asks "What would you like to analyze?" in Slovak → awaits user input
- [ ] `/story`: Opens private thread → bot immediately asks "What user story would you like to produce?" in Slovak → awaits user input
- [ ] `/research`: Opens private thread → bot immediately asks "What would you like to research?" in Slovak → awaits user input
- [ ] `/workbench`: Opens private thread → bot greets user and invites free-form conversation in Slovak
- [ ] All threads follow v1 naming convention: `Issue: {username} - {YYYY-MM-DD}`
- [ ] All threads are private (type: `ChannelType.PrivateThread`)
- [ ] All threads auto-archive after 60 minutes of inactivity

### Agent SDK Integration

- [ ] `/analyze` and `/research` spawn Agent SDK session with tool access to BSS codebase
- [ ] `/story` and `/workbench` may optionally spawn Agent SDK session if context needed (Claude decides)
- [ ] Agent SDK session is initialized with fresh git pull of `By-Sword-and-Seal-Playground` repo (kept current before each command)
- [ ] Agent SDK tools available: file listing (`ls`), file reading (`read`), grep search
- [ ] Agent SDK session is read-only — no file writes, no git operations, no modifications to codebase

### Artifact Generation & GitHub Issues

- [ ] **`/analyze`:** At end of conversation, bot generates code-aware analysis document and creates GitHub issue with label `analysis`
- [ ] **`/story`:** At end of conversation, bot generates INVEST-style user story and creates GitHub issue with label `user-story`
- [ ] **`/research`:** At end of conversation, bot generates research notes (may include code references) and creates GitHub issue with label `research`
- [ ] **`/workbench`:** At end of free-form conversation, bot may propose zero or more artifacts. If proposed, creates corresponding GitHub issues with labels `analysis`, `user-story`, and/or `research`
- [ ] All GitHub issues are created in `Kazarr/BySwordandSeal` repo (configurable via `GITHUB_OWNER` and `GITHUB_REPO` env vars, same as v1)
- [ ] GitHub issue body includes:
  - **Discord User:** {username}#{discriminator}
  - **Reported:** {timestamp}
  - {artifact content}
  - **Thread:** {link to Discord thread}
- [ ] All GitHub issue labels (`analysis`, `user-story`, `research`) exist in the target repo (or bot creates them if they don't)

### Conversation & Artifact Workflow

- [ ] **`/analyze`:** User describes what to analyze → Agent SDK reads codebase → Claude generates structured analysis → bot displays summary in thread → user confirms ("áno") or declines ("nie")
- [ ] **`/story`:** User describes user story requirements → Agent SDK may read codebase for context → Claude generates INVEST story → bot displays summary in thread → user confirms or declines
- [ ] **`/research`:** User describes research question → Agent SDK may read codebase → Claude produces investigation notes → bot displays summary → user confirms or declines
- [ ] **`/workbench`:** User initiates free-form conversation with Claude → multi-turn dialogue → at conversation end, bot analyzes dialogue and proposes artifacts (if any) → user confirms ("áno") or cancels
- [ ] User confirmation flow:
  - If user confirms: create GitHub issue(s), post confirmation link in thread, close thread
  - If user declines: ask "Improve?" or "Cancel?" → improve sends back to conversation, cancel closes thread
- [ ] All bot responses are in Slovak (same system prompt pattern as v1)
- [ ] All confirmation prompts are in Slovak ("Vytvoriť?" = "Create?")

### Error Handling & Edge Cases

- [ ] If Agent SDK session fails to initialize: bot sends error message in Slovak + closes thread gracefully
- [ ] If code-aware analysis requires tools but codebase is unavailable: bot notifies user + offers to continue without code context (for `/story` and `/research`)
- [ ] If GitHub issue creation fails: bot sends error message in thread, does NOT close thread (allow retry)
- [ ] If no artifact is proposed by bot at end of `/workbench` conversation: bot notifies user "No artifacts proposed" and closes thread
- [ ] If user is removed from server during conversation: thread orphans gracefully (auto-archive after 60 min)

### Backward Compatibility & Non-Interference

- [ ] v1 `/issue` command behavior is unchanged
- [ ] v1 conversation state machine is unchanged
- [ ] v1 GitHub integration is unchanged
- [ ] v1 unit tests all pass without modification
- [ ] v1 Discord intents and permissions remain sufficient (no new intents or permissions required beyond v1)

## Constraints — what NOT to do

- **MUST NOT change v1 `/issue` command** — `/issue` behavior, flow, and output are unchanged
- **MUST NOT modify existing services** — v1 services (ClaudeService, GitHubService, ThreadService) are extended, not replaced
- **MUST NOT store v2 conversation state in database** — v2 uses same in-memory Map pattern as v1 (state lost on restart, accepted limitation)
- **MUST NOT require new Discord intents** — v2 uses same three intents as v1: Guilds, GuildMessages, MessageContent
- **MUST NOT require new Discord permissions** — v2 uses same permissions as v1: SendMessages, CreatePrivateThreads, SendMessagesInThreads, ManageThreads, ReadMessageHistory
- **MUST NOT write to the BSS codebase** — Agent SDK has read-only access; no modifications, no writes, no git operations
- **MUST NOT create GitHub issues outside `Kazarr/BySwordandSeal` repo** — all v1 and v2 issues go to the same target repo
- **MUST NOT modify existing GitHub labels** — labels `analysis`, `user-story`, `research` are created if they don't exist; existing labels remain untouched
- **MUST NOT break existing tests** — all v1 tests must pass; new tests must follow v1 patterns
- **MUST NOT add new environment variables** — v2 reuses v1 config: DISCORD_TOKEN, DISCORD_GUILD_ID, DISCORD_CHANNEL_ID, ANTHROPIC_API_KEY, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, CLAUDE_MODEL, SIMILARITY_THRESHOLD
- **MUST NOT enable permissions for non-admins** — v2 commands are admin-gated in v1
- **MUST NOT use Forum channels** — v2 commands create private threads in text channels (same as v1)
- **MUST NOT interact with v1 issue state machine** — v2 commands and v1 command are independent workflows; v2 does not modify v1 state entries

## Existing patterns (from v1)

All v2 commands follow v1 patterns established in `.claude/context/`:

**Thread creation:**
- v1 pattern: `ThreadService.createPrivateThread()` with naming `Issue: {username} - {YYYY-MM-DD}`, auto-archive 60 min, private type, invitable: false
- v2 extends: Same pattern for all four commands

**Conversation flow:**
- v1 pattern: Multi-turn message handling via `MessageHandler` state machine, in-memory `Map<threadId, ConversationState>`
- v2 extends: Same state machine pattern; v2 commands add new state values (e.g., `v2-analyzing`, `v2-story-drafting`, `v2-workbench`)

**Claude interaction:**
- v1 pattern: Stateless calls to `ClaudeService` with conversation history passed in; system prompt specifies Slovak communication
- v2 extends: Same pattern; new optional pattern for Agent SDK spawning when code context needed

**GitHub integration:**
- v1 pattern: `GitHubService.createIssue()` with body format including Discord user, timestamp, content, thread link
- v2 extends: Same pattern; new parameter: `labels` array (e.g., `["analysis"]`, `["user-story"]`, `["research"]`)

**Error handling:**
- v1 pattern: Try/catch in handlers, log errors, send user-friendly message in thread
- v2 extends: Same pattern for Agent SDK errors, GitHub errors, and conversation failures

**TypeScript conventions:**
- Types from `src/types/index.ts`
- Services in `src/services/`, handlers in `src/handlers/`, commands in `src/commands/`
- All ESM imports with `.js` extensions
- PascalCase for classes, camelCase for methods, UPPER_SNAKE_CASE for constants
- Bracket notation for env var access

## Risks and notes

### Agent SDK Dependency

**Risk:** Agent SDK is a new external dependency not yet integrated into project.

**Mitigation:** Agent SDK must be added to package.json; all Agent SDK calls are mocked in unit tests (following v1 pattern of mocking external APIs).

### Code-Aware Analysis Complexity

**Risk:** Agent SDK spawning, tool definitions, and multi-tool interaction may add complexity and potential failure points.

**Mitigation:** Start with `/analyze` as primary code-access command; `/story` and `/research` may use code context but are not required to; `/workbench` is free-form and artifact proposal is optional.

### GitHub Label Management

**Risk:** Labels `analysis`, `user-story`, `research` must exist in target repo.

**Mitigation:** Bot can create labels if they don't exist (simple GitHub API call). Alternatively, labels must be pre-created in repo admin.

### Rate Limiting & Token Cost

**Risk:** Agent SDK sessions + prompt-based similarity may increase API token usage vs. v1.

**Mitigation:** v1 rate limits are low volume; v2 monitor token usage in early deployment. Agent SDK sessions are spawned only when needed (not for every command).

### Workbench Artifact Proposal Logic

**Risk:** Logic to determine whether `/workbench` conversation yielded artifact-worthy content is subjective (Claude-based heuristic).

**Mitigation:** Set clear guidance in system prompt: "Propose an artifact ONLY if conversation produced concrete, actionable output (analysis, story, or research notes). Do not propose artifacts for casual discussion."

### Backward Compatibility

**Risk:** Adding four new commands + new types + new service may introduce bugs affecting v1 command.

**Mitigation:** All v1 code paths remain unchanged. New code is isolated to new command files and new service (`AgentService`). Existing service extensions are additive (new methods, not modified methods).

### Unknown: Exact Artifact Proposal Heuristic for Workbench

**Question for next phase:** What exact criteria should trigger artifact proposal in `/workbench`? (e.g., conversation word count, explicit user request, Claude confidence threshold)

**Current assumption:** Claude uses judgment; clear system prompt guidance provided.

## Decisions made during specification

| Question | Decision | Rationale |
|----------|----------|-----------|
| **v2 and v1 commands isolated?** | Yes — `/analyze`, `/story`, `/research`, `/workbench` are independent of v1 `/issue`. No interaction between workflows. | Simplifies implementation, reduces risk of breaking v1. Each command has its own state machine branch. |
| **Agent SDK integration point?** | Spawned per-command when needed. `/analyze` always spawns. `/story`, `/research`, `/workbench` may spawn if Claude decides code context is valuable. | Balances code-awareness with simplicity. Not every command needs codebase access. |
| **BSS codebase clone management?** | Bot maintains persistent local clone of `By-Sword-and-Seal-Playground`. Fresh `git pull` before each Agent SDK session. | Ensures Agent SDK always has current code. Simple polling/pull mechanism, no webhook needed for v1. |
| **GitHub issue labels in v2?** | Three new labels: `analysis`, `user-story`, `research`. Same target repo as v1: `Kazarr/BySwordandSeal`. | Clear categorization of artifact types. Reuses v1 repo config. Backward compatible with v1 (v1 issues have no label or existing labels). |
| **Admin-only gating?** | Yes — all v2 commands require admin role. v1 `/issue` remains open to all (unchanged). | Protects from spam/abuse on new experimental features. v1 feedback mechanism remains open. Can be loosened later if needed. |
| **Backward compatibility approach?** | Strict: v1 code is untouched; v2 is additive only (new types, new service, new command files, new state machine branches). | Reduces risk of regression. v1 can be deployed independently of v2. v2 testing does not require v1 code changes. |
| **State machine design for v2?** | Extend existing `ConversationPhase` enum with new phases: `v2-analyzing`, `v2-story-drafting`, `v2-research-investigating`, `v2-workbench`. Same `MessageHandler` used for routing. | Reuses proven state machine pattern. v1 tests unaffected. New states isolated in v2 branches. |
| **Error recovery in v2?** | Same as v1: errors logged, user notified in thread, thread kept open for retry (except agent spawn failures, which close thread). | Consistent with v1 UX. Allows user to attempt recovery without re-invoking command. |
| **Language requirement (v2)?** | All v2 commands use Slovak for bot responses (same system prompt pattern as v1). | Consistent user experience. Discord community language is Slovak. |
| **Artifact confirmation flow?** | Same as v1: bot shows summary → user responds "áno" (yes) or "nie" (no) → if yes: create GitHub issue + close thread; if no: ask improve or cancel. | Familiar UX for users coming from v1. Ensures human review before artifact creation. |

