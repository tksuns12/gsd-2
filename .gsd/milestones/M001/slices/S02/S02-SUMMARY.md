---
id: S02
parent: M001
milestone: M001
provides:
  - gsd_plan_slice tool handler — DB-backed slice planning write path
  - gsd_plan_task tool handler — DB-backed task planning write path
  - renderPlanFromDb() — generates S##-PLAN.md from DB state
  - renderTaskPlanFromDb() — generates T##-PLAN.md from DB state
  - upsertTaskPlanning() — safe planning-field updates on existing task rows
  - getSliceTasks() and getTask() query functions with planning fields populated
  - Prompt contract tests for plan-slice prompt DB-backed tool references
requires:
  - slice: S01
    provides: Schema v8 migration with planning columns on slices/tasks tables
  - slice: S01
    provides: Tool handler pattern from plan-milestone.ts (validate → transaction → render → invalidate)
  - slice: S01
    provides: renderRoadmapFromDb() and markdown-renderer.ts rendering infrastructure
  - slice: S01
    provides: db-tools.ts registration pattern and DB-availability checks
affects:
  - S03
  - S04
key_files:
  - src/resources/extensions/gsd/markdown-renderer.ts
  - src/resources/extensions/gsd/tools/plan-slice.ts
  - src/resources/extensions/gsd/tools/plan-task.ts
  - src/resources/extensions/gsd/bootstrap/db-tools.ts
  - src/resources/extensions/gsd/gsd-db.ts
  - src/resources/extensions/gsd/prompts/plan-slice.md
  - src/resources/extensions/gsd/tests/plan-slice.test.ts
  - src/resources/extensions/gsd/tests/plan-task.test.ts
  - src/resources/extensions/gsd/tests/prompt-contracts.test.ts
  - src/resources/extensions/gsd/tests/plan-slice-prompt.test.ts
  - src/resources/extensions/gsd/tests/markdown-renderer.test.ts
  - src/resources/extensions/gsd/tests/auto-recovery.test.ts
key_decisions:
  - upsertTaskPlanning() updates planning fields without clobbering execution/completion state on existing task rows
  - renderPlanFromDb() eagerly renders all child task-plan files so recovery checks see complete artifact set immediately
  - Task-plan frontmatter uses conservative skills_used: [] — skill activation remains execution-time only
  - plan-slice.md step 6 names gsd_plan_slice/gsd_plan_task as canonical write path; step 7 is degraded fallback
patterns_established:
  - Flat TypeBox validation → parent-existence check → transactional DB write → render → cache invalidation pattern extended from milestone tools to slice/task tools
  - Prompt contract tests as regression tripwires for tool-name and framing changes in planning prompts
  - Parse-visible state assertions as ESM-safe alternative to spy-based cache invalidation testing
observability_surfaces:
  - plan-slice.ts and plan-task.ts handler error payloads — structured failure messages for validation/DB/render failures
  - detectStaleRenders() stderr warnings when rendered plan artifacts drift from DB state
  - verifyExpectedArtifact('plan-slice', ...) — runtime recovery check for task-plan file existence
  - SQLite artifacts table rows for rendered S##-PLAN.md and T##-PLAN.md files
drill_down_paths:
  - .gsd/milestones/M001/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S02/tasks/T02-SUMMARY.md
  - .gsd/milestones/M001/slices/S02/tasks/T03-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-03-23T16:13:56.461Z
blocker_discovered: false
---

# S02: plan_slice + plan_task tools + PLAN/task-plan renderers

**DB-backed gsd_plan_slice and gsd_plan_task tools write structured planning state to SQLite, render parse-compatible S##-PLAN.md and T##-PLAN.md artifacts, and the plan-slice prompt now names these tools as the canonical write path.**

## What Happened

S02 delivered the second layer of the markdown→DB migration: structured write paths for slice and task planning. The work proceeded through three tasks with distinct failure boundaries.

T01 built the rendering foundation — `renderPlanFromDb()` and `renderTaskPlanFromDb()` in `markdown-renderer.ts`. These read slice/task rows from SQLite and emit markdown that round-trips cleanly through `parsePlan()` and `parseTaskPlanFile()`. The task-plan renderer uses conservative frontmatter (`skills_used: []`) so no speculative values leak from DB state. The slice-plan renderer sources verification/observability content from DB fields when present. Critically, `renderPlanFromDb()` eagerly renders all child task-plan files so `verifyExpectedArtifact("plan-slice", ...)` sees a complete on-disk artifact set immediately. Auto-recovery tests proved rendered task-plan files satisfy the existing file-existence checks, and that deleting a rendered task-plan file correctly fails recovery.

T02 implemented the actual tool handlers — `handlePlanSlice()` and `handlePlanTask()` — following the S01 pattern: flat TypeBox validation → parent-existence check → transactional DB write → render → cache invalidation. A new `upsertTaskPlanning()` helper in `gsd-db.ts` updates planning-specific columns without clobbering completion state, enabling safe replanning of already-executed tasks. Both tools registered in `db-tools.ts` with canonical names (`gsd_plan_slice`, `gsd_plan_task`) plus aliases (`gsd_slice_plan`, `gsd_task_plan`). The test suite covers validation failures, missing-parent rejection, render-failure isolation, idempotent reruns, and parse-visible cache refresh.

T03 closed the prompt/contract gap. The plan-slice prompt (`plan-slice.md`) was updated to name `gsd_plan_slice` and `gsd_plan_task` as the primary write path (step 6), with direct file writes explicitly positioned as a degraded fallback (step 7). Four new prompt-contract tests and one template-substitution test ensure the tool names and framing survive prompt changes. This completed the transition from "tools are optional" to "tools are the expected default."

## Verification

All four slice-level verification commands pass (120/120 tests):

1. `plan-slice.test.ts` + `plan-task.test.ts` — 10/10: handler validation, parent checks, DB writes, render, cache invalidation, idempotence
2. `markdown-renderer.test.ts` + `auto-recovery.test.ts` + `prompt-contracts.test.ts` filtered to planning patterns — 60/60: renderer round-trip, task-plan file existence, stale-render detection, prompt contract alignment
3. `plan-slice.test.ts` + `plan-task.test.ts` filtered to failure/cache — 10/10: validation failures, render failures, missing-parent rejection, cache refresh
4. `prompt-contracts.test.ts` + `plan-slice-prompt.test.ts` filtered to plan-slice/DB-backed — 40/40: tool name assertions, degraded-fallback framing, per-task instruction, template substitution

## Requirements Advanced

- R014 — S02 renderers produce the artifacts that S04 cross-validation tests will compare against parsed state
- R015 — Both plan-slice and plan-task handlers invalidate state cache and parse cache after successful render, tested via parse-visible state assertions

## Requirements Validated

- R003 — plan-slice.test.ts proves flat payload validation, slice-exists check, DB write, S##-PLAN.md rendering, and cache invalidation
- R004 — plan-task.test.ts proves flat payload validation, parent-slice check, DB write, T##-PLAN.md rendering, and cache invalidation
- R008 — markdown-renderer.test.ts proves renderPlanFromDb() generates parse-compatible S##-PLAN.md and renderTaskPlanFromDb() generates T##-PLAN.md with frontmatter
- R019 — auto-recovery.test.ts proves task-plan files must exist on disk — verifyExpectedArtifact passes with files, fails without

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Deviations

T01 did not edit `src/resources/extensions/gsd/files.ts` — the existing parser contract already accepted the renderer output without changes. T02 added `upsertTaskPlanning()` as a narrow DB helper rather than modifying `insertTask()` semantics, which was not explicitly planned but necessary for safe replanning. The T01 summary had verification_result:mixed because the plan-slice.test.ts and plan-task.test.ts files did not exist yet at T01 execution time; T02 subsequently created them and all pass.

## Known Limitations

Task-plan frontmatter uses `skills_used: []` conservatively — skill activation remains execution-time only. The planning tools do not enforce task ordering within a slice; sequence is determined by insertion order. Cross-validation tests (DB state vs rendered-then-parsed state) are not yet implemented — that proof is S04's responsibility.

## Follow-ups

S03 needs the handler patterns from plan-slice.ts/plan-task.ts as templates for replan_slice and reassess_roadmap tools. S04 needs the query functions (getSliceTasks, getTask) and renderers (renderPlanFromDb, renderTaskPlanFromDb) as inputs for hot-path caller migration and cross-validation tests.

## Files Created/Modified

- `src/resources/extensions/gsd/markdown-renderer.ts` — Added renderPlanFromDb() and renderTaskPlanFromDb() — DB-backed renderers for S##-PLAN.md and T##-PLAN.md
- `src/resources/extensions/gsd/tools/plan-slice.ts` — New file — handlePlanSlice() tool handler: validate → DB write → render → cache invalidation
- `src/resources/extensions/gsd/tools/plan-task.ts` — New file — handlePlanTask() tool handler: validate → parent check → DB write → render → cache invalidation
- `src/resources/extensions/gsd/bootstrap/db-tools.ts` — Registered gsd_plan_slice and gsd_plan_task canonical tools plus gsd_slice_plan/gsd_task_plan aliases
- `src/resources/extensions/gsd/gsd-db.ts` — Added upsertTaskPlanning() helper for safe planning-field updates on existing task rows
- `src/resources/extensions/gsd/prompts/plan-slice.md` — Promoted gsd_plan_slice/gsd_plan_task to canonical write path (step 6), direct file writes to degraded fallback (step 7)
- `src/resources/extensions/gsd/tests/plan-slice.test.ts` — New file — 5 handler tests for gsd_plan_slice: validation, parent check, render, idempotence, cache
- `src/resources/extensions/gsd/tests/plan-task.test.ts` — New file — 5 handler tests for gsd_plan_task: validation, parent check, render, idempotence, cache
- `src/resources/extensions/gsd/tests/markdown-renderer.test.ts` — Extended with renderPlanFromDb/renderTaskPlanFromDb round-trip and failure tests
- `src/resources/extensions/gsd/tests/auto-recovery.test.ts` — Extended with rendered task-plan file existence and deletion tests for verifyExpectedArtifact
- `src/resources/extensions/gsd/tests/prompt-contracts.test.ts` — Added 4 assertions for plan-slice prompt: tool names, degraded fallback, per-task instruction
- `src/resources/extensions/gsd/tests/plan-slice-prompt.test.ts` — New file — template substitution test proving tool names survive variable replacement
- `.gsd/KNOWLEDGE.md` — Updated stale entry about missing test files, added ESM-safe testing pattern note
- `.gsd/PROJECT.md` — Updated current state to reflect S02 completion
