import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadEditorialDebtItems,
  parseEditorialDebtItem,
  renderEditorialDebtIndex,
  validateEditorialDebtItems,
} from "./editorial-debt";

function debtSource(overrides: Record<string, string> = {}): string {
  const fields = {
    id: "CTD-0001",
    title: "A known obligation",
    status: "open",
    kind: "promise",
    severity: "high",
    scopes: '["volume-1"]',
    sources: '["package.json"]',
    discovered: "2026-07-09",
    updated: "2026-07-09",
    resolved: "",
    discoveredIn: "volume-1/wave-one",
    ...overrides,
  };
  return `---
${Object.entries(fields)
  .map(([key, value]) => `${key}: ${value}`)
  .join("\n")}
---

## Debt

The promise has not been fulfilled.

## Evidence

The source names a missing artifact.

## Paydown criteria

Publish the artifact or remove the promise.

## History

- 2026-07-09: Recorded.
`;
}

describe("editorial debt", () => {
  it("parses a valid open item", () => {
    const item = parseEditorialDebtItem(
      "ctd-0001-known-obligation.md",
      debtSource(),
    );
    expect(item).toMatchObject({
      id: "CTD-0001",
      status: "open",
      scopes: ["volume-1"],
    });
  });

  it("requires resolved items to carry resolution evidence", () => {
    expect(() =>
      parseEditorialDebtItem(
        "ctd-0001-known-obligation.md",
        debtSource({
          status: "resolved",
          resolved: "2026-07-09",
        }),
      ),
    ).toThrow("## Resolution");
  });

  it("reopens an item without discarding its earlier paydown", () => {
    const source = debtSource({ updated: "2026-07-11" }).replace(
      "- 2026-07-09: Recorded.",
      [
        "- 2026-07-09: Recorded and resolved.",
        "- 2026-07-11: Reopened after the problem recurred.",
        "",
        "## Prior paydown",
        "",
        "The earlier correction worked in its original scope.",
      ].join("\n"),
    );
    const item = parseEditorialDebtItem("ctd-0001-reopened.md", source);
    expect(item).toMatchObject({
      status: "open",
      resolved: "",
      updated: "2026-07-11",
    });
  });

  it("requires reopened items to retain prior paydown evidence", () => {
    const source = debtSource({ updated: "2026-07-11" }).replace(
      "- 2026-07-09: Recorded.",
      "- 2026-07-09: Recorded.\n- 2026-07-11: Reopened.",
    );
    expect(() =>
      parseEditorialDebtItem("ctd-0001-reopened.md", source),
    ).toThrow("## Prior paydown");
  });

  it("rejects deletion gaps in the append-only ID sequence", () => {
    const first = parseEditorialDebtItem(
      "ctd-0001-first.md",
      debtSource(),
    );
    const third = parseEditorialDebtItem(
      "ctd-0003-third.md",
      debtSource({ id: "CTD-0003", title: "Third" }),
    );
    expect(() => validateEditorialDebtItems([first, third])).toThrow(
      "append-only and contiguous",
    );
  });

  it("renders active and resolved items without dropping history", () => {
    const open = parseEditorialDebtItem(
      "ctd-0001-open.md",
      debtSource(),
    );
    const resolved = parseEditorialDebtItem(
      "ctd-0002-resolved.md",
      `${debtSource({
        id: "CTD-0002",
        title: "Paid debt",
        status: "resolved",
        resolved: "2026-07-09",
      })}\n## Resolution\n\nThe promise was fulfilled.\n`,
    );
    const index = renderEditorialDebtIndex([open, resolved]);
    expect(index).toContain("Open: 1");
    expect(index).toContain("Resolved: 1");
    expect(index).toContain("items/ctd-0002-resolved.md");
  });

  it("loads appended items from item files before rendering the index", () => {
    const itemsRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "coherence-editorial-debt-"),
    );
    try {
      fs.writeFileSync(
        path.join(itemsRoot, "ctd-0001-first.md"),
        debtSource(),
      );
      fs.writeFileSync(
        path.join(itemsRoot, "ctd-0002-second.md"),
        debtSource({ id: "CTD-0002", title: "Second obligation" }),
      );
      const items = loadEditorialDebtItems(itemsRoot);
      validateEditorialDebtItems(items);
      const index = renderEditorialDebtIndex(items);
      expect(items.map((item) => item.id)).toEqual(["CTD-0001", "CTD-0002"]);
      expect(index).toContain("Second obligation");
    } finally {
      fs.rmSync(itemsRoot, { recursive: true, force: true });
    }
  });
});
