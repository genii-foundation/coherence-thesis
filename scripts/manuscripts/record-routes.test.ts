import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompiledCatalog, CompiledSection } from "./shared";
import { recordSectionRoutes } from "./record-routes";

const temporaryRoots: string[] = [];

function temporaryLedger(contents: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "record-routes-"));
  temporaryRoots.push(root);
  const ledgerPath = path.join(root, "section-ledger.json");
  fs.writeFileSync(ledgerPath, contents);
  return ledgerPath;
}

function catalogWithRoutes(
  sections: Array<{ sectionId: string; href: string }>,
): CompiledCatalog {
  return {
    siteTitle: "The Coherence Thesis",
    generatedFrom: "canonical markdown",
    gitRevision: "test",
    stats: {
      volumeCount: 1,
      partCount: 1,
      chapterCount: 1,
      sectionCount: sections.length,
      wordCount: 10,
      readingMinutes: 1,
    },
    volumes: [],
    sections: sections as unknown as CompiledSection[],
    aliases: [],
    routeAliases: [],
    overview: {
      title: "Overview",
      subtitle: "A map.",
      readingMinutes: 1,
      nodes: [],
    },
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("explicit section route recording", () => {
  it("unions current routes with history before validating", () => {
    const original = `${JSON.stringify(
      { version: 1, routes: [{ sectionId: "old", href: "/old/" }] },
      null,
      2,
    )}\n`;
    const ledgerPath = temporaryLedger(original);
    const validate = vi.fn(() => {
      const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8")) as {
        routes: Array<{ href: string }>;
      };
      expect(ledger.routes.map((entry) => entry.href)).toEqual(["/new/", "/old/"]);
    });

    expect(
      recordSectionRoutes({
        catalog: catalogWithRoutes([{ sectionId: "new", href: "/new/" }]),
        ledgerPath,
        validate,
      }),
    ).toBe(true);
    expect(validate).toHaveBeenCalledOnce();
    expect(fs.readdirSync(path.dirname(ledgerPath)).sort()).toEqual([
      "route-ledger.json",
      "section-ledger.json",
    ]);
  });

  it("restores the exact prior ledger when full validation fails", () => {
    const original = `${JSON.stringify(
      { version: 1, routes: [{ sectionId: "old", href: "/old/" }] },
      null,
      2,
    )}\n`;
    const ledgerPath = temporaryLedger(original);

    expect(() =>
      recordSectionRoutes({
        catalog: catalogWithRoutes([{ sectionId: "new", href: "/new/" }]),
        ledgerPath,
        validate: () => {
          throw new Error("validation failed");
        },
      }),
    ).toThrow("validation failed");
    expect(fs.readFileSync(ledgerPath, "utf8")).toBe(original);
    expect(fs.readdirSync(path.dirname(ledgerPath)).sort()).toEqual([
      "section-ledger.json",
    ]);
  });

  it("validates without rewriting an already current ledger", () => {
    const current = `${JSON.stringify(
      { version: 1, routes: [{ sectionId: "same", href: "/same/" }] },
      null,
      2,
    )}\n`;
    const ledgerPath = temporaryLedger(current);
    const validate = vi.fn();
    const catalog = catalogWithRoutes([{ sectionId: "same", href: "/same/" }]);

    expect(recordSectionRoutes({ catalog, ledgerPath, validate })).toBe(true);
    const routeLedgerPath = path.join(
      path.dirname(ledgerPath),
      "route-ledger.json",
    );
    const recordedRoutes = fs.readFileSync(routeLedgerPath, "utf8");
    validate.mockClear();

    expect(
      recordSectionRoutes({
        catalog,
        ledgerPath,
        validate,
      }),
    ).toBe(false);
    expect(validate).toHaveBeenCalledOnce();
    expect(fs.readFileSync(ledgerPath, "utf8")).toBe(current);
    expect(fs.readFileSync(routeLedgerPath, "utf8")).toBe(recordedRoutes);
  });
});
