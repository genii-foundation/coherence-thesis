import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  editorialDebtKinds,
  editorialDebtSeverities,
  editorialDebtStatuses,
  loadEditorialDebtItems,
  parseEditorialDebtItem,
  renderEditorialDebtIndex,
  validateEditorialDebtItems,
} from "./debt";

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

function resolvedDebtSource(overrides: Record<string, string> = {}): string {
  return debtSource({
    status: "resolved",
    resolved: "2026-07-09",
    ...overrides,
  })
    .replace(
      "Publish the artifact or remove the promise.",
      [
        "- C1. Publish the promised artifact.",
        "- C2. Remove the promise if publication no longer applies.",
      ].join("\n"),
    )
    .replace(
      "- 2026-07-09: Recorded.",
      [
        "- 2026-07-09: Recorded and resolved.",
        "",
        "## Resolution",
        "",
        "### Outcome",
        "",
        "The obligation is no longer active.",
        "",
        "### Criterion results",
        "",
        "- C1: met. The promised artifact was published.",
        "- C2: not applicable. Publication made removal unnecessary.",
        "",
        "### Evidence",
        "",
        "The package records the published artifact.",
        "",
        "### Validation",
        "",
        "The focused register validation passed.",
        "",
        "### Approval",
        "",
        "The responsible editor confirmed the outcome.",
        "",
        "### Residual risk",
        "",
        "No residual risk remains inside this obligation.",
        "",
        "### Related debt",
        "",
        "None.",
      ].join("\n"),
    );
}

describe("editorial debt", () => {
  it("exports the field contract values", () => {
    expect(editorialDebtStatuses).toEqual([
      "open",
      "query",
      "deferred",
      "resolved",
    ]);
    expect(editorialDebtKinds).toContain("literary");
    expect(editorialDebtSeverities).toEqual([
      "critical",
      "high",
      "medium",
      "low",
    ]);
  });

  it("parses an active legacy item and exposes its level 2 sections", () => {
    const item = parseEditorialDebtItem(
      "ctd-0001-known-obligation.md",
      debtSource(),
    );
    expect(item).toMatchObject({
      id: "CTD-0001",
      status: "open",
      scopes: ["volume-1"],
    });
    expect(item.sections.get("Debt")).toBe(
      "The promise has not been fulfilled.",
    );
    expect(item.sections.get("Paydown criteria")).toBe(
      "Publish the artifact or remove the promise.",
    );
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

  it("accepts a structured resolution with exact criterion results", () => {
    const item = parseEditorialDebtItem(
      "ctd-0001-known-obligation.md",
      resolvedDebtSource(),
    );
    expect(item).toMatchObject({
      status: "resolved",
      resolved: "2026-07-09",
    });
    expect(item.sections.get("Resolution")).toContain(
      "### Criterion results",
    );
    expect(item.resolution).toEqual({
      outcome: "The obligation is no longer active.",
      criterionResults: [
        "- C1: met. The promised artifact was published.",
        "- C2: not applicable. Publication made removal unnecessary.",
      ].join("\n"),
      evidence: "The package records the published artifact.",
      validation: "The focused register validation passed.",
      approval: "The responsible editor confirmed the outcome.",
      residualRisk: "No residual risk remains inside this obligation.",
      relatedDebt: "None.",
    });
  });

  it("requires resolved paydown criteria to start at C1 and stay contiguous", () => {
    const source = resolvedDebtSource().replace("- C2.", "- C3.");
    expect(() =>
      parseEditorialDebtItem("ctd-0001-known-obligation.md", source),
    ).toThrow("contiguous from C1");
  });

  it("requires every structured resolution section", () => {
    const source = resolvedDebtSource().replace(
      "### Approval\n\nThe responsible editor confirmed the outcome.\n\n",
      "",
    );
    expect(() =>
      parseEditorialDebtItem("ctd-0001-known-obligation.md", source),
    ).toThrow("### Approval");
  });

  it("rejects duplicate structured resolution headings", () => {
    const source = resolvedDebtSource().replace(
      "### Evidence",
      [
        "### Criterion results",
        "",
        "- C1: unmet. A duplicate section must not hide this result.",
        "",
        "### Evidence",
      ].join("\n"),
    );
    expect(() =>
      parseEditorialDebtItem("ctd-0001-known-obligation.md", source),
    ).toThrow("duplicate '### Criterion results' section");
  });

  it("requires criterion results to cover the criteria exactly once and in order", () => {
    const source = resolvedDebtSource().replace(
      "- C2: not applicable.",
      "- C3: not applicable.",
    );
    expect(() =>
      parseEditorialDebtItem("ctd-0001-known-obligation.md", source),
    ).toThrow("cover C1, C2 exactly once and in order");
  });

  it("rejects an unmet result in a resolved item", () => {
    const source = resolvedDebtSource().replace(
      "- C2: not applicable.",
      "- C2: unmet.",
    );
    expect(() =>
      parseEditorialDebtItem("ctd-0001-known-obligation.md", source),
    ).toThrow("met. ...");
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
      resolvedDebtSource({
        id: "CTD-0002",
        title: "Paid debt",
      }),
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
