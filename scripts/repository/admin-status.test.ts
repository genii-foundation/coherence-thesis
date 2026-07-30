import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { validateAdminStatus } from "./admin-status";

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
