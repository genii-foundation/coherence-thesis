import { describe, expect, it } from "vitest";
import {
  auditHistoricalLinks,
  selectWritableSuccessor,
} from "./audit-historical-links";

describe("historical manuscript links", () => {
  it(
    "resolves every route found in the complete first-parent catalog history",
    () => {
      const result = auditHistoricalLinks({
        historyRef: "HEAD",
        currentRef: "WORKTREE",
        summaryOnly: true,
        write: false,
        recordLedger: false,
      });

      expect(result.summary.catalogCommitCount).toBeGreaterThan(0);
      expect(result.summary.historicalHrefCount).toBeGreaterThan(3_000);
      expect(result.summary.historicalStaticPathCount).toBeGreaterThan(3_000);
      expect(result.summary.historicalFragmentHrefCount).toBeGreaterThan(400);
      expect(result.summary.brokenHistoricalHrefCount).toBe(0);
    },
    120_000,
  );

  it("accepts only one complete strong successor for a history write", () => {
    const successor = {
      href: "/manuscripts/1/current/",
      kind: "section" as const,
      targetSectionIds: ["current"],
      mappedOldSectionIds: ["old"],
      confidence: "strong" as const,
      evidence: ["working-section-lineage"],
    };
    const route = {
      href: "/manuscripts/1/old/",
      routeKinds: ["section" as const],
      sectionMappings: [
        {
          oldSectionId: "old",
          currentSectionId: "current",
          evidence: ["working-section-lineage"],
        },
      ],
      unmappedOldSectionIds: [],
      obviousCurrentSuccessors: [successor],
    };

    expect(selectWritableSuccessor(route)).toEqual(successor);
    expect(() =>
      selectWritableSuccessor({
        ...route,
        obviousCurrentSuccessors: [successor, { ...successor, href: "/other/" }],
      }),
    ).toThrow(/exactly one is required/i);
    expect(() =>
      selectWritableSuccessor({
        ...route,
        obviousCurrentSuccessors: [
          successor,
          { ...successor, href: "/partial/", confidence: "partial" },
        ],
      }),
    ).toThrow(/partial successor/i);
  });

  it("rejects unmapped identities and historical route role changes", () => {
    const route = {
      href: "/manuscripts/1/old/",
      routeKinds: ["section" as const],
      sectionMappings: [],
      unmappedOldSectionIds: ["old"],
      obviousCurrentSuccessors: [],
    };

    expect(() => selectWritableSuccessor(route)).toThrow(/unmapped section identity/i);
    expect(() =>
      selectWritableSuccessor({
        ...route,
        routeKinds: ["section" as const, "chapter" as const],
        unmappedOldSectionIds: [],
      }),
    ).toThrow(/changed route roles/i);
  });
});
