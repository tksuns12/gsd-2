import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const gsdDir = join(__dirname, "..");

describe("forensics journal & activity log awareness", () => {
  const forensicsSrc = readFileSync(join(gsdDir, "forensics.ts"), "utf-8");
  const promptSrc = readFileSync(join(gsdDir, "prompts", "forensics.md"), "utf-8");

  it("forensics.ts imports queryJournal from journal module", () => {
    assert.ok(
      forensicsSrc.includes('from "./journal.js"') || forensicsSrc.includes("from './journal.js'"),
      "forensics.ts must import from journal.js",
    );
    assert.ok(
      forensicsSrc.includes("queryJournal"),
      "forensics.ts must reference queryJournal",
    );
  });

  it("ForensicReport includes journalSummary field", () => {
    assert.ok(
      forensicsSrc.includes("journalSummary"),
      "ForensicReport must include journalSummary field",
    );
  });

  it("ForensicReport includes activityLogMeta field", () => {
    assert.ok(
      forensicsSrc.includes("activityLogMeta"),
      "ForensicReport must include activityLogMeta field",
    );
  });

  it("buildForensicReport calls scanJournalForForensics", () => {
    assert.ok(
      forensicsSrc.includes("scanJournalForForensics"),
      "buildForensicReport must call scanJournalForForensics",
    );
  });

  it("buildForensicReport calls gatherActivityLogMeta", () => {
    assert.ok(
      forensicsSrc.includes("gatherActivityLogMeta"),
      "buildForensicReport must call gatherActivityLogMeta",
    );
  });

  it("forensics detects journal-based anomalies", () => {
    assert.ok(
      forensicsSrc.includes("detectJournalAnomalies"),
      "forensics.ts must have detectJournalAnomalies function",
    );
    // Check for specific journal anomaly types
    assert.ok(forensicsSrc.includes('"journal-stuck"'), "must detect journal-stuck anomalies");
    assert.ok(forensicsSrc.includes('"journal-guard-block"'), "must detect journal-guard-block anomalies");
    assert.ok(forensicsSrc.includes('"journal-rapid-iterations"'), "must detect journal-rapid-iterations anomalies");
    assert.ok(forensicsSrc.includes('"journal-worktree-failure"'), "must detect journal-worktree-failure anomalies");
  });

  it("formatReportForPrompt includes journal summary section", () => {
    assert.ok(
      forensicsSrc.includes("Journal Summary"),
      "prompt formatter must include a Journal Summary section",
    );
  });

  it("formatReportForPrompt includes activity log overview section", () => {
    assert.ok(
      forensicsSrc.includes("Activity Log Overview"),
      "prompt formatter must include an Activity Log Overview section",
    );
  });

  it("forensics prompt documents journal format", () => {
    assert.ok(
      promptSrc.includes("### Journal Format"),
      "forensics.md must document the journal format",
    );
    assert.ok(
      promptSrc.includes("flowId"),
      "forensics.md must reference flowId concept",
    );
    assert.ok(
      promptSrc.includes("causedBy"),
      "forensics.md must reference causedBy for causal chains",
    );
  });

  it("forensics prompt includes journal directory in runtime path reference", () => {
    assert.ok(
      promptSrc.includes("journal/"),
      "forensics.md runtime path reference must include journal/",
    );
  });

  it("investigation protocol references journal data", () => {
    assert.ok(
      promptSrc.includes("journal timeline") || promptSrc.includes("journal events"),
      "investigation protocol must reference journal data for tracing",
    );
  });
});
