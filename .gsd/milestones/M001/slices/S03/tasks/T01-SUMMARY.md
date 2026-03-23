---
id: T01
parent: S03
milestone: M001
key_files:
  - src/resources/extensions/gsd/gsd-db.ts
  - src/resources/extensions/gsd/markdown-renderer.ts
  - src/resources/extensions/gsd/tools/replan-slice.ts
  - src/resources/extensions/gsd/tests/replan-handler.test.ts
  - .gsd/milestones/M001/slices/S03/S03-PLAN.md
key_decisions:
  - deleteTask() deletes verification_evidence before task row to avoid FK constraint violations — cascade-style manual deletion pattern
  - Structural enforcement checks both 'complete' and 'done' statuses as completed-task indicators
  - Error payloads include the specific task ID that blocked the mutation for actionable diagnostics
observability_surfaces:
  - "replan_history DB table — query with getReplanHistory(db, milestoneId, sliceId) to inspect replan events"
  - "REPLAN.md artifact on disk — rendered at slices/S##/REPLAN.md with blocker description and what changed"
  - "Handler error payloads — { error: string } naming the specific completed task ID that blocked the mutation"
duration: ""
verification_result: passed
completed_at: 2026-03-23T16:28:29.943Z
blocker_discovered: false
---

# T01: Implement replan_slice handler with structural enforcement, DB helpers, renderers, and tests

**Implement replan_slice handler with structural enforcement, DB helpers, renderers, and tests**

## What Happened

Built the `handleReplanSlice()` handler that structurally enforces preservation of completed tasks during replanning, following the validate → enforce → transaction → render → invalidate pattern from `plan-slice.ts`.

**Step 1 — DB helpers in `gsd-db.ts`:** Added four new exported functions: `insertReplanHistory()` writes to the `replan_history` table, `insertAssessment()` does INSERT OR REPLACE into `assessments`, `deleteTask()` handles FK constraints by deleting `verification_evidence` rows before the task row, and `deleteSlice()` performs cascade-style manual deletion (evidence → tasks → slice). Also added `getReplanHistory()` query helper for test assertions.

**Step 2 — Renderers in `markdown-renderer.ts`:** Added `renderReplanFromDb()` which generates REPLAN.md with blocker description, what changed, and metadata sections using `writeAndStore()` with artifact_type "REPLAN". Added `renderAssessmentFromDb()` which generates ASSESSMENT.md with verdict and assessment text using artifact_type "ASSESSMENT". Both resolve slice paths via `resolveSlicePath()` with fallback.

**Step 3 — Handler in `tools/replan-slice.ts`:** Created `handleReplanSlice()` with full validation of all required fields. Queries `getSliceTasks()` and builds a Set of completed task IDs (status === 'complete' || status === 'done'). Returns specific `{ error }` naming the exact task ID when any `updatedTasks[].taskId` or `removedTaskIds` element matches a completed task. In transaction: inserts replan_history row, upserts or inserts updated tasks, deletes removed tasks. After transaction: re-renders PLAN.md via `renderPlanFromDb()`, writes REPLAN.md via `renderReplanFromDb()`, invalidates both state cache and parse cache.

**Step 4 — Tests in `tests/replan-handler.test.ts`:** Wrote 9 tests following the exact `plan-slice.test.ts` pattern (makeTmpBase, openDatabase, cleanup, seed). Tests cover: validation failure, structural rejection of completed task update, structural rejection of completed task removal, successful replan (verifies DB persistence of replan_history, task mutations, rendered artifacts), cache invalidation via re-parse, idempotent rerun, missing parent slice, "done" status alias handling, and structured error payload verification.

**Pre-flight fix:** Added diagnostic verification step to S03-PLAN.md Verification section confirming structured error payload tests exist.

## Verification

Ran `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/replan-handler.test.ts` — all 9 tests pass (9/9, 0 failures, ~180ms). Ran full regression suite across plan-milestone, plan-slice, plan-task, markdown-renderer, and rogue-file-detection tests — all 25 tests pass (0 failures). Structural rejection tests prove completed tasks (both "complete" and "done" statuses) cannot be mutated or removed. DB persistence tests verify replan_history rows exist with correct metadata after successful replan. Rendered PLAN.md and REPLAN.md artifacts verified on disk.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/replan-handler.test.ts` | 0 | ✅ pass | 253ms |
| 2 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/plan-milestone.test.ts src/resources/extensions/gsd/tests/plan-slice.test.ts src/resources/extensions/gsd/tests/plan-task.test.ts src/resources/extensions/gsd/tests/markdown-renderer.test.ts src/resources/extensions/gsd/tests/rogue-file-detection.test.ts` | 0 | ✅ pass | 609ms |
| 3 | `grep -c 'structured error payloads' src/resources/extensions/gsd/tests/replan-handler.test.ts` | 0 | ✅ pass | 10ms |


## Deviations

Added `getReplanHistory()` query helper to `gsd-db.ts` (not in plan) — needed for test assertions to verify DB persistence. Added 3 extra tests beyond the plan's 6: missing parent slice error, "done" status alias handling, and structured error payloads with specific task IDs — strengthens observability coverage.

## Known Issues

None.

## Diagnostics

- **Inspect replan history:** `getReplanHistory(db, milestoneId, sliceId)` returns all replan events for a slice including blocker description, what changed, and timestamps.
- **Verify structural enforcement:** Run `replan-handler.test.ts` — tests "rejects structural violation: updating a completed task" and "removing a completed task" prove the enforcement gate.
- **Check rendered artifacts:** After a successful replan, `REPLAN.md` exists at `slices/S##/REPLAN.md` and PLAN.md is re-rendered with updated tasks.
- **Error payloads:** Handler returns `{ error: "Cannot update/remove completed task T##..." }` with the specific task ID.

## Files Created/Modified

- `src/resources/extensions/gsd/gsd-db.ts`
- `src/resources/extensions/gsd/markdown-renderer.ts`
- `src/resources/extensions/gsd/tools/replan-slice.ts`
- `src/resources/extensions/gsd/tests/replan-handler.test.ts`
- `.gsd/milestones/M001/slices/S03/S03-PLAN.md`
