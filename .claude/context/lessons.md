# Pipeline Lessons

> Auto-maintained by Learner Agent. Last updated: 2026-03-30
> Max 150 lines. Compacted when exceeded.

## Active Lessons

| # | Lesson | Confidence | Seen | Last Confirmed | Target | Dimension |
|---|--------|------------|------|----------------|--------|-----------|
| 1 | When a resource is removed from a stockpile, Scout should actively search for all places that resource is SPENT (cost checks, guards) in addition to places it is PRODUCED or CONSUMED (ticks). Cost checks in services and their corresponding spec files are the highest-risk blind spot. | low | 1 | 2026-03-30 | Scout | Exploration Coverage |
| 2 | When a spec file is classified as "DEFINITELY needs changes" due to a cost/constraint change, enumerate ALL mock stockpile objects in that file that are passed to the code path exercising the cost check — not just the primary happy-path test. A secondary test case in the same file was the cause of the one repair cycle in the food system refactor. | low | 1 | 2026-03-30 | Planner | Plan Accuracy |
| 3 | Pre-existing lint and TypeCheck failures in CI create a noisy baseline where new failures are harder to detect. When verification reports pre-existing FAILs, note the baseline failure count explicitly so future runs can compare against it rather than re-running git blame from scratch. | medium | 2 | 2026-03-30 | Verifier | Repair Cycle Analysis |
| 4 | Embedding a decisions table directly inside requirements.md (not only in decisions.md) significantly reduces downstream ambiguity. Requirements that include both "what to change" and "decisions already made" allow Scout and Planner to operate without clarification loops. This pattern produced zero clarification requests across three consecutive runs. | medium | 3 | 2026-03-30 | Clarifier | Requirements Quality |
| 5 | When a plan describes the same logic being used in two places, extracting a private helper method is a well-justified deviation. Document in changes.md with the duplication-avoidance rationale so the Reviewer can confirm intent rather than flag it as scope creep. | low | 1 | 2026-03-30 | Implementor | Plan Accuracy |
| 6 | When a TypeScript `Record<Enum, ...>` is expanded with new enum members, Scout must classify ALL spec files with mock objects by their typing strategy: files using typed DTOs (e.g. ProvinceDto, typed return values) will cause compile errors when the enum grows; files using `any`-typed mocks will not. This classification must happen before Planner scopes the task, to prevent surprise repair cycles. | medium | 2 | 2026-03-30 | Scout | Exploration Coverage |
| 7 | Refactoring spec mock factories to `{ ...BASE_CONSTANT, ...overrides }` spread pattern (keeping only non-default overrides explicit) makes them future-proof against further enum expansions. This is the correct long-term pattern for any Record-typed mock. Planner should recommend this refactor whenever scope expansion to spec files is unavoidable — the one-time cost compounds positively across future runs. | low | 1 | 2026-03-30 | Planner | Plan Accuracy |
| 8 | When Verifier classifies a failure as PRE-EXISTING, it should also check whether any file in the changed set appears in the pre-existing failure list. Overlap between "files we changed" and "files with pre-existing lint/typecheck issues" is a signal that a cleanup commit will likely follow the pipeline. Noting this explicitly avoids a silent gap between pipeline outcome and actual commit state. | low | 1 | 2026-03-30 | Verifier | Repair Cycle Analysis |
| 9 | When a plan introduces code branches explicitly described as "dormant until Step N+1," the plan must include minimum branch-coverage tests (exercising the new if/else paths with a mock that triggers them). Runtime dormancy does not exempt branches from coverage thresholds. Failure to do this caused one repair cycle in the Recipe System Infrastructure run. | low | 1 | 2026-03-30 | Planner | Plan Accuracy |
| 10 | When requirements describe an existing state incorrectly (e.g., "change X from A to B" but X is already B), Scout should add a CRITICAL FINDING noting the stale requirement and eliminate the corresponding plan task. The Clarifier should prompt Scout to "verify current state" for all refactor items in future specs, not just new additions. | low | 1 | 2026-03-30 | Scout / Clarifier | Requirements Quality |
| 11 | When new code threads override data (e.g., recipe rates) into functions that also read the same data from a global constant internally, verify whether the function accepts the override as a parameter or reads the global. If it reads the global internally, the override is a partial no-op. Document as a known limitation and add a Step N+1 refactor task to thread the data as a parameter. | low | 1 | 2026-03-30 | Planner | Agent Blind Spots |
| 12 | Reviewer scope analysis should diff the feature branch against its merge base (main), not the working copy. Working copy diffs include changes from prior commits to main that are unrelated to the current feature, leading to false-positive "unplanned change" findings (e.g., inject() refactors already on main flagged as scope creep). | low | 1 | 2026-03-30 | Reviewer | Agent Blind Spots |
| 13 | Planner must write plan.md to disk as part of its output — not depend on a manual Write step from the user. This process gap has occurred in two consecutive runs (food system refactor and recipe system infrastructure). It is a persistent Planner agent process failure, not an environment issue. | medium | 2 | 2026-03-30 | Planner | Repair Cycle Analysis |

## Archived Lessons

*(none yet)*

<!-- Compacted: never -->
<!-- Run count: 3 -->
