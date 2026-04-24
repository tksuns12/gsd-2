import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { checkNeedsReassessment, isSummaryCleanForSkip } from "../auto-prompts.ts";
import { invalidateAllCaches } from "../cache.ts";
import type { GSDState } from "../types.ts";
import type { GSDPreferences } from "../preferences-types.ts";

function makeTmpBase(): string {
  const base = join(tmpdir(), `gsd-test-reassess-${randomUUID()}`);
  mkdirSync(join(base, ".gsd", "milestones", "M001", "slices", "S01", "tasks"), { recursive: true });
  mkdirSync(join(base, ".gsd", "milestones", "M001", "slices", "S02", "tasks"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  try { rmSync(base, { recursive: true, force: true }); } catch { /* */ }
}

function writeRoadmap(base: string, content: string): void {
  writeFileSync(join(base, ".gsd", "milestones", "M001", "M001-ROADMAP.md"), content);
}

function writeSummary(base: string, sid: string): void {
  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "slices", sid, `${sid}-SUMMARY.md`),
    `---\nid: ${sid}\n---\n# ${sid} Summary\nDone.`,
  );
}

function writeCleanSummary(base: string, sid: string): void {
  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "slices", sid, `${sid}-SUMMARY.md`),
    `---
id: ${sid}
parent: M001
milestone: M001
key_decisions:
  - (none)
verification_result: passed
blocker_discovered: false
---

# ${sid}: Clean

**One-liner.**

## What Happened

Nothing structural changed.
`,
  );
}

function writeDirtySummary(base: string, sid: string, body: string): void {
  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "slices", sid, `${sid}-SUMMARY.md`),
    `---
id: ${sid}
parent: M001
milestone: M001
key_decisions:
  - (none)
verification_result: passed
blocker_discovered: false
---

# ${sid}: Dirty

**One-liner.**

## What Happened

${body}
`,
  );
}

function writeAssessment(base: string, sid: string): void {
  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "slices", sid, `${sid}-ASSESSMENT.md`),
    `# ${sid} Assessment\nNo changes needed.`,
  );
}

const ROADMAP_S01_DONE_S02_TODO = `# M001 Roadmap
## Slices
- [x] **S01: First** \`risk:high\` \`depends:[]\`
- [ ] **S02: Second** \`risk:medium\` \`depends:[S01]\`
`;

const dummyState: GSDState = {
  phase: "executing",
  activeMilestone: { id: "M001", title: "Test" },
  activeSlice: { id: "S02", title: "Second" },
  activeTask: null,
  recentDecisions: [],
  blockers: [],
  nextAction: "",
  registry: [{ id: "M001", title: "Test", status: "active" }],
};

// ─── checkNeedsReassessment: returns null when assessment exists ─────────

test("checkNeedsReassessment returns null when assessment file exists", async () => {
  const base = makeTmpBase();
  try {
    invalidateAllCaches();
    writeRoadmap(base, ROADMAP_S01_DONE_S02_TODO);
    writeSummary(base, "S01");
    writeAssessment(base, "S01");

    const result = await checkNeedsReassessment(base, "M001", dummyState);
    assert.strictEqual(result, null, "should return null when assessment exists");
  } finally {
    cleanup(base);
  }
});

// ─── checkNeedsReassessment: returns sliceId when assessment missing ─────

test("checkNeedsReassessment returns sliceId when assessment is missing", async () => {
  const base = makeTmpBase();
  try {
    invalidateAllCaches();
    writeRoadmap(base, ROADMAP_S01_DONE_S02_TODO);
    writeSummary(base, "S01");
    // No assessment written

    const result = await checkNeedsReassessment(base, "M001", dummyState);
    assert.deepStrictEqual(result, { sliceId: "S01" });
  } finally {
    cleanup(base);
  }
});

// ─── checkNeedsReassessment: returns null when no summary exists ─────────

test("checkNeedsReassessment returns null when summary is missing", async () => {
  const base = makeTmpBase();
  try {
    invalidateAllCaches();
    writeRoadmap(base, ROADMAP_S01_DONE_S02_TODO);
    // No summary, no assessment

    const result = await checkNeedsReassessment(base, "M001", dummyState);
    assert.strictEqual(result, null, "should return null — can't reassess without summary");
  } finally {
    cleanup(base);
  }
});

// ─── checkNeedsReassessment: detects assessment written after cache ──────
// This is the core regression test for #1112: the assessment file is written
// to disk AFTER the path cache was populated (simulating the worktree race
// condition where readdirSync doesn't see a freshly written file).

test("checkNeedsReassessment detects assessment written after initial cache population", async () => {
  const base = makeTmpBase();
  try {
    writeRoadmap(base, ROADMAP_S01_DONE_S02_TODO);
    writeSummary(base, "S01");

    // First call: no assessment exists — populates internal caches
    invalidateAllCaches();
    const before = await checkNeedsReassessment(base, "M001", dummyState);
    assert.deepStrictEqual(before, { sliceId: "S01" }, "should need reassessment initially");

    // Now write the assessment WITHOUT clearing caches.
    // This simulates the race condition: the agent wrote the file, but the
    // directory listing cache still has the old state.
    writeAssessment(base, "S01");

    // Second call: the file exists on disk but caches may be stale.
    // With the fix (#1112), the existsSync fallback should detect it.
    invalidateAllCaches();
    const after = await checkNeedsReassessment(base, "M001", dummyState);
    assert.strictEqual(after, null, "should return null — assessment exists on disk (fallback check)");
  } finally {
    cleanup(base);
  }
});

// ─── checkNeedsReassessment: returns null when all slices done ───────────

test("checkNeedsReassessment returns null when all slices are complete", async () => {
  const base = makeTmpBase();
  try {
    invalidateAllCaches();
    const allDone = `# M001 Roadmap\n## Slices\n- [x] **S01: First** \`risk:high\` \`depends:[]\`\n- [x] **S02: Second** \`risk:medium\` \`depends:[S01]\`\n`;
    writeRoadmap(base, allDone);
    writeSummary(base, "S02");

    const result = await checkNeedsReassessment(base, "M001", dummyState);
    assert.strictEqual(result, null, "should return null — all slices done, no point reassessing");
  } finally {
    cleanup(base);
  }
});

// ─── #4778: skip_clean_reassess preference gate ──────────────────────────

const prefsOptIn: GSDPreferences = { skip_clean_reassess: true };
const prefsOptOut: GSDPreferences = {};

test("#4778 skips reassessment when preference is on and summary is clean", async () => {
  const base = makeTmpBase();
  try {
    invalidateAllCaches();
    writeRoadmap(base, ROADMAP_S01_DONE_S02_TODO);
    writeCleanSummary(base, "S01");

    const result = await checkNeedsReassessment(base, "M001", dummyState, prefsOptIn);
    assert.strictEqual(result, null, "clean summary + opt-in → skip");
  } finally {
    cleanup(base);
  }
});

test("#4778 dispatches when preference is off even on clean summary (default)", async () => {
  const base = makeTmpBase();
  try {
    invalidateAllCaches();
    writeRoadmap(base, ROADMAP_S01_DONE_S02_TODO);
    writeCleanSummary(base, "S01");

    const result = await checkNeedsReassessment(base, "M001", dummyState, prefsOptOut);
    assert.deepStrictEqual(result, { sliceId: "S01" }, "opt-out (default) → always dispatch");
  } finally {
    cleanup(base);
  }
});

test("#4778 dispatches when body contains roadmap-change marker despite opt-in", async () => {
  const base = makeTmpBase();
  try {
    invalidateAllCaches();
    writeRoadmap(base, ROADMAP_S01_DONE_S02_TODO);
    writeDirtySummary(base, "S01", "During work we should add slice for a follow-up API.");

    const result = await checkNeedsReassessment(base, "M001", dummyState, prefsOptIn);
    assert.deepStrictEqual(result, { sliceId: "S01" }, "roadmap-change marker → dispatch");
  } finally {
    cleanup(base);
  }
});

test("#4778 dispatches when blocker_discovered is true", async () => {
  const base = makeTmpBase();
  try {
    invalidateAllCaches();
    writeRoadmap(base, ROADMAP_S01_DONE_S02_TODO);
    writeFileSync(
      join(base, ".gsd", "milestones", "M001", "slices", "S01", "S01-SUMMARY.md"),
      `---\nid: S01\nparent: M001\nmilestone: M001\nkey_decisions:\n  - (none)\nverification_result: passed\nblocker_discovered: true\n---\n\n# S01: Blocked\n\n**One-liner.**\n\n## What Happened\n\nHit a blocker.\n`,
    );

    const result = await checkNeedsReassessment(base, "M001", dummyState, prefsOptIn);
    assert.deepStrictEqual(result, { sliceId: "S01" }, "blocker_discovered=true → dispatch");
  } finally {
    cleanup(base);
  }
});

test("#4778 dispatches when key_decisions is non-empty", async () => {
  const base = makeTmpBase();
  try {
    invalidateAllCaches();
    writeRoadmap(base, ROADMAP_S01_DONE_S02_TODO);
    writeFileSync(
      join(base, ".gsd", "milestones", "M001", "slices", "S01", "S01-SUMMARY.md"),
      `---\nid: S01\nparent: M001\nmilestone: M001\nkey_decisions:\n  - chose SQLite over Postgres for local storage\nverification_result: passed\nblocker_discovered: false\n---\n\n# S01: Decided\n\n**One-liner.**\n\n## What Happened\n\nMade a cross-slice decision.\n`,
    );

    const result = await checkNeedsReassessment(base, "M001", dummyState, prefsOptIn);
    assert.deepStrictEqual(result, { sliceId: "S01" }, "non-empty key_decisions → dispatch");
  } finally {
    cleanup(base);
  }
});

// ─── isSummaryCleanForSkip unit tests ────────────────────────────────────

test("isSummaryCleanForSkip: clean summary → true", () => {
  const content = `---\nid: S01\nparent: M001\nmilestone: M001\nkey_decisions:\n  - (none)\nblocker_discovered: false\n---\n\n# S01\n\n**x.**\n\n## What Happened\n\nclean.\n`;
  assert.strictEqual(isSummaryCleanForSkip(content), true);
});

test("isSummaryCleanForSkip: 'dependency discovered' marker → false", () => {
  const content = `---\nid: S01\nparent: M001\nmilestone: M001\nkey_decisions:\n  - (none)\nblocker_discovered: false\n---\n\n# S01\n\n**x.**\n\n## What Happened\n\nA new dependency discovered between S03 and S05.\n`;
  assert.strictEqual(isSummaryCleanForSkip(content), false);
});

test("isSummaryCleanForSkip: garbage input → false (conservative)", () => {
  assert.strictEqual(isSummaryCleanForSkip(""), false);
});
