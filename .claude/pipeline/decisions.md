# Pipeline Decision Log

This file records all decisions made during requirements clarification. Append new entries — do not overwrite existing ones.

---

## Feature: Discord Bot — Issue Collection Agent

**Date:** 2026-03-31
**Phase:** 1 — Clarifier
**Requirement file:** `.claude/pipeline/requirements.md`

### Decision Log

| # | Question / Ambiguity | Decision | Rationale | Status |
|---|----------------------|----------|-----------|--------|
| 1 | Where does the Discord bot live? | Standalone repo `Kazarr/bss-discord-bot` | Bot has different runtime (24/7 process), different deployment, different dependencies (discord.js, anthropic, octokit); doesn't need `@bss/shared` — only collects text feedback. Separate repo keeps monorepo clean. | CONFIRMED (updated Gate 1) |
| 2 | What type of Discord channel / thread should be used? | Discord Forum channel with private threads | Privacy requirement: only the invoking user and server admins may see the conversation; not visible to regular users | CONFIRMED |
| 3 | Should there be a confirmation step before creating/attaching a GitHub issue? | Yes — bot presents summary and asks "Vytvoriť?" before any GitHub write action | Prevents accidental or misunderstood submissions; user can refine or cancel if summary is wrong | CONFIRMED |
| 4 | What happens when the semantic comparison finds a similar existing issue? | Add a comment to the existing issue (do NOT create a duplicate) | The downstream Claude Code agent pipeline needs linked/grouped issues to understand relationships between reports | CONFIRMED |
| 5 | How broad is the in-scope filter for game-related topics? | Accept all of: game mechanics, technical problems (bugs, login, loading), UI/UX feedback. Reject ONLY topics completely unrelated to the game. | Players must be able to report any type of game problem; overly narrow filtering would block legitimate bug reports | CONFIRMED |
| 6 | Which GitHub repository, and which issues to read for semantic comparison? | Repo: `Kazarr/BySwordandSeal`; read BOTH open AND closed issues | Full issue history (including resolved issues) provides better semantic coverage and avoids re-creating already-closed issues | CONFIRMED |
| 7 | Does the bot need runtime access to the game codebase? | No — bot collects user feedback about the game experience only | Codebase browsing would add significant complexity with no benefit for the feedback collection use case | CONFIRMED |
| 8 | Does the bot need a persistent database? | No — bot is stateless; thread lifecycle managed by Discord | Adding DB access would couple the bot to the game infrastructure; statelessness is acceptable for v1 | CONFIRMED |

### Open questions deferred to Scout / Planner

| # | Question | Deferred to |
|---|----------|-------------|
| P1 | What cosine similarity threshold (or Claude prompt strategy) should determine "similar enough to attach vs. create new"? | Planner |
| P2 | Compatible versions of discord.js, Octokit, and Anthropic SDK for a Node.js/TypeScript Nx app? | Scout |
| P3 | Current volume of GitHub issues in `Kazarr/BySwordandSeal` — risk of hitting GitHub API rate limits? | Scout |
| P4 | Unit + integration test strategy for the Discord bot (TDD workflow required per project conventions)? | Planner |
| P5 | Project structure for standalone repo (package.json, tsconfig, ESLint, Prettier, folder layout)? | Scout |
