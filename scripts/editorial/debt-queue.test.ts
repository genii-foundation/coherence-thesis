import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildEditorialDebtQueue,
  runEditorialDebtQueueCli,
  type EditorialDebtQueue,
} from "./debt-queue";
import {
  loadEditorialDebtItems,
  parseEditorialDebtItem,
  type EditorialDebtItem,
} from "./debt";

type DebtOverrides = Partial<{
  id: string;
  title: string;
  status: EditorialDebtItem["status"];
  kind: EditorialDebtItem["kind"];
  severity: EditorialDebtItem["severity"];
  scopes: string[];
  sources: string[];
  discovered: string;
  updated: string;
  resolved: string;
  discoveredIn: string;
  partialPaydown: string;
  priorPaydown: string;
  paydownCriteria: string;
}>;

function debtSource(overrides: DebtOverrides = {}): string {
  const fields = {
    id: "CTD-0001",
    title: "A known obligation",
    status: "open" as const,
    kind: "literary" as const,
    severity: "medium" as const,
    scopes: ["volume-1"],
    sources: ["package.json"],
    discovered: "2026-07-09",
    updated: "2026-07-09",
    resolved: "",
    discoveredIn: "volume-1/test",
    ...overrides,
  };
  const resolvedProof =
    fields.status === "resolved"
      ? [
          "",
          "## Resolution",
          "",
          "### Outcome",
          "",
          "The obligation was paid down.",
          "",
          "### Criterion results",
          "",
          "- C1: met. The source was corrected and the result was proved.",
          "",
          "### Evidence",
          "",
          "The current source and pull request record the result.",
          "",
          "### Validation",
          "",
          "The focused validation passed.",
          "",
          "### Approval",
          "",
          "The responsible human approved the result.",
          "",
          "### Residual risk",
          "",
          "None identified.",
          "",
          "### Related debt",
          "",
          "No related active ticket remains.",
        ].join("\n")
      : "";
  return `---
id: ${fields.id}
title: ${fields.title}
status: ${fields.status}
kind: ${fields.kind}
severity: ${fields.severity}
scopes: ${JSON.stringify(fields.scopes)}
sources: ${JSON.stringify(fields.sources)}
discovered: ${fields.discovered}
updated: ${fields.updated}
resolved: ${fields.resolved}
discoveredIn: ${fields.discoveredIn}
---

## Debt

The obligation remains visible.

## Evidence

The named source demonstrates the problem.

## Paydown criteria

${fields.status === "resolved" ? "- C1. Correct the source and prove the result." : fields.paydownCriteria ?? "Correct the source and prove the result."}

## History

- ${fields.updated}: Recorded.
${fields.partialPaydown ? `\n## Partial paydown\n\n${fields.partialPaydown}\n` : ""}${fields.priorPaydown ? `\n## Prior paydown\n\n${fields.priorPaydown}\n` : ""}${resolvedProof}
`;
}

function debtItem(overrides: DebtOverrides = {}): EditorialDebtItem {
  const id = overrides.id ?? "CTD-0001";
  return parseEditorialDebtItem(
    `${id.toLowerCase()}-test-obligation.md`,
    debtSource(overrides),
  );
}

function runQueue(
  args: string[],
  items: EditorialDebtItem[],
): { code: number; output: string; error: string } {
  const output: string[] = [];
  const errors: string[] = [];
  const code = runEditorialDebtQueueCli(args, {
    loadItems: () => items,
    validateItems: () => undefined,
    stdout: (message) => output.push(message),
    stderr: (message) => errors.push(message),
  });
  return { code, output: output.join("\n"), error: errors.join("\n") };
}

function jsonOutput(result: ReturnType<typeof runQueue>): EditorialDebtQueue {
  expect(result.code).toBe(0);
  return JSON.parse(result.output) as EditorialDebtQueue;
}

describe("editorial debt queue", () => {
  it("rejects unknown arguments and incompatible exact selection options", () => {
    const unknown = runQueue(["--mystery"], []);
    expect(unknown.code).toBe(1);
    expect(unknown.error).toBe("Unknown option '--mystery'.");

    const incompatible = runQueue(
      ["--id", "CTD-0001", "--limit", "1"],
      [debtItem()],
    );
    expect(incompatible.code).toBe(1);
    expect(incompatible.error).toBe("--id may be combined only with --format.");
  });

  it("rejects invalid filters, limits, and unknown ticket identifiers", () => {
    expect(runQueue(["--status", "waiting"], []).error).toContain(
      "--status must be one of",
    );
    expect(runQueue(["--limit", "0"], []).error).toBe(
      "--limit must be a positive integer.",
    );
    expect(runQueue(["--id", "CTD-9999"], [debtItem()]).error).toBe(
      "Editorial debt item CTD-9999 was not found.",
    );
  });

  it("keeps lifecycle presets distinct and orders deferred work by age", () => {
    const items = [
      debtItem({ id: "CTD-0001", status: "open" }),
      debtItem({ id: "CTD-0002", status: "query", kind: "canon" }),
      debtItem({
        id: "CTD-0003",
        status: "deferred",
        updated: "2026-07-11",
      }),
      debtItem({
        id: "CTD-0004",
        status: "deferred",
        updated: "2026-07-10",
      }),
      debtItem({
        id: "CTD-0005",
        status: "resolved",
        resolved: "2026-07-09",
      }),
    ];

    const actionable = jsonOutput(
      runQueue(["--format", "json"], items),
    );
    expect(actionable.items.map((item) => item.metadata.id)).toEqual([
      "CTD-0001",
    ]);

    const directQuery = jsonOutput(
      runQueue(["--status", "query", "--format", "json"], items),
    );
    expect(directQuery.selection).toMatchObject({
      preset: null,
      status: "query",
    });
    expect(directQuery.items.map((item) => item.metadata.id)).toEqual([
      "CTD-0002",
    ]);

    const directDeferred = jsonOutput(
      runQueue(["--status", "deferred", "--format", "json"], items),
    );
    expect(directDeferred.items.map((item) => item.metadata.id)).toEqual([
      "CTD-0004",
      "CTD-0003",
    ]);

    const directResolved = jsonOutput(
      runQueue(["--status", "resolved", "--format", "json"], items),
    );
    expect(directResolved.items.map((item) => item.metadata.id)).toEqual([
      "CTD-0005",
    ]);
    const directResolvedMarkdown = runQueue(
      ["--status", "resolved"],
      items,
    );
    expect(directResolvedMarkdown.output).toContain(
      "Selection: status resolved.",
    );
    expect(directResolvedMarkdown.output).not.toContain("Preset: null");

    const authorQuery = jsonOutput(
      runQueue(
        ["--preset", "author-query", "--format", "json"],
        items,
      ),
    );
    expect(authorQuery.items.map((item) => item.metadata.id)).toEqual([
      "CTD-0002",
    ]);
    expect(authorQuery.items[0]?.authority).toBe("Author decision");

    const deferred = jsonOutput(
      runQueue(["--preset", "deferred", "--format", "json"], items),
    );
    expect(deferred.items.map((item) => item.metadata.id)).toEqual([
      "CTD-0004",
      "CTD-0003",
    ]);

    const resolved = jsonOutput(
      runQueue(["--preset", "resolved", "--format", "json"], items),
    );
    expect(resolved.items.map((item) => item.metadata.id)).toEqual([
      "CTD-0005",
    ]);
  });

  it("composes preset, status, kind, severity, and scope filters", () => {
    const items = [
      debtItem({ id: "CTD-0001", severity: "high" }),
      debtItem({
        id: "CTD-0002",
        status: "query",
        kind: "canon",
        severity: "high",
      }),
      debtItem({ id: "CTD-0003", kind: "structural", severity: "high" }),
      debtItem({
        id: "CTD-0004",
        severity: "high",
        scopes: ["volume-2"],
      }),
    ];
    const queue = jsonOutput(
      runQueue(
        [
          "--preset",
          "all-active",
          "--status",
          "open",
          "--kind",
          "literary",
          "--severity",
          "high",
          "--scope",
          "volume-1",
          "--limit",
          "10",
          "--format",
          "json",
        ],
        items,
      ),
    );
    expect(queue.items.map((item) => item.metadata.id)).toEqual(["CTD-0001"]);
    expect(queue.selection).toMatchObject({
      preset: "all-active",
      status: "open",
      kind: "literary",
      severity: "high",
      scope: "volume-1",
      limit: 10,
    });
  });

  it("selects an exact resolved ticket without applying active defaults", () => {
    const resolved = debtItem({
      id: "CTD-0002",
      status: "resolved",
      resolved: "2026-07-09",
    });
    const queue = jsonOutput(
      runQueue(["--id", "ctd-0002", "--format", "json"], [debtItem(), resolved]),
    );
    expect(queue.selection).toMatchObject({ id: "CTD-0002", preset: null });
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.metadata).toMatchObject({
      id: "CTD-0002",
      status: "resolved",
      resolved: "2026-07-09",
    });
  });

  it("routes every debt kind to its required authority and specialist", () => {
    const kinds: EditorialDebtItem["kind"][] = [
      "audio",
      "canon",
      "citation",
      "factual",
      "link",
      "literary",
      "logical",
      "promise",
      "structural",
      "technical",
      "terminology",
    ];
    const items = kinds.map((kind, index) =>
      debtItem({
        id: `CTD-${String(index + 1).padStart(4, "0")}`,
        kind,
      }),
    );
    const queue = buildEditorialDebtQueue(items, {
      preset: "all-active",
      limit: items.length,
    });
    const routes = Object.fromEntries(
      queue.items.map((item) => [item.metadata.kind, item]),
    );
    expect(routes.literary?.specialistRoute).toBe(
      "$coherence-editorial-review",
    );
    expect(routes.structural?.authority).toBe("Human editor");
    expect(routes.terminology?.specialistRoute).toBe(
      "$coherence-editorial-review",
    );
    expect(routes.canon?.authority).toBe("Author decision");
    expect(routes.logical?.specialistRoute).toContain("author decision");
    expect(routes.promise?.specialistRoute).toContain(
      "$coherence-editorial-review",
    );
    expect(routes.citation?.authority).toContain("Primary source evidence");
    expect(routes.factual?.specialistRoute).toContain("Primary source research");
    expect(routes.link?.specialistRoute).toBe("$coherence-manuscript-publish");
    expect(routes.technical?.specialistRoute).toBe("$coherence-build-feature");
    expect(routes.audio?.specialistRoute).toContain("cannot upload");
  });

  it("keeps kind specific specialist routes for query tickets", () => {
    const queryKinds: EditorialDebtItem["kind"][] = [
      "literary",
      "citation",
      "factual",
      "link",
      "technical",
      "audio",
    ];
    const items = queryKinds.map((kind, index) =>
      debtItem({
        id: `CTD-${String(index + 1).padStart(4, "0")}`,
        status: "query",
        kind,
      }),
    );
    const queue = buildEditorialDebtQueue(items, {
      preset: "author-query",
      limit: items.length,
    });
    const routes = Object.fromEntries(
      queue.items.map((item) => [item.metadata.kind, item]),
    );

    for (const item of queue.items.filter(
      (candidate) =>
        candidate.metadata.kind !== "citation" &&
        candidate.metadata.kind !== "factual",
    )) {
      expect(item.authority).toBe("Named decision authority in the ticket");
      expect(item.specialistRoute).toContain("Decision first");
    }
    expect(routes.literary?.specialistRoute).toContain(
      "$coherence-editorial-review",
    );
    expect(routes.link?.specialistRoute).toContain(
      "$coherence-manuscript-publish",
    );
    expect(routes.technical?.specialistRoute).toContain(
      "$coherence-build-feature",
    );
    expect(routes.audio?.specialistRoute).toContain(
      "audiobook publication workflow",
    );
    expect(routes.citation?.authority).toContain(
      "Named decision authority in the ticket",
    );
    expect(routes.citation?.authority.toLowerCase()).toContain(
      "primary source evidence",
    );
    expect(routes.citation?.specialistRoute).toContain(
      "Resolve the named evidence question first",
    );
    expect(routes.factual?.specialistRoute).toContain(
      "$coherence-editorial-review",
    );
  });

  it("renders complete briefs in markdown and JSON", () => {
    const item = debtItem({
      partialPaydown: "One affected paragraph was corrected.",
      priorPaydown: "An earlier repair covered a narrower source.",
    });
    const markdown = runQueue(["--id", "CTD-0001"], [item]);
    expect(markdown.code).toBe(0);
    expect(markdown.output).toContain("# Editorial Debt Queue");
    expect(markdown.output).toContain("### Paydown criteria");
    expect(markdown.output).toContain("One affected paragraph was corrected.");
    expect(markdown.output).toContain("Specialist route: $coherence-editorial-review");

    const json = jsonOutput(
      runQueue(["--id", "CTD-0001", "--format", "json"], [item]),
    );
    expect(json.items[0]).toMatchObject({
      file: "ctd-0001-test-obligation.md",
      authority: "Human editor",
      debt: "The obligation remains visible.",
      evidence: "The named source demonstrates the problem.",
      paydownCriteria: "Correct the source and prove the result.",
      partialPaydown: "One affected paragraph was corrected.",
      priorPaydown: "An earlier repair covered a narrower source.",
    });
  });

  it("treats quick wins only as boundedness candidates", () => {
    const items = [
      debtItem({ id: "CTD-0001", severity: "low" }),
      debtItem({ id: "CTD-0002", severity: "critical" }),
      debtItem({ id: "CTD-0003", scopes: ["corpus"] }),
      debtItem({ id: "CTD-0004", status: "query", kind: "canon" }),
      debtItem({ id: "CTD-0005", sources: ["package.json", "README.md"] }),
      debtItem({
        id: "CTD-0006",
        title: "Complete a broad manuscript pass",
        paydownCriteria:
          "Read every retained passage in the complete volume.",
      }),
    ];
    const queue = jsonOutput(
      runQueue(
        ["--preset", "quick-win", "--limit", "10", "--format", "json"],
        items,
      ),
    );
    expect(queue.items.map((item) => item.metadata.id)).toEqual(["CTD-0001"]);
    expect(queue.items[0]?.boundednessCandidate).toEqual({
      candidate: true,
      basis: expect.stringContaining("not an effort estimate or completion promise"),
    });
  });

  it("orders matches by severity and then by ID", () => {
    const items = [
      debtItem({ id: "CTD-0003", severity: "medium" }),
      debtItem({ id: "CTD-0002", severity: "high" }),
      debtItem({ id: "CTD-0001", severity: "high" }),
    ];
    const queue = jsonOutput(
      runQueue(["--limit", "3", "--format", "json"], items),
    );
    expect(queue.items.map((item) => item.metadata.id)).toEqual([
      "CTD-0001",
      "CTD-0002",
      "CTD-0003",
    ]);
  });

  it("reads a queue without modifying its item files", () => {
    const itemsRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "coherence-debt-queue-"),
    );
    const file = path.join(itemsRoot, "ctd-0001-test-obligation.md");
    const source = debtSource();
    fs.writeFileSync(file, source);
    const entriesBefore = fs.readdirSync(itemsRoot);
    try {
      const output: string[] = [];
      const code = runEditorialDebtQueueCli(["--id", "CTD-0001"], {
        loadItems: () => loadEditorialDebtItems(itemsRoot),
        stdout: (message) => output.push(message),
        stderr: () => undefined,
      });
      expect(code).toBe(0);
      expect(output.join("\n")).toContain("CTD-0001");
      expect(fs.readFileSync(file, "utf8")).toBe(source);
      expect(fs.readdirSync(itemsRoot)).toEqual(entriesBefore);
    } finally {
      fs.rmSync(itemsRoot, { recursive: true, force: true });
    }
  });
});
