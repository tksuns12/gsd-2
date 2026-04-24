// GSD-2 — #4782 phase 2 composer tests. Pure-function tests using mock
// resolvers plus an integration check that reassess-roadmap's migrated
// builder produces a prompt matching expectations.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  composeInlinedContext,
  manifestBudgetChars,
  type ArtifactResolver,
} from "../unit-context-composer.ts";
import type { ArtifactKey } from "../unit-context-manifest.ts";
import { buildReassessRoadmapPrompt } from "../auto-prompts.ts";
import { invalidateAllCaches } from "../cache.ts";
import {
  openDatabase,
  closeDatabase,
  insertMilestone,
  upsertMilestonePlanning,
  insertSlice,
} from "../gsd-db.ts";

// ─── Pure composer tests ──────────────────────────────────────────────────

test("#4782 composer: returns empty string for unknown unit type", async () => {
  const out = await composeInlinedContext("never-dispatched", async () => "body");
  assert.strictEqual(out, "");
});

test("#4782 composer: walks the manifest's inline list in declared order", async () => {
  // reassess-roadmap manifest: [roadmap, slice-context, slice-summary, project, requirements, decisions]
  const calls: ArtifactKey[] = [];
  const resolver: ArtifactResolver = async (key) => {
    calls.push(key);
    return `BODY:${key}`;
  };
  const out = await composeInlinedContext("reassess-roadmap", resolver);
  assert.deepEqual(calls, [
    "roadmap",
    "slice-context",
    "slice-summary",
    "project",
    "requirements",
    "decisions",
  ]);
  // Output joins blocks with the "---" separator.
  assert.match(out, /BODY:roadmap\n\n---\n\nBODY:slice-context/);
});

test("#4782 composer: null-returning resolvers are silently omitted", async () => {
  const resolver: ArtifactResolver = async (key) => {
    if (key === "slice-context" || key === "project") return null;
    return `BODY:${key}`;
  };
  const out = await composeInlinedContext("reassess-roadmap", resolver);
  // slice-context + project skipped — not in output, no empty blocks
  assert.ok(!out.includes("BODY:slice-context"));
  assert.ok(!out.includes("BODY:project"));
  // Remaining keys still emitted in declared order
  assert.match(out, /BODY:roadmap\n\n---\n\nBODY:slice-summary\n\n---\n\nBODY:requirements\n\n---\n\nBODY:decisions/);
});

test("#4782 composer: empty-string resolvers are omitted (treated as no-op)", async () => {
  const resolver: ArtifactResolver = async (key) => {
    if (key === "slice-context") return "";
    if (key === "slice-summary") return null;
    return `BODY:${key}`;
  };
  const out = await composeInlinedContext("reassess-roadmap", resolver);
  assert.ok(!out.includes("BODY:slice-context"));
  assert.ok(!out.includes("BODY:slice-summary"));
  // Must not leave double-separators when blocks are skipped
  assert.ok(!out.includes("---\n\n---"));
});

test("#4782 composer: resolver errors surface to caller", async () => {
  const resolver: ArtifactResolver = async () => {
    throw new Error("resolver boom");
  };
  await assert.rejects(
    () => composeInlinedContext("reassess-roadmap", resolver),
    /resolver boom/,
  );
});

test("#4782 composer: manifestBudgetChars returns declared budget", () => {
  const small = manifestBudgetChars("reassess-roadmap");
  assert.ok(small !== null && small > 0);
  assert.strictEqual(manifestBudgetChars("never-dispatched"), null);
});

// ─── Integration: migrated buildReassessRoadmapPrompt ─────────────────────

function makeFixtureBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-composer-pilot-"));
  mkdirSync(join(base, ".gsd", "milestones", "M001", "slices", "S01", "tasks"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  try { closeDatabase(); } catch { /* noop */ }
  invalidateAllCaches();
  rmSync(base, { recursive: true, force: true });
}

function seed(base: string, mid: string): void {
  openDatabase(join(base, ".gsd", "gsd.db"));
  insertMilestone({ id: mid, title: "Test", status: "active", depends_on: [] });
  upsertMilestonePlanning(mid, {
    title: "Test",
    status: "active",
    vision: "Ship it",
    successCriteria: ["It ships"],
    keyRisks: [],
    proofStrategy: [],
    verificationContract: "",
    verificationIntegration: "",
    verificationOperational: "",
    verificationUat: "",
    definitionOfDone: [],
    requirementCoverage: "",
    boundaryMapMarkdown: "",
  });
  insertSlice({
    id: "S01",
    milestoneId: mid,
    title: "First",
    status: "complete",
    risk: "low",
    depends: [],
    demo: "",
    sequence: 1,
  });
}

function writeArtifacts(base: string): void {
  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
    "# M001\n## Slices\n- [x] **S01: First** `risk:low` `depends:[]`\n",
  );
  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "slices", "S01", "S01-SUMMARY.md"),
    "---\nid: S01\nparent: M001\n---\n# S01 Summary\n**One-liner**\n\n## What Happened\nDone.\n",
  );
}

test("#4782 phase 2: buildReassessRoadmapPrompt emits composer-shaped context with manifest-declared artifacts", async (t) => {
  const base = makeFixtureBase();
  t.after(() => cleanup(base));
  invalidateAllCaches();

  seed(base, "M001");
  writeArtifacts(base);

  const prompt = await buildReassessRoadmapPrompt("M001", "Test", "S01", base);

  // Context block wrapper from capPreamble
  assert.match(prompt, /## Inlined Context \(preloaded — do not re-read these files\)/);

  // Roadmap inlined first (manifest order)
  assert.match(prompt, /### Current Roadmap/);
  assert.match(prompt, /S01: First/);

  // Slice summary present
  assert.match(prompt, /### S01 Summary/);
  assert.match(prompt, /One-liner/);

  // Slice context is optional and not present in this fixture — must not
  // leave a stray empty section
  assert.ok(!prompt.includes("Slice Context (from discussion)"));
});
