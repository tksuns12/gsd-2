---
id: T02
parent: S03
milestone: M001
key_files:
  - src/resources/extensions/gsd/tools/reassess-roadmap.ts
  - src/resources/extensions/gsd/tests/reassess-handler.test.ts
  - src/resources/extensions/gsd/gsd-db.ts
key_decisions:
  - Added updateSliceFields() to gsd-db.ts for title/risk/depends/demo updates because upsertSlicePlanning() only handles planning-level fields (goal, success_criteria, etc.) — keeps DB API consistent rather than using raw SQL in the handler
  - Added getAssessment() query helper to gsd-db.ts for test verification of assessments DB persistence — follows the same pattern as getReplanHistory() added in T01
observability_surfaces:
  - "assessments DB table — query with getAssessment(db, path) to inspect assessment events"
  - "ASSESSMENT.md artifact on disk — rendered at slices/S##/ASSESSMENT.md with verdict and assessment text"
  - "Handler error payloads — { error: string } naming the specific completed slice ID that blocked the mutation"
duration: ""
verification_result: passed
completed_at: 2026-03-23T16:32:59.273Z
blocker_discovered: false
---

# T02: Implement reassess_roadmap handler with structural enforcement, DB persistence, and tests

**Implement reassess_roadmap handler with structural enforcement, DB persistence, and tests**

## What Happened

Built the `handleReassessRoadmap()` handler in `tools/reassess-roadmap.ts` following the identical validate → enforce → transaction → render → invalidate pattern established by `handleReplanSlice()` in T01, but operating at the milestone/slice level instead of slice/task level.

**Handler implementation:** Validates all required fields including `sliceChanges` object with `modified`, `added`, and `removed` arrays. Queries `getMilestone()` to verify milestone exists. Queries `getMilestoneSlices()` and builds a Set of completed slice IDs (status === 'complete' || status === 'done'). Structural enforcement rejects any `sliceChanges.modified[].sliceId` or `sliceChanges.removed[]` element that matches a completed slice, returning `{ error }` naming the specific slice ID. In transaction: writes `assessments` row via `insertAssessment()` with path PK, applies slice modifications via `updateSliceFields()`, inserts new slices via `insertSlice()`, deletes removed slices via `deleteSlice()`. After transaction: re-renders ROADMAP.md via `renderRoadmapFromDb()`, writes ASSESSMENT.md via `renderAssessmentFromDb()`, invalidates both state cache and parse cache.

**DB helper addition:** Added `updateSliceFields()` to `gsd-db.ts` — a targeted function that updates title/risk/depends/demo on existing slice rows. This was needed because `upsertSlicePlanning()` only handles planning fields (goal, success_criteria, etc.), not the basic slice metadata the reassess handler needs to modify. Also added `getAssessment()` query helper for test assertions.

**Tests:** Wrote 9 tests in `reassess-handler.test.ts` following the exact pattern from `replan-handler.test.ts`. Tests cover: validation failure (missing milestoneId), missing milestone, structural rejection of completed slice modification, structural rejection of completed slice removal, successful reassess (verifies DB persistence of assessments row, slice mutations, rendered artifacts on disk), cache invalidation via getMilestoneSlices, idempotent rerun, "done" status alias handling, and structured error payload verification with specific slice IDs.

## Verification

Ran `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/reassess-handler.test.ts` — all 9 tests pass (0 failures, ~174ms). Ran replan handler tests — 9/9 pass (no regressions from gsd-db.ts changes). Ran full regression suite (plan-milestone, plan-slice, plan-task, markdown-renderer, rogue-file-detection) — 25/25 pass. Ran prompt contract tests — 26/26 pass. Diagnostic grep confirms both test files contain structured error payload assertions.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/reassess-handler.test.ts` | 0 | ✅ pass | 174ms |
| 2 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/replan-handler.test.ts` | 0 | ✅ pass | 293ms |
| 3 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/plan-milestone.test.ts src/resources/extensions/gsd/tests/plan-slice.test.ts src/resources/extensions/gsd/tests/plan-task.test.ts src/resources/extensions/gsd/tests/markdown-renderer.test.ts src/resources/extensions/gsd/tests/rogue-file-detection.test.ts` | 0 | ✅ pass | 645ms |
| 4 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/prompt-contracts.test.ts` | 0 | ✅ pass | 116ms |
| 5 | `grep -c 'structured error payloads' src/resources/extensions/gsd/tests/replan-handler.test.ts src/resources/extensions/gsd/tests/reassess-handler.test.ts` | 0 | ✅ pass | 10ms |


## Deviations

Added `updateSliceFields()` to `gsd-db.ts` (not in task plan's expected output) — needed because `upsertSlicePlanning()` only handles planning fields, not the basic slice fields (title/risk/depends/demo) that the reassess handler modifies. Also added `getAssessment()` query helper for test DB persistence assertions.

## Known Issues

None.

## Diagnostics

- **Inspect assessments:** `getAssessment(db, path)` returns the assessment row for a given artifact path.
- **Verify structural enforcement:** Run `reassess-handler.test.ts` — tests "rejects structural violation: modifying a completed slice" and "removing a completed slice" prove the enforcement gate.
- **Check rendered artifacts:** After a successful reassess, `ASSESSMENT.md` exists at `slices/S##/ASSESSMENT.md` and ROADMAP.md is re-rendered.
- **Error payloads:** Handler returns `{ error: "Cannot modify/remove completed slice S##..." }` with the specific slice ID.

## Files Created/Modified

- `src/resources/extensions/gsd/tools/reassess-roadmap.ts`
- `src/resources/extensions/gsd/tests/reassess-handler.test.ts`
- `src/resources/extensions/gsd/gsd-db.ts`
