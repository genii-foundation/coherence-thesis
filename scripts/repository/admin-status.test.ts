import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { parseEditorialDebtItem } from "../../src/lib/editorial-debt";
import { validateAdminDebtStatus, validateAdminStatus } from "./admin-status";

let temporaryRoot: string | null = null;

afterEach(() => {
  if (temporaryRoot) rmSync(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = null;
});

function progressFixture(status: "open" | "settled"): {
  reviewsRoot: string;
  calibrationRoot: string;
} {
  temporaryRoot = mkdtempSync(path.join(tmpdir(), "admin-status-"));
  const reviewsRoot = path.join(temporaryRoot, "reviews");
  const batch = path.join(
    reviewsRoot,
    "volumes",
    "volume-01",
    "current",
  );
  const calibrationRoot = path.join(temporaryRoot, "calibration");
  const records = path.join(calibrationRoot, "volume-01");
  mkdirSync(batch, { recursive: true });
  mkdirSync(records, { recursive: true });
  writeFileSync(
    path.join(batch, "review.json"),
    JSON.stringify({
      standing: "current",
      baseline: { snapshotPath: "baseline.md" },
    }),
  );
  writeFileSync(path.join(batch, "baseline.md"), "# Opening\n\nWords.\n");
  writeFileSync(
    path.join(records, "v01-opening.json"),
    JSON.stringify({ sectionId: "v01-opening", status }),
  );
  return { reviewsRoot, calibrationRoot };
}

function register(detail = "Complete. Derived from canonical records.") {
  return {
    schemaVersion: 1,
    updated: "2026-07-30",
    tasks: [
      {
        id: "T-001",
        title: "Render Volume I",
        tier: "green",
        status: "done",
        area: "editorial",
        detail,
        progress: { kind: "calibration", editorialId: "volume-01" },
      },
    ],
  };
}

function debtItem(id: string, status: string, kind = "literary") {
  return parseEditorialDebtItem(
    `items/${id.toLowerCase()}-fixture.md`,
    [
      "---",
      `id: ${id}`,
      "title: A fixture obligation",
      `status: ${status}`,
      `kind: ${kind}`,
      "severity: low",
      'scopes: ["volume-1"]',
      'sources: ["editorial/sources/volumes/volume-01/manuscript.md"]',
      "discovered: 2026-07-09",
      "updated: 2026-07-09",
      "resolved:",
      "discoveredIn: volume-1/wave-one",
      "---",
      "",
      "## Debt",
      "",
      "Something is owed.",
      "",
      "## Evidence",
      "",
      "A pass found it.",
      "",
      "## Paydown criteria",
      "",
      "Fix the named line.",
      "",
      "## History",
      "",
      "- 2026-07-09: Recorded.",
      "",
    ].join("\n"),
  );
}

const debtIndex = (open: number, query: number) =>
  `Open: ${open}. Queries: ${query}. Deferred: 0. Resolved: 0.\n`;

describe("validateAdminDebtStatus", () => {
  it("counts the lane the debt page shows for each ticket", () => {
    const items = [
      debtItem("CTD-0001", "open"),
      debtItem("CTD-0002", "query"),
      debtItem("CTD-0003", "open", "canon"),
    ];
    expect(validateAdminDebtStatus(items, debtIndex(2, 1))).toEqual({
      items: 3,
      decisionBound: 2,
    });
  });

  it("rejects an index whose counts no longer match the item files", () => {
    expect(() =>
      validateAdminDebtStatus([debtItem("CTD-0001", "open")], debtIndex(4, 0)),
    ).toThrow("Run npm run editorial:debt:update");
  });

  it("rejects a register with a gap in its identifiers", () => {
    expect(() =>
      validateAdminDebtStatus(
        [debtItem("CTD-0001", "open"), debtItem("CTD-0003", "open")],
        null,
      ),
    ).toThrow("append-only and contiguous");
  });
});

describe("validateAdminStatus", () => {
  it("accepts a completed render even when its record remains open", () => {
    expect(validateAdminStatus(register(), progressFixture("open"))).toEqual({
      tasks: 1,
      progressTasks: 1,
    });
  });

  it("rejects manual progress counts beside a derived progress source", () => {
    expect(() =>
      validateAdminStatus(
        register("Complete. 1 of 1 sections settled."),
        progressFixture("settled"),
      ),
    ).toThrow("duplicates derived section progress");
  });
});
