# CLAUDE.md — bss-discord-bot

Discord bot for collecting game feedback and managing GitHub issues for By Sword and Seal.

## Pipeline State

This project was bootstrapped via the SW Dev Pipeline (phases 0-3 completed in the game monorepo). The pipeline artifacts in `.claude/pipeline/` contain:

- **requirements.md** — approved requirements (Gate 1 passed)
- **codebase-map.md** — technology research, project structure, critical findings
- **plan.md** — approved implementation plan with 10 TASKs (Gate 2 pending formal approval)
- **decisions.md** — decision log

To resume the pipeline, run `/sw-dev:sw-dev` and instruct it to continue from Phase 4 (Implementor) using the existing artifacts.

## Architecture

Standalone Node.js Discord bot (TypeScript). Not part of the game monorepo.

- **Discord integration** — discord.js v14+ (private threads in text channel, slash commands)
- **Claude API** — @anthropic-ai/sdk (conversation, summarization, semantic similarity)
- **GitHub API** — @octokit/rest (read/create issues, add comments)
- **No database** — stateless, in-memory conversation state

## Key Conventions

- TypeScript strict mode, ES2022 target, nodenext module resolution
- ESM (`"type": "module"` in package.json)
- Single quotes (Prettier)
- Secrets via environment variables only (`.env.example` pattern)
- Vitest for unit tests, all external APIs mocked

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start with tsx (development)
npm run build        # Build with tsup
npm run start        # Run built output
npm run test         # Run Vitest tests
npm run lint         # ESLint
npm run format       # Prettier
```
