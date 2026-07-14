import { describe, expect, it } from "vitest";
import {
  semanticLinkOccurrenceId,
  type SemanticLinkConcept,
  type SemanticLinkOccurrence,
  type SemanticLinkRegistry,
  type SemanticLinkRouteLevel,
} from "../editorial/semantic-links";
import { paragraphFingerprints } from "./io";
import {
  applySemanticReferences,
  locateSemanticReferenceMatch,
  resolveSemanticReferenceHref,
  resolveSemanticReferenceOwner,
  resolveSemanticReferenceParagraph,
} from "./semantic-references";
import type { CompiledPart, CompiledSection, CompiledVolume } from "./types";

const approval = {
  state: "approved" as const,
  date: "2026-07-14",
  rationale: "Reviewed as explicit structural wayfinding.",
};

const seedLabels = [
  { text: "seed", caseSensitive: false, wholeWord: true },
] as const;

function section({
  id,
  body,
  continuityId = id,
  legacyContinuityIds = [],
  readerHref = `/reader/${id}/`,
  chapterHref = "/manuscripts/1/part/chapter/",
  partId = "part",
  chapterId = "chapter",
}: {
  id: string;
  body: string;
  continuityId?: string;
  legacyContinuityIds?: string[];
  readerHref?: string;
  chapterHref?: string;
  partId?: string;
  chapterId?: string;
}): CompiledSection {
  return {
    volumeId: "volume",
    volumeTitle: "Volume",
    volumeOrder: 1,
    partId,
    partTitle: "Part",
    partOrder: 1,
    chapterId,
    chapterTitle: "Chapter",
    chapterOrder: 1,
    sectionId: id,
    continuityId,
    legacyContinuityIds,
    progressContinuityGroups: [[continuityId]],
    legacySectionIds: [],
    title: id,
    sectionOrder: 1,
    sourceDoc: "editorial/sources/volumes/volume-01/manuscript.md",
    sourceHash: "source-hash",
    sourceParagraphStart: 1,
    sourceParagraphEnd: 1,
    path: `${id}.md`,
    href: `/manuscripts/1/part/chapter/${id}/`,
    chapterHref,
    readerHref,
    body,
    text: `raw text for ${id}`,
    paragraphs: paragraphFingerprints(body),
    wordCount: 4,
    readingMinutes: 1,
    contentHash: `content-${id}`,
    versionHash: `version-${id}`,
    versionDate: "",
    versionUrl: "",
    audioVersionId: `audio-${id}`,
    previousSectionId: null,
    nextSectionId: null,
  };
}

function volume(sections: readonly CompiledSection[]): CompiledVolume {
  const part: CompiledPart = {
    partId: "part",
    title: "Part",
    order: 1,
    href: "/manuscripts/1/part/",
    chapters: [
      {
        chapterId: "chapter",
        title: "Chapter",
        order: 1,
        href: "/manuscripts/1/part/chapter/",
        sectionIds: sections.map((item) => item.sectionId),
        wordCount: 10,
      },
    ],
    sectionIds: sections.map((item) => item.sectionId),
    wordCount: 10,
  };
  return {
    volumeId: "volume",
    title: "Volume",
    subtitle: "",
    order: 1,
    numberLabel: "I",
    planet: "Sun",
    coverImage: "",
    coverAlt: "",
    href: "/manuscripts/1/",
    parts: [part],
    sectionIds: sections.map((item) => item.sectionId),
    wordCount: 10,
  };
}

function concept(
  conceptId: string,
  targetContinuityId: string,
  routeLevel: SemanticLinkRouteLevel = "section",
): SemanticLinkConcept {
  return {
    conceptId,
    routeLevel,
    labels: [{ text: conceptId, caseSensitive: false, wholeWord: true }],
    sourceEditorialIds: ["volume-01"],
    targetContinuityId,
    approval,
  };
}

function occurrence({
  conceptId,
  source,
  matchText,
  matchOrdinal = 1,
  decision = "link",
}: {
  conceptId: string;
  source: CompiledSection;
  matchText: string;
  matchOrdinal?: number;
  decision?: "link" | "exclude";
}): SemanticLinkOccurrence {
  const locator = {
    editorialId: "volume-01",
    sectionContinuityId: source.legacyContinuityIds[0] ?? source.continuityId,
    paragraphAnchor: source.paragraphs[0]!.anchor,
    matchText,
    matchOrdinal,
  };
  return {
    occurrenceId: semanticLinkOccurrenceId(conceptId, locator),
    conceptId,
    source: locator,
    decision,
    approval,
  };
}

function registry(
  concepts: SemanticLinkConcept[],
  occurrences: SemanticLinkOccurrence[],
): SemanticLinkRegistry {
  return { schemaVersion: 1, concepts, occurrences };
}

describe("semantic reference continuity resolution", () => {
  it("resolves current and historical continuity identities to one owner", () => {
    const target = section({
      id: "current-seed",
      body: "Target.",
      continuityId: "current-seed",
      legacyContinuityIds: ["the-seed"],
    });

    expect(
      resolveSemanticReferenceOwner([target], "current-seed", "target"),
    ).toBe(target);
    expect(resolveSemanticReferenceOwner([target], "the-seed", "target")).toBe(
      target,
    );
  });

  it("fails distinctly for missing and ambiguous continuity ownership", () => {
    const first = section({
      id: "first",
      body: "First.",
      legacyContinuityIds: ["shared"],
    });
    const second = section({
      id: "second",
      body: "Second.",
      legacyContinuityIds: ["shared"],
    });

    expect(() =>
      resolveSemanticReferenceOwner([first], "missing", "source"),
    ).toThrow("has no current section owner");
    expect(() =>
      resolveSemanticReferenceOwner([first, second], "shared", "target"),
    ).toThrow("has multiple current section owners: first, second");
  });
});

describe("semantic reference destinations", () => {
  it("resolves every route level from current compiled hierarchy", () => {
    const target = section({
      id: "target",
      body: "Target.",
      readerHref: "/reader/target/#section",
      chapterHref: "/manuscripts/1/part/chapter/",
    });
    const volumes = [volume([target])];

    expect(resolveSemanticReferenceHref(volumes, target, "section")).toBe(
      "/reader/target/#section",
    );
    expect(resolveSemanticReferenceHref(volumes, target, "chapter")).toBe(
      "/manuscripts/1/part/chapter/",
    );
    expect(resolveSemanticReferenceHref(volumes, target, "part")).toBe(
      "/manuscripts/1/part/",
    );
    expect(resolveSemanticReferenceHref(volumes, target, "volume")).toBe(
      "/manuscripts/1/",
    );
  });
});

describe("semantic reference prose locations", () => {
  it("locates a paragraph only through its durable anchor", () => {
    const source = section({
      id: "source",
      body: "First paragraph.\n\nSecond paragraph.",
    });
    const second = source.paragraphs[1]!;

    expect(
      resolveSemanticReferenceParagraph(source, second.anchor),
    ).toMatchObject({
      paragraph: second,
      value: "Second paragraph.",
      rawStart: source.body.indexOf("Second paragraph."),
    });
    expect(() =>
      resolveSemanticReferenceParagraph(source, "p-h0000000000000000"),
    ).toThrow("does not exist");
  });

  it("counts only exact eligible prose occurrences", () => {
    const markdown = "seed, [seed](/existing/), `seed`, and seed.";
    const match = locateSemanticReferenceMatch(
      markdown,
      seedLabels,
      "seed",
      2,
    );

    expect(markdown.slice(match.rawStart, match.rawEnd)).toBe("seed");
    expect(match.rawStart).toBe(markdown.lastIndexOf("seed"));
    expect(() =>
      locateSemanticReferenceMatch(markdown, seedLabels, "Seed", 1),
    ).toThrow("Found 0");
    expect(() =>
      locateSemanticReferenceMatch(markdown, seedLabels, "seed", 3),
    ).toThrow("Found 2");
  });

  it("shares case-insensitive ordinals while preserving the reviewed case", () => {
    const markdown = "Seed, then seed.";
    const match = locateSemanticReferenceMatch(
      markdown,
      seedLabels,
      "seed",
      2,
    );

    expect(match.rawStart).toBe(markdown.lastIndexOf("seed"));
    expect(markdown.slice(match.rawStart, match.rawEnd)).toBe("seed");
  });

  it("does not locate a whole-word label inside a longer word", () => {
    const markdown = "A seedling grows from a seed.";
    const match = locateSemanticReferenceMatch(
      markdown,
      seedLabels,
      "seed",
      1,
    );

    expect(match.rawStart).toBe(markdown.lastIndexOf("seed"));
  });

  it("preserves a complete emphasis span when a larger phrase is linked", () => {
    const markdown = "The **seed** grows.";
    const match = locateSemanticReferenceMatch(
      markdown,
      [
        {
          text: "The seed",
          caseSensitive: true,
          wholeWord: true,
        },
      ],
      "The seed",
      1,
    );

    expect(markdown.slice(match.rawStart, match.rawEnd)).toBe("The **seed**");
  });
});

describe("semantic reference body enrichment", () => {
  it("fails when a reviewed editorial source identity no longer owns the section", () => {
    const source = section({ id: "source", body: "The seed grows." });
    const target = section({ id: "target", body: "Target." });
    const seed = concept("seed", "target");
    const approved = occurrence({
      conceptId: "seed",
      source,
      matchText: "seed",
    });
    approved.source.editorialId = "volume-02";

    expect(() =>
      applySemanticReferences({
        sections: [source, target],
        volumes: [volume([source, target])],
        registry: registry([seed], [approved]),
      }),
    ).toThrow("does not belong to 'volume-02'");
  });

  it("links the smallest raw label inside emphasis without changing identity", () => {
    const source = section({
      id: "source",
      body: "The **seed** states the premise.",
      continuityId: "source",
      legacyContinuityIds: ["historical-source"],
    });
    const target = section({
      id: "current-seed",
      body: "Target.",
      continuityId: "current-seed",
      legacyContinuityIds: ["the-seed"],
      readerHref: "/manuscripts/1/the-seed/",
    });
    const seed = concept("seed", "the-seed");
    const approved = occurrence({
      conceptId: "seed",
      source,
      matchText: "seed",
    });
    const sections = [source, target];

    const enriched = applySemanticReferences({
      sections,
      volumes: [volume(sections)],
      registry: registry([seed], [approved]),
    });

    expect(source.body).toBe("The **seed** states the premise.");
    expect(enriched[0]).toEqual({
      ...source,
      body: "The **[seed](/manuscripts/1/the-seed/)** states the premise.",
    });
    expect(enriched[0]?.text).toBe(source.text);
    expect(enriched[0]?.paragraphs).toBe(source.paragraphs);
    expect(enriched[0]?.contentHash).toBe(source.contentHash);
    expect(enriched[1]).toBe(target);
  });

  it("applies multiple raw edits from the end without shifting locators", () => {
    const source = section({ id: "source", body: "Seed, then Soil." });
    const seedTarget = section({
      id: "seed-target",
      body: "Seed target.",
      readerHref: "/seed/",
    });
    const soilTarget = section({
      id: "soil-target",
      body: "Soil target.",
      readerHref: "/soil/",
    });
    const seed = concept("seed", "seed-target");
    const soil = concept("soil", "soil-target");
    const sections = [source, seedTarget, soilTarget];

    const enriched = applySemanticReferences({
      sections,
      volumes: [volume(sections)],
      registry: registry(
        [seed, soil],
        [
          occurrence({ conceptId: "seed", source, matchText: "Seed" }),
          occurrence({ conceptId: "soil", source, matchText: "Soil" }),
        ],
      ),
    });

    expect(enriched[0]?.body).toBe("[Seed](/seed/), then [Soil](/soil/).");
  });

  it("applies the reviewed whole-word occurrence after mixed-case prose", () => {
    const source = section({
      id: "source",
      body: "A seedling grows. Seed, then seed.",
    });
    const target = section({
      id: "seed-target",
      body: "Seed target.",
      readerHref: "/seed/",
    });
    const seed = concept("seed", "seed-target");
    const reviewed = occurrence({
      conceptId: "seed",
      source,
      matchText: "seed",
      matchOrdinal: 2,
    });

    const enriched = applySemanticReferences({
      sections: [source, target],
      volumes: [volume([source, target])],
      registry: registry([seed], [reviewed]),
    });

    expect(enriched[0]?.body).toBe(
      "A seedling grows. Seed, then [seed](/seed/).",
    );
  });

  it("ignores reviewed exclusions", () => {
    const source = section({ id: "source", body: "The seed grows." });
    const target = section({ id: "target", body: "Target." });
    const seed = concept("seed", "target");
    const excluded = occurrence({
      conceptId: "seed",
      source,
      matchText: "seed",
      decision: "exclude",
    });
    const sections = [source, target];

    expect(
      applySemanticReferences({
        sections,
        volumes: [volume(sections)],
        registry: registry([seed], [excluded]),
      }),
    ).toEqual(sections);
  });
});
