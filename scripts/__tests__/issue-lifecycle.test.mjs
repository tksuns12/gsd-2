// Project/App: GSD-2
// File Purpose: Regression tests for canonical issue lifecycle comments and sweep policy.

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLifecycleComment,
  buildNeedsInfoSweepComment,
  buildNeedsInfoSweepQuery,
  daysAgoIsoDate,
  hasLifecycleComment,
  lifecycleMarker,
} from "../issue-lifecycle.mjs";

test("buildLifecycleComment returns comments for canonical lifecycle labels", () => {
  const comment = buildLifecycleComment("needs-info");

  assert.match(comment, /needs a bit more information/);
  assert.match(comment, new RegExp(lifecycleMarker("needs-info")));
});

test("buildLifecycleComment ignores non-lifecycle labels", () => {
  assert.equal(buildLifecycleComment("bug"), null);
});

test("hasLifecycleComment prevents repeat lifecycle comments", () => {
  assert.equal(
    hasLifecycleComment([{ body: `${lifecycleMarker("ready-for-agent")}\nready` }], "ready-for-agent"),
    true,
  );
  assert.equal(hasLifecycleComment([{ body: "ordinary comment" }], "ready-for-agent"), false);
});

test("buildNeedsInfoSweepQuery selects stale open needs-info issues", () => {
  const now = new Date("2026-05-17T12:00:00Z");

  assert.equal(daysAgoIsoDate(14, now), "2026-05-03");
  assert.equal(
    buildNeedsInfoSweepQuery("gsd-build", "gsd-2", 14, now),
    "repo:gsd-build/gsd-2 is:issue is:open label:needs-info updated:<2026-05-03",
  );
});

test("buildNeedsInfoSweepComment explains the non-destructive stale issue transition", () => {
  const comment = buildNeedsInfoSweepComment(14);

  assert.match(comment, new RegExp(lifecycleMarker("needs-info-sweep")));
  assert.match(comment, /moving back to maintainer triage/);
});
