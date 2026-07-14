import { describe, expect, it } from "vitest";
import { paragraphFingerprints } from "../manuscripts/shared";
import type { CompiledCatalog } from "../manuscripts/types";
import {
  auditSemanticLinks,
  loadSemanticLinkAuditInput,
  parseSemanticLinkAuditArgs,
  suggestedSectionTitleConcepts,
  type SemanticLinkAuditInput,
  type SemanticLinkAuditSection,
} from "./audit-semantic-links";
import {
  applySemanticLinkReview,
  assertSemanticLinkReportSourcesCurrent,
  parseSemanticLinkReviewArgs,
  validateSemanticLinkReviewShape,
} from "./review-semantic-links";
import {
  semanticLinkAuditReportSha256,
  semanticLinkOccurrenceId,
  validateSemanticLinkRegistryShape,
  type SemanticLinkCandidateTarget,
  type SemanticLinkConcept,
  type SemanticLinkRegistry,
  type SemanticLinkSuggestedConcept,
} from "./semantic-links";
import { validateSemanticLinkAuditState } from "./validate-semantic-links";

function approval(rationale = "Reviewed structural destination.") {
  return {
    state: "approved" as const,
    date: "2026-07-13",
    rationale,
  };
}

function concept(
  conceptId: string,
  label: string,
  targetContinuityId: string,
): SemanticLinkConcept {
  return {
    conceptId,
    routeLevel: "section",
    labels: [{ text: label, caseSensitive: false, wholeWord: true }],
    sourceEditorialIds: ["volume-01"],
    targetContinuityId,
    approval: approval(),
  };
}

const movementConcepts = [
  concept("volume-01-seed", "seed", "v01-the-seed"),
  concept("volume-01-sprout", "sprout", "v01-the-sprout"),
  concept("volume-01-stem", "stem", "v01-the-stem"),
  concept("volume-01-soil", "soil", "v01-the-soil"),
  concept("volume-01-flower", "flower", "v01-the-flower"),
];

function registry(
  concepts: SemanticLinkConcept[] = movementConcepts,
): SemanticLinkRegistry {
  return { schemaVersion: 1, concepts, occurrences: [] };
}

function section(
  body: string,
  overrides: Partial<SemanticLinkAuditSection> = {},
): SemanticLinkAuditSection {
  return {
    editorialId: "volume-01",
    sourcePath: "editorial/sources/volumes/volume-01/manuscript.md",
    sourceHash: "a".repeat(64),
    currentSectionId: "v01-four-movements",
    currentRouteHrefs: ["/manuscripts/1/opening/four-movements/"],
    continuityIds: ["v01-four-movements"],
    sectionTitle: "Four Movements",
    body,
    sourceLineNumbers: body.split("\n").map((_, index) => 50 + index),
    ...overrides,
  };
}

function target(
  conceptValue: SemanticLinkConcept,
  overrides: Partial<SemanticLinkCandidateTarget> = {},
): SemanticLinkCandidateTarget {
  return {
    continuityId: conceptValue.targetContinuityId,
    currentSectionId: conceptValue.targetContinuityId,
    title: `The ${conceptValue.labels[0]!.text}`,
    href: `/manuscripts/1/${conceptValue.labels[0]!.text}/`,
    routeLevel: conceptValue.routeLevel,
    ...overrides,
  };
}

function input(
  registryValue: SemanticLinkRegistry,
  sections: SemanticLinkAuditSection[],
): SemanticLinkAuditInput {
  return {
    registry: registryValue,
    sections,
    targetsByConceptId: new Map(
      registryValue.concepts.map((item) => [item.conceptId, target(item)]),
    ),
  };
}

describe("semantic link registry", () => {
  it("validates approved concepts and deterministic occurrence identities", () => {
    const conceptValue = movementConcepts[0]!;
    const source = {
      editorialId: "volume-01",
      sectionContinuityId: "v01-four-movements",
      paragraphAnchor: "p-h0123456789abcdef",
      matchText: "seed",
      matchOrdinal: 1,
    };
    const occurrenceId = semanticLinkOccurrenceId(
      conceptValue.conceptId,
      source,
    );
    const parsed = validateSemanticLinkRegistryShape({
      schemaVersion: 1,
      concepts: [conceptValue],
      occurrences: [
        {
          occurrenceId,
          conceptId: conceptValue.conceptId,
          source,
          decision: "link",
          approval: approval("This is explicit reader wayfinding."),
        },
      ],
    });

    expect(parsed.occurrences[0]?.occurrenceId).toBe(occurrenceId);
    expect(() =>
      validateSemanticLinkRegistryShape({
        ...parsed,
        occurrences: [
          { ...parsed.occurrences[0], occurrenceId: "handwritten-id" },
        ],
      }),
    ).toThrow("occurrenceId must be");
  });

  it("rejects mappings without explicit approval rationale", () => {
    const conceptValue = movementConcepts[0]!;
    expect(() =>
      validateSemanticLinkRegistryShape({
        schemaVersion: 1,
        concepts: [
          {
            ...conceptValue,
            approval: { ...conceptValue.approval, rationale: "" },
          },
        ],
        occurrences: [],
      }),
    ).toThrow("rationale must be a nonempty string");
  });
});

describe("semantic link advisory audit", () => {
  it("loads raw catalog state when a reviewed source locator is stale", () => {
    const conceptValue = movementConcepts[0]!;
    const source = {
      editorialId: "volume-01",
      sectionContinuityId: "v01-four-movements",
      paragraphAnchor: "p-h0000000000000000",
      matchText: "seed",
      matchOrdinal: 1,
    };
    const staleRegistry: SemanticLinkRegistry = {
      schemaVersion: 1,
      concepts: [conceptValue],
      occurrences: [
        {
          occurrenceId: semanticLinkOccurrenceId(conceptValue.conceptId, source),
          conceptId: conceptValue.conceptId,
          source,
          decision: "link",
          approval: approval("The original source locator was reviewed."),
        },
      ],
    };

    const auditInput = loadSemanticLinkAuditInput(staleRegistry);

    expect(auditInput.registry).toBe(staleRegistry);
    expect(auditInput.sections.length).toBeGreaterThan(0);
    expect(auditInput.targetsByConceptId.get(conceptValue.conceptId)).toMatchObject({
      continuityId: "v01-the-seed",
    });
  });

  it("suggests only distinctive titles with one current owner", () => {
    const catalog = {
      sections: [
        {
          title: "Relational Coherence",
          continuityId: "v02-relational-coherence",
          legacyContinuityIds: [],
        },
        {
          title: "The Outcome",
          continuityId: "v04-the-outcome",
          legacyContinuityIds: [],
        },
        {
          title: "A Shared Structural Title",
          continuityId: "v01-shared-title",
          legacyContinuityIds: [],
        },
        {
          title: "A Shared Structural Title",
          continuityId: "v02-shared-title",
          legacyContinuityIds: [],
        },
      ],
    } as unknown as CompiledCatalog;

    expect(
      suggestedSectionTitleConcepts(catalog, registry([]), [
        "volume-01",
        "volume-02",
      ]),
    ).toEqual([
      expect.objectContaining({
        conceptId: "section-title-v02-relational-coherence",
        targetContinuityId: "v02-relational-coherence",
      }),
    ]);
  });

  it("finds the five emphasized Four Movements destinations with high confidence", () => {
    const body = [
      "The **seed** states the premise in a few minutes. The **sprout** shows why it matters.",
      "The **stem** gives the argument structure, strength, and direction.",
      "The **soil** examines the relational nature of the human being. The **flower** asks what civilization could become.",
    ].join("\n\n");
    const report = auditSemanticLinks(input(registry(), [section(body)]));

    expect(report.counts).toMatchObject({
      matches: 5,
      candidates: 5,
      approvedLinks: 0,
      excluded: 0,
      byConfidence: { high: 5, medium: 0, low: 0 },
    });
    expect(report.candidates.map((candidate) => candidate.source.matchText)).toEqual([
      "seed",
      "sprout",
      "stem",
      "soil",
      "flower",
    ]);
    expect(
      report.candidates.every((candidate) =>
        candidate.signals.includes("emphasized-label"),
      ),
    ).toBe(true);
  });

  it("reports ordinary language conservatively and excludes Markdown contexts", () => {
    const conceptValue = movementConcepts[0]!;
    const body = [
      "## Seed",
      "A seed may remain dormant.",
      "Use `seed` as a variable.",
      "The [seed](/already-linked/) is already linked.",
    ].join("\n\n");
    const report = auditSemanticLinks(
      input(registry([conceptValue]), [section(body)]),
    );

    expect(report.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          confidence: "low",
          disposition: "candidate",
          signals: ["ordinary-language-risk"],
        }),
        expect.objectContaining({
          disposition: "excluded",
          exclusionReason: "heading",
        }),
        expect.objectContaining({
          disposition: "excluded",
          exclusionReason: "inline-code",
        }),
        expect.objectContaining({
          disposition: "excluded",
          exclusionReason: "existing-link",
          existingHref: "/already-linked/",
        }),
      ]),
    );
    expect(report.counts.candidates).toBe(1);
    expect(report.counts.excluded).toBe(3);
  });

  it("numbers mixed-case whole-word matches without matching longer words", () => {
    const conceptValue = movementConcepts[0]!;
    const report = auditSemanticLinks(
      input(
        registry([conceptValue]),
        [section("A seedling grows. Seed, then seed.")],
      ),
    );

    expect(
      report.candidates.map((candidate) => ({
        matchText: candidate.source.matchText,
        matchOrdinal: candidate.source.matchOrdinal,
      })),
    ).toEqual([
      { matchText: "Seed", matchOrdinal: 1 },
      { matchText: "seed", matchOrdinal: 2 },
    ]);
  });

  it("counts approved occurrence ordinals only across compiler-eligible prose", () => {
    const conceptValue = movementConcepts[0]!;
    const report = auditSemanticLinks(
      input(
        registry([conceptValue]),
        [section("An existing [seed](/already-linked/) precedes this seed.")],
      ),
    );
    const existing = report.candidates.find(
      (candidate) => candidate.exclusionReason === "existing-link",
    );
    const eligible = report.candidates.find(
      (candidate) => candidate.disposition === "candidate",
    );

    expect(existing?.source.matchOrdinal).toBe(1);
    expect(eligible?.source.matchOrdinal).toBe(1);
    expect(existing?.candidateId).not.toBe(eligible?.candidateId);
  });

  it("resolves a historical target identity without freezing its current heading", () => {
    const sprout = movementConcepts[1]!;
    const targetValue = target(sprout, {
      currentSectionId: "v01-when-scale-outruns-regulation",
      title: "When Scale Outruns Regulation",
      href: "/manuscripts/1/seed-sprout-stem-and-soil/the-sprout/when-scale-outruns-regulation/",
    });
    const auditInput = input(registry([sprout]), [section("The **sprout** shows why it matters.")]);
    auditInput.targetsByConceptId.set(sprout.conceptId, targetValue);
    const candidate = auditSemanticLinks(auditInput).candidates[0];

    expect(candidate?.target).toEqual(targetValue);
    expect(candidate?.target.continuityId).toBe("v01-the-sprout");
  });

  it("discovers an exact unique section title without a preexisting mapping", () => {
    const suggested: SemanticLinkSuggestedConcept = {
      conceptId: "section-title-v02-relational-coherence",
      routeLevel: "section",
      labels: [
        {
          text: "Relational Coherence",
          caseSensitive: false,
          wholeWord: true,
        },
      ],
      sourceEditorialIds: ["volume-01"],
      targetContinuityId: "v02-relational-coherence",
    };
    const auditInput: SemanticLinkAuditInput = {
      registry: registry([]),
      suggestedConcepts: [suggested],
      sections: [
        section(
          "The argument returns to Relational Coherence before proceeding.",
        ),
      ],
      targetsByConceptId: new Map([
        [
          suggested.conceptId,
          {
            continuityId: suggested.targetContinuityId,
            currentSectionId: suggested.targetContinuityId,
            title: "Relational Coherence",
            href: "/manuscripts/2/relational-coherence/",
            routeLevel: "section",
          },
        ],
      ]),
    };
    const report = auditSemanticLinks(auditInput);
    const candidate = report.candidates[0]!;

    expect(candidate.confidence).toBe("high");
    expect(candidate.signals).toContain("target-title-label");
    expect(candidate.suggestedConcept).toEqual(suggested);

    const reviewed = applySemanticLinkReview(auditInput.registry, report, {
      schemaVersion: 1,
      reportSha256: semanticLinkAuditReportSha256(report),
      date: "2026-07-13",
      decisions: [
        {
          candidateId: candidate.candidateId,
          decision: "link",
          rationale: "The sentence names the exact destination section.",
        },
      ],
    });
    expect(reviewed.concepts).toEqual([
      expect.objectContaining({
        ...suggested,
        approval: expect.objectContaining({ state: "approved" }),
      }),
    ]);
  });

  it("produces byte stable reports without timestamps", () => {
    const auditInput = input(
      registry([movementConcepts[0]!]),
      [section("The **seed** states the premise.")],
    );
    const first = auditSemanticLinks(auditInput);
    const second = auditSemanticLinks(auditInput);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.stringify(first)).not.toContain("generatedAt");
  });
});

describe("semantic link review", () => {
  it("records only named candidates with a per-candidate rationale", () => {
    const initial = registry([movementConcepts[0]!]);
    const auditInput = input(initial, [section("The **seed** states the premise.")]);
    const report = auditSemanticLinks(auditInput);
    const candidate = report.candidates[0]!;
    const review = {
      schemaVersion: 1 as const,
      reportSha256: semanticLinkAuditReportSha256(report),
      date: "2026-07-13",
      decisions: [
        {
          candidateId: candidate.candidateId,
          decision: "link" as const,
          rationale: "This explicitly directs the reader to the Seed section.",
        },
      ],
    };
    const reviewed = applySemanticLinkReview(initial, report, review);

    expect(reviewed.occurrences).toEqual([
      expect.objectContaining({
        occurrenceId: candidate.candidateId,
        decision: "link",
        approval: expect.objectContaining({
          rationale: review.decisions[0]!.rationale,
        }),
      }),
    ]);
    const reviewedReport = validateSemanticLinkAuditState(
      input(reviewed, auditInput.sections),
    );
    expect(reviewedReport.counts.approvedLinks).toBe(1);
  });

  it("rejects empty rationales and reports from another registry", () => {
    const initial = registry([movementConcepts[0]!]);
    const report = auditSemanticLinks(
      input(initial, [section("The **seed** states the premise.")]),
    );
    expect(() =>
      validateSemanticLinkReviewShape({
        schemaVersion: 1,
        reportSha256: semanticLinkAuditReportSha256(report),
        date: "2026-07-13",
        decisions: [
          {
            candidateId: report.candidates[0]!.candidateId,
            decision: "link",
            rationale: "",
          },
        ],
      }),
    ).toThrow("rationale must be a nonempty string");

    const changedRegistry = registry([
      {
        ...movementConcepts[0]!,
        approval: approval("A later mapping review changed this record."),
      },
    ]);
    expect(() =>
      applySemanticLinkReview(changedRegistry, report, {
        schemaVersion: 1,
        reportSha256: semanticLinkAuditReportSha256(report),
        date: "2026-07-13",
        decisions: [
          {
            candidateId: report.candidates[0]!.candidateId,
            decision: "exclude",
            rationale: "This use is metaphorical rather than navigational.",
          },
        ],
      }),
    ).toThrow("different registry");
  });

  it("rejects review reports after canonical source bytes change", () => {
    const initial = registry([movementConcepts[0]!]);
    const report = auditSemanticLinks(
      input(initial, [section("The **seed** states the premise.")]),
    );

    expect(() =>
      assertSemanticLinkReportSourcesCurrent(report, {
        root: "/repository",
        hashFile: () => "a".repeat(64),
      }),
    ).not.toThrow();
    expect(() =>
      assertSemanticLinkReportSourcesCurrent(report, {
        root: "/repository",
        hashFile: () => "b".repeat(64),
      }),
    ).toThrow("report is stale");
  });

  it("fails closed when approved prose identity disappears", () => {
    const initial = registry([movementConcepts[0]!]);
    const sourceSection = section("The **seed** states the premise.");
    const report = auditSemanticLinks(input(initial, [sourceSection]));
    const reviewed = applySemanticLinkReview(initial, report, {
      schemaVersion: 1,
      reportSha256: semanticLinkAuditReportSha256(report),
      date: "2026-07-13",
      decisions: [
        {
          candidateId: report.candidates[0]!.candidateId,
          decision: "link",
          rationale: "This is explicit reader wayfinding to the Seed.",
        },
      ],
    });

    expect(() =>
      validateSemanticLinkAuditState(
        input(reviewed, [section("The premise begins elsewhere.")]),
      ),
    ).toThrow("no longer resolves in canonical prose");
    expect(paragraphFingerprints(sourceSection.body)[0]?.anchor).toMatch(
      /^p-h[0-9a-f]{16}$/,
    );
  });

  it("keeps review writes explicit and offers no bulk approval option", () => {
    expect(
      parseSemanticLinkReviewArgs([
        "--report",
        "generated/reports/semantic-links/candidates.json",
        "--decisions",
        "/tmp/decisions.json",
      ]),
    ).toMatchObject({ write: false });
    expect(
      parseSemanticLinkReviewArgs([
        "--report",
        "generated/reports/semantic-links/candidates.json",
        "--decisions",
        "/tmp/decisions.json",
        "--write",
      ]),
    ).toMatchObject({ write: true });
    expect(() =>
      parseSemanticLinkReviewArgs([
        "--report",
        "generated/reports/semantic-links/candidates.json",
        "--decisions",
        "/tmp/decisions.json",
        "--approve-all-high",
      ]),
    ).toThrow("Unknown semantic link review option");
    expect(parseSemanticLinkAuditArgs([]).stdout).toBe(false);
  });
});
