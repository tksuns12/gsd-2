// GSD-2 — UnitContextComposer (#4782 phase 2).
//
// Reads a unit type's manifest and orchestrates artifact inlining through
// a caller-provided resolver. Returns a joined context block suitable for
// substitution into the unit's prompt template.
//
// Design rationale:
//   - Pure dependency on the manifest module — no circular import with
//     `auto-prompts.ts` where the per-artifact-key resolver lives.
//   - Caller-supplied resolver means the composer can be unit-tested with
//     trivial mocks; production wiring in `auto-prompts.ts` dispatches to
//     the existing `inlineFile` / `inline*FromDb` helpers.
//   - Null-returning resolvers are skipped silently: they model the
//     "artifact is optional / missing / not applicable to this milestone"
//     case. The composer never errors on a missing artifact.
//
// Scope: phase 2 pilot. The composer currently handles only the `inline`
// artifact list. Excerpt and on-demand artifact shapes (already used by
// #4780) will be folded in during phase 3 when the remaining unit types
// migrate into the composer.

import {
  resolveManifest,
  type ArtifactKey,
  type UnitContextManifest,
} from "./unit-context-manifest.js";

/**
 * Async function mapping an artifact key to its inlined-content string,
 * or `null` when the artifact does not apply to the current milestone
 * (missing file, empty table, etc).
 */
export type ArtifactResolver = (key: ArtifactKey) => Promise<string | null>;

/**
 * Produce the inlined-context portion of a unit's system prompt by
 * walking the manifest's `artifacts.inline` list in order and calling
 * the provided resolver for each key.
 *
 * Returns an empty string when the unit type has no manifest registered,
 * so callers can guard their wiring with a simple truthy check. Unknown
 * unit types do not error — this mirrors `resolveManifest`'s contract.
 *
 * The separator between inlined blocks matches the in-tree convention
 * (`\n\n---\n\n`) so composer output slots into existing prompt templates
 * without visible diff.
 */
export async function composeInlinedContext(
  unitType: string,
  resolveArtifact: ArtifactResolver,
): Promise<string> {
  const manifest: UnitContextManifest | null = resolveManifest(unitType);
  if (!manifest) return "";

  const blocks: string[] = [];
  for (const key of manifest.artifacts.inline) {
    const body = await resolveArtifact(key);
    if (body !== null && body.length > 0) {
      blocks.push(body);
    }
  }
  return blocks.join("\n\n---\n\n");
}

/**
 * Convenience helper returning the manifest's declared budget so callers
 * can telemetry a mismatch between actual prompt size and declared budget.
 * Returns null for unknown unit types.
 */
export function manifestBudgetChars(unitType: string): number | null {
  const manifest = resolveManifest(unitType);
  return manifest ? manifest.maxSystemPromptChars : null;
}
