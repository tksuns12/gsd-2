// GSD2 — Read-only query tools exposing DB state to the LLM via the WAL connection

import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@gsd/pi-coding-agent";

import { ensureDbOpen } from "./dynamic-tools.js";
import { logWarning } from "../workflow-logger.js";

export function registerQueryTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gsd_milestone_status",
    label: "Milestone Status",
    description:
      "Read the current status of a milestone and all its slices from the GSD database. " +
      "Returns milestone metadata, per-slice status, and task counts per slice. " +
      "Use this instead of querying .gsd/gsd.db directly via sqlite3 or better-sqlite3.",
    promptSnippet: "Get milestone status, slice statuses, and task counts for a given milestoneId",
    promptGuidelines: [
      "Use this tool — not sqlite3 or better-sqlite3 — whenever you need to inspect milestone or slice state.",
      "Returns milestone metadata (title, status, created_at, completed_at) and a slices array.",
      "Each slice entry includes id, status, and task counts (total, done, pending).",
      "Returns an error message if the milestone does not exist or the database is unavailable.",
    ],
    parameters: Type.Object({
      milestoneId: Type.String({ description: "Milestone ID to query (e.g. M001)" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        const dbAvailable = await ensureDbOpen();
        if (!dbAvailable) {
          return {
            content: [{ type: "text" as const, text: "Error: GSD database is not available." }],
            details: { operation: "milestone_status", error: "db_unavailable" } as any,
          };
        }

        const {
          getMilestone,
          getSliceStatusSummary,
          getSliceTaskCounts,
        } = await import("../gsd-db.js");

        const milestone = getMilestone(params.milestoneId);
        if (!milestone) {
          return {
            content: [{ type: "text" as const, text: `Milestone ${params.milestoneId} not found in database.` }],
            details: { operation: "milestone_status", milestoneId: params.milestoneId, found: false } as any,
          };
        }

        const sliceStatuses = getSliceStatusSummary(params.milestoneId);

        const slices = sliceStatuses.map((s) => {
          const counts = getSliceTaskCounts(params.milestoneId, s.id);
          return {
            id: s.id,
            status: s.status,
            taskCounts: counts,
          };
        });

        const result = {
          milestoneId: milestone.id,
          title: milestone.title,
          status: milestone.status,
          createdAt: milestone.created_at,
          completedAt: milestone.completed_at,
          sliceCount: slices.length,
          slices,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          details: { operation: "milestone_status", milestoneId: milestone.id, sliceCount: slices.length } as any,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logWarning("tool", `gsd_milestone_status tool failed: ${msg}`);
        return {
          content: [{ type: "text" as const, text: `Error querying milestone status: ${msg}` }],
          details: { operation: "milestone_status", error: msg } as any,
        };
      }
    },
  });
}
