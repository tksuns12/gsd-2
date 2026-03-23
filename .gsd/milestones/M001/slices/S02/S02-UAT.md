# S02: plan_slice + plan_task tools + PLAN/task-plan renderers — UAT

**Milestone:** M001
**Written:** 2026-03-23T16:13:56.462Z

# S02: plan_slice + plan_task tools + PLAN/task-plan renderers — UAT

**Milestone:** M001
**Written:** 2026-03-23

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All S02 deliverables are tool handlers, renderers, and prompt changes that are fully testable via the resolver-harness test suite without a live runtime. The test suite covers round-trip parsing, file-existence checks, and prompt contract assertions.

## Preconditions

- Working tree has `src/resources/extensions/gsd/tests/resolve-ts.mjs` available
- Node.js supports `--experimental-strip-types` and `--import` flags
- No other processes hold locks on temp SQLite DBs created by tests

## Smoke Test

Run `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/plan-slice.test.ts src/resources/extensions/gsd/tests/plan-task.test.ts` — all 10 tests should pass, confirming both handlers accept valid input, reject invalid input, write to DB, render artifacts, and refresh caches.

## Test Cases

### 1. gsd_plan_slice writes planning state and renders S##-PLAN.md

1. Call `handlePlanSlice()` with a valid payload including milestoneId, sliceId, goal, demo, mustHaves, tasks array, and filesLikelyTouched.
2. Read the slice row from SQLite.
3. Read the rendered `S##-PLAN.md` from disk.
4. Parse the rendered file through `parsePlan()`.
5. **Expected:** DB row contains goal/demo/mustHaves fields. Rendered file exists on disk. Parsed result contains all tasks from the payload. All child `T##-PLAN.md` files exist on disk.

### 2. gsd_plan_task writes task planning and renders T##-PLAN.md

1. Create a slice row in DB.
2. Call `handlePlanTask()` with milestoneId, sliceId, taskId, title, why, files, steps, verifyCommand, doneWhen.
3. Read the task row from SQLite.
4. Read the rendered `tasks/T##-PLAN.md` from disk.
5. Parse through `parseTaskPlanFile()`.
6. **Expected:** DB row contains steps/files/verify_command fields. Rendered file has YAML frontmatter with `estimated_steps`, `estimated_files`, `skills_used: []`. Parsed result matches input fields.

### 3. Rendered plan artifacts satisfy auto-recovery checks

1. Seed a slice and tasks in DB.
2. Call `renderPlanFromDb()` to write S##-PLAN.md and all T##-PLAN.md files.
3. Call `verifyExpectedArtifact("plan-slice", basePath, milestoneId, sliceId)`.
4. **Expected:** Verification passes — all task-plan files exist and the plan file has real task content.

### 4. Missing task-plan file fails recovery verification

1. Render a complete plan from DB (S##-PLAN.md + T##-PLAN.md files).
2. Delete one `T##-PLAN.md` file from disk.
3. Call `verifyExpectedArtifact("plan-slice", ...)`.
4. **Expected:** Verification fails with a clear message about the missing task-plan file.

### 5. Validation rejects malformed payloads

1. Call `handlePlanSlice()` with missing required fields (e.g., no `goal`).
2. Call `handlePlanTask()` with missing required fields (e.g., no `taskId`).
3. **Expected:** Both return `{ error: true, message: "..." }` with validation failure details. No DB writes. No files created.

### 6. Missing parent slice is rejected

1. Call `handlePlanSlice()` with a sliceId that does not exist in DB.
2. Call `handlePlanTask()` with a sliceId that does not exist in DB.
3. **Expected:** Both return error results mentioning the missing parent. No DB writes.

### 7. Idempotent reruns refresh parse-visible state

1. Call `handlePlanSlice()` with a valid payload.
2. Call `handlePlanSlice()` again with modified goal text.
3. Read the re-rendered S##-PLAN.md from disk.
4. **Expected:** The file contains the updated goal, not the original. DB row reflects the latest values.

### 8. plan-slice prompt names DB-backed tools as canonical path

1. Read `src/resources/extensions/gsd/prompts/plan-slice.md`.
2. Check for `gsd_plan_slice` and `gsd_plan_task` in the text.
3. Check that direct file writes are described as "degraded" or "fallback".
4. **Expected:** Both tool names present. Direct writes framed as fallback, not default.

## Edge Cases

### Render failure does not corrupt parse-visible state

1. Seed a slice and task in DB with a valid plan.
2. Render the initial plan artifacts (S##-PLAN.md + T##-PLAN.md).
3. Simulate a render failure (e.g., invalid basePath).
4. **Expected:** Original files remain on disk unchanged. Error result returned. No cache invalidation occurs for the failed render.

### Task planning rerun preserves completion state

1. Insert a task row with `status: 'complete'` and a summary.
2. Call `handlePlanTask()` for the same task with new planning fields.
3. Read the task row from DB.
4. **Expected:** Planning fields (steps, files, verify_command) are updated. Completion fields (status, summary_content, completed_at) are preserved.

## Failure Signals

- Any of the 10 `plan-slice.test.ts` / `plan-task.test.ts` tests fail
- `parsePlan()` or `parseTaskPlanFile()` cannot parse rendered artifacts
- `verifyExpectedArtifact("plan-slice", ...)` fails when all task-plan files exist
- Prompt contract tests fail to find `gsd_plan_slice` / `gsd_plan_task` in plan-slice.md

## Requirements Proved By This UAT

- R003 — gsd_plan_slice flat tool validates, writes DB, renders S##-PLAN.md, invalidates caches
- R004 — gsd_plan_task flat tool validates, writes DB, renders T##-PLAN.md, invalidates caches
- R008 — renderPlanFromDb() and renderTaskPlanFromDb() generate parse-compatible plan artifacts
- R019 — Task-plan files are generated on disk and validated for existence by auto-recovery

## Not Proven By This UAT

- Cross-validation (DB state vs parsed state parity) — deferred to S04
- Hot-path caller migration from parser reads to DB reads — deferred to S04
- Replan/reassess structural enforcement — deferred to S03
- Live auto-mode integration (LLM actually calling these tools in a dispatch loop) — deferred to milestone UAT

## Notes for Tester

- All tests use temp directories and in-memory SQLite, so no cleanup needed.
- The resolver-harness (`resolve-ts.mjs`) is required — bare `node --test` may fail on `.js` sibling specifiers.
- T01's verification_result was "mixed" because plan-slice.test.ts didn't exist yet at T01 time. T02 created those files and all pass now.
