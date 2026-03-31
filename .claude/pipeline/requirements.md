<!-- Pipeline | Phase 1 | Clarifier -->
<!-- Date: 2026-03-31 -->
<!-- Status: COMPLETED -->

# Requirement Specification

## What needs to be done

Build a Discord bot (`apps/discord-bot`) that:

1. **Listens** in a designated Discord Forum channel for the `/issue` slash command.
2. **Opens a private thread** in that Forum channel visible only to the invoking user and admins (other regular users cannot see it).
3. **Conversationally collects** the user's game-related request via a multi-turn Claude-powered chat inside the thread. Scope filter: reject only requests that are completely unrelated to the game (see Scope section).
4. **Summarizes** the collected request (via Claude API) and presents the summary to the user with a confirmation prompt ("Vytvoriť?").
   - If user **confirms** → proceed to issue creation/attachment, then close the thread.
   - If user **declines** → allow the user to refine or cancel entirely.
5. **Semantically compares** the confirmed summary against ALL existing issues (open + closed) in the `Kazarr/BySwordandSeal` GitHub repository using Claude API embeddings or similarity.
6. **Decides**:
   - If a sufficiently similar issue already exists → **add a comment** to that existing issue linking it to the new user report (so downstream agents can see the relationship).
   - If no similar issue exists → **create a new GitHub issue** with the collected information.
7. **Closes the Discord thread** after the issue action is completed.

**Deployment model:** Standalone Node.js process (separate repo `Kazarr/bss-discord-bot`), deployed independently (e.g., VPS, Railway, Fly.io). Not part of the game monorepo.

---

## Change type

New feature — standalone Node.js application in a new repository (`Kazarr/bss-discord-bot`), separate from the game monorepo.

---

## Context and motivation

The game project (`BySwordandSeal`) needs a structured feedback channel so that:
- Players can report bugs, request features, and give UX feedback directly from Discord without needing a GitHub account.
- Duplicate issues are automatically deduplicated (semantic matching) to keep the issue tracker clean.
- Issues are linked/grouped for the downstream Claude Code agent pipeline so it can understand relationships between reported problems.

---

## Scope

### Affected areas

| Area | What changes |
|------|-------------|
| `Kazarr/bss-discord-bot` (new repo) | **New standalone application** — created from scratch in its own repository |
| Game monorepo (`Kazarr/BySwordandSeal`) | **NOT affected** — no changes to existing game code |
| `Kazarr/BySwordandSeal` GitHub Issues | Read + write via GitHub API (semantic matching, create/comment) |

### Layers

- **Standalone Node.js application** — TypeScript, own `package.json`, own CI/CD, independent deployment
- **Discord integration** — discord.js v14+
- **Claude API** — conversation management + semantic similarity
- **GitHub API** — Octokit REST (read issues, create issues, add comments)
- **No database** — bot is stateless; thread lifecycle managed by Discord
- **No dependency on game monorepo** — bot does not import `@bss/shared` or any game code

### In-scope request topics (game scope filter)

All of the following are accepted:
- Game mechanics (production, buildings, resources, population, economy)
- Technical problems (login failures, page not loading, errors)
- UI/UX feedback (visual issues, readability, layout problems)

Out-of-scope (rejected by bot with polite message, thread closed):
- Topics completely unrelated to the game (e.g., "recommend me a pizza recipe")

---

## Acceptance criteria

- [ ] `/issue` slash command is registered in the Discord server and responds in a designated Forum channel.
- [ ] A private thread is created on `/issue`; only the invoking user and admins can see it.
- [ ] Bot engages the user in a multi-turn conversation (powered by Claude API) to collect the issue details.
- [ ] If the user's topic is clearly unrelated to the game, the bot politely declines and closes the thread.
- [ ] After collection, bot presents a plain-text summary to the user and asks "Vytvoriť?" (or equivalent confirmation prompt).
- [ ] If user confirms: bot performs semantic comparison against all issues (open + closed) in `Kazarr/BySwordandSeal`.
- [ ] If a similar issue is found: bot adds a comment to that issue (not a new issue) and reports the issue URL back to the user in the thread.
- [ ] If no similar issue is found: bot creates a new GitHub issue with title + body derived from the summary, and reports the new issue URL back to the user.
- [ ] Thread is closed/archived after the action completes (both create and attach paths).
- [ ] If user declines the summary: bot allows at least one refinement cycle or clean cancellation.
- [ ] Bot reads BOTH open AND closed GitHub issues during semantic comparison.
- [ ] Game monorepo (`Kazarr/BySwordandSeal`) is not modified.
- [ ] No secrets (Discord token, Claude API key, GitHub token) are hardcoded — loaded from environment variables.

---

## Constraints — what NOT to do

- **Do NOT** modify any files in the game monorepo (`Kazarr/BySwordandSeal`).
- **Do NOT expose** Discord token, Claude API key, or GitHub personal access token in committed code.
- **Do NOT** make the thread visible to regular Discord users — privacy is a hard requirement.
- **Do NOT** skip the confirmation step — user must explicitly confirm before any GitHub write action.
- **Do NOT** create a new GitHub issue if a semantically similar one already exists — attach a comment instead.
- **Do NOT** reject game-related bug reports or UX feedback — only reject topics completely unrelated to the game.
- **Do NOT** add runtime code browsing of the game codebase to the bot — it collects user feedback only.
- **Do NOT** add a database dependency — bot must remain stateless for v1.

---

## Existing patterns (carried over from game project)

| Convention | Value |
|------------|-------|
| TypeScript config | strict mode, ES2022 target |
| Code style | Prettier single quotes |
| Secret management | Environment variables only — never committed; `.env.example` pattern |
| Module system | ES modules (ESM) |

Discord.js version, Octokit version, and Anthropic SDK version are not yet pinned — Scout phase will determine compatible versions.

---

## Risks and notes

1. **Thread privacy on Discord** — Forum channels support private threads but this requires the `PRIVATE_THREADS` intent and the Manage Threads permission. Scout should verify discord.js v14 API support.
2. **Semantic similarity threshold** — The threshold for "similar enough to attach vs. create new" is not defined. Planner must propose a strategy (cosine similarity cutoff, or Claude prompt-based classification).
3. **GitHub rate limits** — Reading all open + closed issues at bot startup (or per request) may hit GitHub API rate limits for large repos. Scout should check current issue volume.
4. **Claude API cost** — Multi-turn conversations + semantic comparison per `/issue` invocation incur API costs. No budget constraint was specified; Planner should note this.
5. **Project scaffolding** — Standalone repo needs proper `package.json`, `tsconfig.json`, ESLint, Prettier setup. Scout should determine best project structure.
6. **Test strategy** — Planner must define unit + integration test strategy for the bot (Vitest or Jest).
7. **Statelessness assumption** — Bot does not persist conversation state to the database. If the bot restarts mid-conversation, the thread becomes orphaned. This is accepted for now (noted for future iteration).

---

## Decisions made during specification

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Where does the bot live? | Standalone repo `Kazarr/bss-discord-bot` | Bot has different runtime, deployment, and dependencies; doesn't need `@bss/shared` types — only collects text feedback |
| 2 | What kind of Discord thread? | Discord Forum channel with private threads | Privacy requirement — only invoking user + admins see the thread |
| 3 | Is there a confirmation step before GitHub write? | Yes — bot summarizes and asks "Vytvoriť?" | User must explicitly confirm before any GitHub write action |
| 4 | What happens when a similar issue is found? | Auto-add comment to the matching existing issue | Downstream Claude Code agent needs linked issues for context |
| 5 | How broad is the game scope filter? | Accept mechanics + technical + UI/UX; reject only fully off-topic | Players should be able to report bugs and UX problems, not just feature requests |
| 6 | Which GitHub repo, which issues to read? | `Kazarr/BySwordandSeal`, both open AND closed issues | Full issue history gives better semantic matching coverage |
