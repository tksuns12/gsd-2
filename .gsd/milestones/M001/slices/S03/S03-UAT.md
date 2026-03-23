# S03: replan_slice + reassess_roadmap with structural enforcement — UAT

**Milestone:** M001
**Written:** 2026-03-23T16:40:55.867Z

## UAT: S03 — replan_slice + reassess_roadmap with structural enforcement

### Preconditions
- Node.js available with `--experimental-strip-types` support
- Working directory is the gsd-2 project root
- No prior test artifacts from previous runs

### Test Case 1: Replan structural enforcement rejects completed task mutation
**Steps:**
1. Run `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/replan-handler.test.ts`
2. Verify "rejects structural violation: updating a completed task" passes
3. Verify "rejects structural violation: removing a completed task" passes
4. Verify "rejects task with status 'done' (alias for complete)" passes

**Expected:** All 3 structural rejection tests pass. Error payloads name the specific task ID.

### Test Case 2: Replan success path with DB persistence
**Steps:**
1. In the same test run, verify "succeeds when modifying only incomplete tasks" passes
2. Verify test confirms replan_history row exists in DB after success
3. Verify test confirms PLAN.md and REPLAN.md artifacts exist on disk
4. Verify "cache invalidation: re-parsing PLAN.md reflects mutations" passes

**Expected:** Successful replan writes DB row, renders both artifacts, and invalidates caches so re-parsing shows updated state.

### Test Case 3: Reassess structural enforcement rejects completed slice mutation
**Steps:**
1. Run `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/reassess-handler.test.ts`
2. Verify "rejects structural violation: modifying a completed slice" passes
3. Verify "rejects structural violation: removing a completed slice" passes
4. Verify "rejects slice with status 'done' (alias for complete)" passes

**Expected:** All 3 structural rejection tests pass. Error payloads name the specific slice ID.

### Test Case 4: Reassess success path with DB persistence
**Steps:**
1. In the same test run, verify "succeeds when modifying only pending slices" passes
2. Verify test confirms assessments row exists in DB after success
3. Verify test confirms ROADMAP.md and ASSESSMENT.md artifacts exist on disk
4. Verify "cache invalidation: getMilestoneSlices reflects mutations" passes

**Expected:** Successful reassess writes DB row, renders both artifacts, and invalidates caches.

### Test Case 5: Tool registration and prompt wiring
**Steps:**
1. Run `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/prompt-contracts.test.ts`
2. Verify "replan-slice prompt names gsd_replan_slice as canonical tool" passes
3. Verify "reassess-roadmap prompt names gsd_reassess_roadmap as canonical tool" passes
4. Run `grep -q 'gsd_replan_slice' src/resources/extensions/gsd/bootstrap/db-tools.ts && echo PASS`
5. Run `grep -q 'gsd_reassess_roadmap' src/resources/extensions/gsd/bootstrap/db-tools.ts && echo PASS`

**Expected:** Both prompt contract tests pass. Both grep checks output PASS.

### Test Case 6: Full regression — no breakage from S03 changes
**Steps:**
1. Run `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/plan-milestone.test.ts src/resources/extensions/gsd/tests/plan-slice.test.ts src/resources/extensions/gsd/tests/plan-task.test.ts src/resources/extensions/gsd/tests/markdown-renderer.test.ts src/resources/extensions/gsd/tests/rogue-file-detection.test.ts`
2. Verify all 25 regression tests pass

**Expected:** 25/25 pass, 0 failures. S03 changes to gsd-db.ts and markdown-renderer.ts introduced no regressions.

### Edge Cases
- Idempotency: calling replan/reassess twice with same params succeeds both times (covered by idempotency tests)
- Missing parent: replan with nonexistent slice returns clear error (covered by "missing parent slice" test)
- Missing milestone: reassess with nonexistent milestone returns clear error (covered by "missing milestone" test)
- Structured error payloads: error messages name specific task/slice IDs, not generic messages (covered by structured error payload tests)
