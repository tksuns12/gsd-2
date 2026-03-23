---
id: S03
parent: M001
milestone: M001
provides:
  - handleReplanSlice() — structural enforcement of completed tasks during replanning
  - handleReassessRoadmap() — structural enforcement of completed slices during reassessment
  - replan_history table populated with actual replan events
  - assessments table populated with actual assessments
  - REPLAN.md and ASSESSMENT.md rendered from DB (flag file equivalents for S05)
  - gsd_replan_slice and gsd_reassess_roadmap registered in db-tools.ts with aliases
  - DB helpers: insertReplanHistory(), insertAssessment(), deleteTask(), deleteSlice(), updateSliceFields(), getReplanHistory(), getAssessment()
  - Renderers: renderReplanFromDb(), renderAssessmentFromDb()
requires:
  - slice: S01
    provides: Schema v8 tables (replan_history, assessments), tool handler pattern from plan-milestone.ts, renderRoadmapFromDb()
  - slice: S02
    provides: getSliceTasks(), getTask(), upsertTaskPlanning(), insertTask(), insertSlice(), renderPlanFromDb(), renderTaskPlanFromDb()
affects:
  - S05
key_files:
  - src/resources/extensions/gsd/tools/replan-slice.ts
  - src/resources/extensions/gsd/tools/reassess-roadmap.ts
  - src/resources/extensions/gsd/gsd-db.ts
  - src/resources/extensions/gsd/markdown-renderer.ts
  - src/resources/extensions/gsd/bootstrap/db-tools.ts
  - src/resources/extensions/gsd/prompts/replan-slice.md
  - src/resources/extensions/gsd/prompts/reassess-roadmap.md
  - src/resources/extensions/gsd/tests/replan-handler.test.ts
  - src/resources/extensions/gsd/tests/reassess-handler.test.ts
  - src/resources/extensions/gsd/tests/prompt-contracts.test.ts
key_decisions:
  - deleteTask() cascades through verification_evidence before task row (no ON DELETE CASCADE in schema) — manual FK-aware deletion pattern
  - updateSliceFields() added separately from upsertSlicePlanning() to keep planning-level vs metadata-level DB APIs distinct
  - Structural enforcement checks both 'complete' and 'done' statuses as completed indicators — covers both status variants
patterns_established:
  - Structural enforcement pattern: query completed items → build Set → reject before transaction if any mutation targets completed items → return { error } naming specific ID
  - Handler error payloads include the specific entity ID that blocked the mutation — actionable diagnostics, not generic messages
  - Manual cascade deletion pattern for FK-constrained tables (evidence → tasks → slice) since schema lacks ON DELETE CASCADE
observability_surfaces:
  - replan_history DB table — queryable via getReplanHistory(db, milestoneId, sliceId)
  - assessments DB table — queryable via getAssessment(db, path)
  - REPLAN.md on disk — rendered at slices/S##/REPLAN.md with blocker description and mutation details
  - ASSESSMENT.md on disk — rendered at slices/S##/ASSESSMENT.md with verdict and assessment text
  - Handler error payloads — { error: string } naming the specific completed task/slice ID that blocked a mutation
drill_down_paths:
  - .gsd/milestones/M001/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S03/tasks/T02-SUMMARY.md
  - .gsd/milestones/M001/slices/S03/tasks/T03-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-03-23T16:40:55.867Z
blocker_discovered: false
---

# S03: replan_slice + reassess_roadmap with structural enforcement

**Delivered gsd_replan_slice and gsd_reassess_roadmap tools with structural enforcement that prevents mutations to completed tasks/slices, backed by DB persistence (replan_history, assessments tables) and rendered REPLAN.md/ASSESSMENT.md artifacts.**

## What Happened

S03 built the final two planning tools that complete the structural enforcement layer for the planning state machine.

**T01 — replan_slice handler:** Implemented `handleReplanSlice()` with the validate → enforce → transaction → render → invalidate pattern. Added four DB helpers to `gsd-db.ts`: `insertReplanHistory()`, `insertAssessment()`, `deleteTask()` (with FK-aware cascade through verification_evidence), and `deleteSlice()` (cascade: evidence → tasks → slice). Added `renderReplanFromDb()` and `renderAssessmentFromDb()` to `markdown-renderer.ts` using the `writeAndStore()` pattern. The handler queries `getSliceTasks()`, builds a Set of completed task IDs (status 'complete' or 'done'), and returns a structured `{ error }` naming the specific task ID if any mutation targets a completed task. On success: writes replan_history row, applies task upserts/inserts/deletes in a transaction, then re-renders PLAN.md and writes REPLAN.md. 9 tests cover validation, structural rejection (both update and remove), success path with DB persistence, cache invalidation, idempotency, missing parent, "done" alias, and structured error payloads.

**T02 — reassess_roadmap handler:** Implemented `handleReassessRoadmap()` with the same pattern at the milestone/slice level. Added `updateSliceFields()` to `gsd-db.ts` for title/risk/depends/demo updates (distinct from `upsertSlicePlanning()` which handles planning-level fields). Added `getAssessment()` query helper. The handler queries `getMilestoneSlices()` for completed slices and rejects modifications or removals to them. On success: writes assessments row, applies slice modifications/additions/deletions in a transaction, then re-renders ROADMAP.md and writes ASSESSMENT.md. 9 matching tests.

**T03 — Tool registration + prompts:** Registered `gsd_replan_slice` (alias `gsd_slice_replan`) and `gsd_reassess_roadmap` (alias `gsd_roadmap_reassess`) in `db-tools.ts` with TypeBox schemas matching handler params. Updated `replan-slice.md` and `reassess-roadmap.md` prompts to position the DB-backed tools as canonical write paths with direct file writes as degraded fallback. Extended `prompt-contracts.test.ts` to 28 tests including 2 new tool-name assertions.

All verification passed: 9/9 replan tests, 9/9 reassess tests, 28/28 prompt contract tests, 25/25 regression tests.

## Verification

All slice-level verification checks from the plan passed:

1. **Replan handler tests** (9/9 pass, ~337ms): validation failures, structural rejection of completed task update, structural rejection of completed task removal, successful replan with DB persistence, cache invalidation, idempotency, missing parent slice, "done" status alias, structured error payloads.

2. **Reassess handler tests** (9/9 pass, ~322ms): validation failures, missing milestone, structural rejection of completed slice modification, structural rejection of completed slice removal, successful reassess with DB persistence, cache invalidation, idempotency, "done" status alias, structured error payloads.

3. **Prompt contract tests** (28/28 pass, ~205ms): includes 2 new assertions that replan-slice.md contains `gsd_replan_slice` and reassess-roadmap.md contains `gsd_reassess_roadmap`.

4. **Full regression suite** (25/25 pass, ~723ms): plan-milestone, plan-slice, plan-task, markdown-renderer, rogue-file-detection — no regressions from gsd-db.ts/markdown-renderer.ts changes.

5. **Diagnostic grep**: Both test files contain structured error payload assertions (1 each).

## Requirements Advanced

None.

## Requirements Validated

- R005 — replan-handler.test.ts: 9 tests prove structural rejection of completed task updates/removals, DB persistence of replan_history, re-rendered PLAN.md + REPLAN.md, cache invalidation
- R006 — reassess-handler.test.ts: 9 tests prove structural rejection of completed slice modifications/removals, DB persistence of assessments, re-rendered ROADMAP.md + ASSESSMENT.md, cache invalidation
- R013 — prompt-contracts.test.ts: replan-slice.md contains gsd_replan_slice, reassess-roadmap.md contains gsd_reassess_roadmap — extends existing R013 validation from S01
- R015 — Both handlers call invalidateStateCache() and clearParseCache() after success — tested via cache invalidation tests in replan-handler.test.ts and reassess-handler.test.ts

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Deviations

Minor additive deviations only — all strengthened the implementation:
- Added `getReplanHistory()` and `getAssessment()` query helpers to gsd-db.ts (not in plan) — needed for test DB persistence assertions.
- Added `updateSliceFields()` to gsd-db.ts — needed because `upsertSlicePlanning()` only handles planning-level fields, not basic slice metadata the reassess handler modifies.
- 3 extra tests per handler beyond the minimum specified in the plan (missing parent, "done" alias, structured error payloads).

## Known Limitations

None.

## Follow-ups

None.

## Files Created/Modified

- `src/resources/extensions/gsd/gsd-db.ts` — Added insertReplanHistory(), insertAssessment(), deleteTask(), deleteSlice(), getReplanHistory(), getAssessment(), updateSliceFields() DB helper functions
- `src/resources/extensions/gsd/markdown-renderer.ts` — Added renderReplanFromDb() and renderAssessmentFromDb() using writeAndStore() pattern
- `src/resources/extensions/gsd/tools/replan-slice.ts` — New file — handleReplanSlice() with structural enforcement of completed tasks
- `src/resources/extensions/gsd/tools/reassess-roadmap.ts` — New file — handleReassessRoadmap() with structural enforcement of completed slices
- `src/resources/extensions/gsd/bootstrap/db-tools.ts` — Registered gsd_replan_slice (alias gsd_slice_replan) and gsd_reassess_roadmap (alias gsd_roadmap_reassess) with TypeBox schemas
- `src/resources/extensions/gsd/prompts/replan-slice.md` — Added gsd_replan_slice as canonical write path, repositioned direct file writes as degraded fallback
- `src/resources/extensions/gsd/prompts/reassess-roadmap.md` — Added gsd_reassess_roadmap as canonical write path with full parameter documentation
- `src/resources/extensions/gsd/tests/replan-handler.test.ts` — New file — 9 tests for handleReplanSlice covering validation, structural enforcement, DB persistence, rendering, cache invalidation, idempotency
- `src/resources/extensions/gsd/tests/reassess-handler.test.ts` — New file — 9 tests for handleReassessRoadmap covering validation, structural enforcement, DB persistence, rendering, cache invalidation, idempotency
- `src/resources/extensions/gsd/tests/prompt-contracts.test.ts` — Added 2 new tests asserting replan-slice.md and reassess-roadmap.md name their canonical tools
