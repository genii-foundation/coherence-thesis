import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildReadmeStatus,
  readmeStatusEndMarker,
  readmeStatusStartMarker,
  replaceReadmeStatus,
  updateReadmeStatus,
} from "./update-readme-status";

const temporaryRoots: string[] = [];

function temporaryReadme(contents: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coherence-readme-"));
  temporaryRoots.push(root);
  const readmePath = path.join(root, "README.md");
  fs.writeFileSync(readmePath, contents);
  return readmePath;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

describe("README development status", () => {
  const oldStatus = `${readmeStatusStartMarker}\n\nOld\n\n${readmeStatusEndMarker}`;
  const newStatus = `${readmeStatusStartMarker}\n\nNew\n\n${readmeStatusEndMarker}`;

  it("renders stable source and package facts", () => {
    const status = buildReadmeStatus(
      {
        overview: { nodes: [{ id: "overview" }] },
        stats: {
          chapterCount: 3,
          partCount: 2,
          readingMinutes: 58,
          sectionCount: 4,
          volumeCount: 1,
          wordCount: 12_345,
        },
      } as never,
      { dependencies: { next: "16.2.9" }, version: "0.1.0" },
    );

    expect(status).toContain("- Next.js: 16.2.9");
    expect(status).toContain("- Manuscripts: 1 volume, 2 parts, 3 chapters, 4 sections");
    expect(status).toContain("- Canonical words: 12,345");
    expect(status).toContain("- Overview nodes: 1");
  });

  it("replaces only the bounded development status", () => {
    expect(replaceReadmeStatus(`Before\n${oldStatus}\nAfter\n`, newStatus)).toBe(
      `Before\n${newStatus}\nAfter\n`,
    );
  });

  it("fails when status markers are missing or reversed", () => {
    expect(() => replaceReadmeStatus("No markers\n", newStatus)).toThrow(
      "missing, duplicated, or out of order",
    );
    expect(() =>
      replaceReadmeStatus(
        `${readmeStatusEndMarker}\n${readmeStatusStartMarker}\n`,
        newStatus,
      ),
    ).toThrow("missing, duplicated, or out of order");
    expect(() =>
      replaceReadmeStatus(
        `${oldStatus}\n${readmeStatusStartMarker}\n${readmeStatusEndMarker}\n`,
        newStatus,
      ),
    ).toThrow("missing, duplicated, or out of order");
  });

  it("reports stale content without writing in check mode", () => {
    const readmePath = temporaryReadme(`Before\n${oldStatus}\nAfter\n`);

    expect(updateReadmeStatus({ check: true, readmePath, status: newStatus })).toBe(
      "stale",
    );
    expect(fs.readFileSync(readmePath, "utf8")).toContain("Old");
  });

  it("writes stale content and recognizes a current file", () => {
    const readmePath = temporaryReadme(`Before\n${oldStatus}\nAfter\n`);

    expect(updateReadmeStatus({ readmePath, status: newStatus })).toBe("updated");
    expect(updateReadmeStatus({ check: true, readmePath, status: newStatus })).toBe(
      "current",
    );
    expect(fs.readFileSync(readmePath, "utf8")).toContain("New");
  });
});
