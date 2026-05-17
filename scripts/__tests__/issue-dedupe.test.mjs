// Project/App: GSD-2
// File Purpose: Regression tests for duplicate issue suggestion policy.

import assert from "node:assert/strict";
import test from "node:test";

import {
  DEDUPE_MARKER,
  buildDuplicateComment,
  buildSearchQuery,
  findDuplicateCandidates,
  hasExistingDedupeComment,
  scoreTitleSimilarity,
  tokenizeTitle,
} from "../issue-dedupe.mjs";

test("tokenizeTitle removes low-signal words from issue titles", () => {
  assert.deepEqual(tokenizeTitle("How do we fix auto mode on merge?"), [
    "fix",
    "auto",
    "mode",
    "merge",
  ]);
});

test("scoreTitleSimilarity gives related titles a stronger score", () => {
  const related = scoreTitleSimilarity(
    "Auto mode fails after merge conflict",
    "Auto mode pauses after merge conflicts",
  );
  const unrelated = scoreTitleSimilarity(
    "Auto mode fails after merge conflict",
    "Add dark theme to dashboard",
  );

  assert.ok(related > unrelated);
  assert.ok(related >= 0.58);
});

test("findDuplicateCandidates excludes the current issue and pull requests", () => {
  const candidates = findDuplicateCandidates(
    { number: 10, title: "Auto mode fails after merge conflict" },
    [
      { number: 10, title: "Auto mode fails after merge conflict", html_url: "self" },
      { number: 11, title: "Auto mode pauses after merge conflicts", html_url: "match" },
      {
        number: 12,
        title: "Auto mode fails after merge conflict",
        html_url: "pr",
        pull_request: {},
      },
    ],
  );

  assert.deepEqual(candidates.map((candidate) => candidate.number), [11]);
});

test("buildDuplicateComment includes the idempotency marker and candidate list", () => {
  const comment = buildDuplicateComment([
    {
      number: 11,
      title: "Auto mode pauses after merge conflicts",
      html_url: "https://example.test/issues/11",
      score: 0.75,
    },
  ]);

  assert.match(comment, new RegExp(DEDUPE_MARKER));
  assert.match(comment, /#11: Auto mode pauses after merge conflicts/);
});

test("hasExistingDedupeComment detects prior dedupe suggestions", () => {
  assert.equal(hasExistingDedupeComment([{ body: `${DEDUPE_MARKER}\nold` }]), true);
  assert.equal(hasExistingDedupeComment([{ body: "ordinary comment" }]), false);
});

test("buildSearchQuery scopes duplicate search to this repository", () => {
  assert.equal(
    buildSearchQuery("gsd-build", "gsd-2", {
      title: "Auto mode fails after merge conflict",
    }),
    "repo:gsd-build/gsd-2 is:issue in:title auto mode fails after merge conflict",
  );
});
