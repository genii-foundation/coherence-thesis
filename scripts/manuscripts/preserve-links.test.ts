import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type {
  CompiledCatalog,
  CompiledChapter,
  CompiledPart,
  CompiledSection,
  CompiledVolume,
} from "./shared";
import { resolvePublishedRoute } from "./shared";
import {
  planLinkPreservation,
  proseSimilarity,
  writeLinkPreservationPlan,
} from "./preserve-links";

function section({
  id,
  href,
  hash,
  text,
  partId = "part",
  chapterId = "chapter",
}: {
  id: string;
  href: string;
  hash: string;
  text: string;
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
    continuityId: id,
    legacyContinuityIds: [],
    progressContinuityGroups: [[id]],
    legacySectionIds: [],
    title: id,
    sectionOrder: 1,
    sourceDoc: "sources/manuscripts/volume.md",
    sourceParagraphStart: 10,
    sourceParagraphEnd: 20,
    path: `${id}.md`,
    href,
    chapterHref: `/manuscripts/1/${partId}/${chapterId}/`,
    readerHref: href,
    body: text,
    text,
    paragraphs: [],
    wordCount: text.split(/\s+/).length,
    readingMinutes: 1,
    contentHash: hash,
    versionHash: hash,
    versionDate: "",
    versionUrl: "",
    audioVersionId: `${id}-${hash}`,
    previousSectionId: null,
    nextSectionId: null,
  };
}

function catalog(
  sections: CompiledSection[],
  {
    partHref = "/manuscripts/1/part/",
    chapterHref = "/manuscripts/1/part/chapter/",
    aliases = [],
  }: {
    partHref?: string;
    chapterHref?: string;
    aliases?: CompiledCatalog["aliases"];
  } = {},
): CompiledCatalog {
  const chapter: CompiledChapter = {
    chapterId: sections[0]?.chapterId ?? "chapter",
    title: "Chapter",
    order: 1,
    href: chapterHref,
    sectionIds: sections.map((item) => item.sectionId),
    wordCount: 10,
  };
  const part: CompiledPart = {
    partId: sections[0]?.partId ?? "part",
    title: "Part",
    order: 1,
    href: partHref,
    chapters: [chapter],
    sectionIds: sections.map((item) => item.sectionId),
    wordCount: 10,
  };
  const volume: CompiledVolume = {
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
  return {
    siteTitle: "Test",
    generatedFrom: "test",
    gitRevision: "test",
    stats: {
      volumeCount: 1,
      partCount: 1,
      chapterCount: 1,
      sectionCount: sections.length,
      wordCount: 10,
      readingMinutes: 1,
    },
    volumes: [volume],
    sections,
    aliases,
    routeAliases: [],
    overview: { title: "", subtitle: "", readingMinutes: 1, nodes: [] },
  };
}

describe("editorial link preservation", () => {
  it("keeps an unchanged progress lineage stable", () => {
    const current = section({
      id: "current",
      href: "/manuscripts/1/part/chapter/current/",
      hash: "same",
      text: "Persistent text.",
    });
    current.legacyContinuityIds = ["historical"];
    current.progressContinuityGroups = [["current", "historical"]];
    current.legacySectionIds = ["historical"];
    const established = {
      version: 1 as const,
      sections: [
        {
          currentSectionId: "current",
          continuityIds: ["current", "historical"],
          historicalSectionIds: ["historical"],
          progressContinuityGroups: [["current", "historical"]],
        },
      ],
    };
    const plan = planLinkPreservation({
      previous: catalog([current]),
      current: catalog([current]),
      existingSectionLineage: established,
    });

    expect(plan.unresolved).toEqual([]);
    expect(plan.sectionLineage).toEqual(established);
    expect(plan.changed).toBe(false);
  });

  it("maps a renamed section by unchanged content and aliases every old route", () => {
    const previousSection = section({
      id: "old-id",
      href: "/manuscripts/1/old-part/old-section/",
      hash: "same-hash",
      text: "The same argument remains in this section.",
      partId: "old-part",
      chapterId: "old-chapter",
    });
    const currentSection = section({
      id: "better-id",
      href: "/manuscripts/1/better-part/better-section/",
      hash: "same-hash",
      text: "The same argument remains in this section.",
      partId: "better-part",
      chapterId: "better-chapter",
    });
    const plan = planLinkPreservation({
      previous: catalog([previousSection], {
        partHref: "/manuscripts/1/old-part/",
        chapterHref: "/manuscripts/1/old-part/old-chapter/",
      }),
      current: catalog([currentSection], {
        partHref: "/manuscripts/1/better-part/",
        chapterHref: "/manuscripts/1/better-part/better-chapter/",
      }),
    });

    expect(plan.unresolved).toEqual([]);
    expect(plan.lineage).toEqual([
      expect.objectContaining({
        previousSectionId: "old-id",
        currentSectionId: "better-id",
        reason: "same-content",
      }),
    ]);
    expect(plan.addedSectionAliases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceHref: "/manuscripts/1/old-part/old-section/",
          targetSectionId: "better-id",
        }),
      ]),
    );
    expect(plan.addedRouteAliases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceHref: "/manuscripts/1/old-part/",
          targetHref: "/manuscripts/1/better-part/",
        }),
        expect.objectContaining({
          sourceHref: "/manuscripts/1/old-part/old-chapter/",
          targetHref: "/manuscripts/1/better-part/better-chapter/",
        }),
      ]),
    );
  });

  it("updates a historical alias when its target identity evolves", () => {
    const previousSection = section({
      id: "old-id",
      href: "/old/",
      hash: "same",
      text: "Persistent text.",
    });
    const currentSection = section({
      id: "new-id",
      href: "/new/",
      hash: "same",
      text: "Persistent text.",
    });
    const plan = planLinkPreservation({
      previous: catalog([previousSection]),
      current: catalog([currentSection]),
      existingSectionAliases: {
        version: 1,
        aliases: [{ sourceHref: "/ancient/", targetSectionId: "old-id" }],
      },
    });

    expect(plan.updatedSectionAliases).toContainEqual(
      expect.objectContaining({ sourceHref: "/ancient/", targetSectionId: "new-id" }),
    );
  });

  it("refreshes a historical mapping target through resolved lineage", () => {
    const previousSection = section({
      id: "old-id",
      href: "/old/",
      hash: "same",
      text: "Persistent text.",
    });
    const currentSection = section({
      id: "new-id",
      href: "/new/",
      hash: "same",
      text: "Persistent text.",
    });
    const plan = planLinkPreservation({
      previous: catalog([previousSection]),
      current: catalog([currentSection]),
      existingHistoricalSectionMappings: {
        version: 1,
        mappings: [
          { oldSectionId: "ancient-id", currentSectionId: "old-id" },
        ],
      },
    });

    expect(plan.unresolved).toEqual([]);
    expect(plan.historicalSectionMappings.mappings).toEqual([
      { oldSectionId: "ancient-id", currentSectionId: "new-id" },
    ]);
    expect(plan.updatedHistoricalSectionMappings).toEqual([
      { oldSectionId: "ancient-id", currentSectionId: "new-id" },
    ]);
  });

  it("counts an unresolvable historical mapping target as unresolved", () => {
    const current = section({
      id: "current",
      href: "/current/",
      hash: "same",
      text: "Persistent text.",
    });
    const plan = planLinkPreservation({
      previous: catalog([current]),
      current: catalog([current]),
      existingHistoricalSectionMappings: {
        version: 1,
        mappings: [
          { oldSectionId: "ancient-id", currentSectionId: "missing-id" },
        ],
      },
    });

    expect(plan.unresolved).toContainEqual({
      previousSectionId: "ancient-id",
      message:
        "Historical section mapping target 'missing-id' has no confirmed current lineage owner.",
    });
  });

  it("writes only the historical mapping file when it is the only stale artifact", () => {
    const previousSection = section({
      id: "old-id",
      href: "/old/",
      hash: "same",
      text: "Persistent text.",
    });
    const currentSection = section({
      id: "new-id",
      href: "/new/",
      hash: "same",
      text: "Persistent text.",
    });
    const staleHistoricalMappings = {
      version: 1,
      mappings: [{ oldSectionId: "ancient-id", currentSectionId: "old-id" }],
    };
    const plan = planLinkPreservation({
      previous: catalog([previousSection]),
      current: catalog([currentSection]),
      existingHistoricalSectionMappings: staleHistoricalMappings,
    });
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "preserve-links-"));
    const paths = {
      sectionLineage: path.join(directory, "section-lineage.json"),
      sectionAliases: path.join(directory, "aliases.json"),
      routeAliases: path.join(directory, "route-aliases.json"),
      historicalSectionMappings: path.join(
        directory,
        "historical-section-mappings.json",
      ),
    };
    try {
      fs.writeFileSync(paths.sectionLineage, JSON.stringify(plan.sectionLineage));
      fs.writeFileSync(paths.sectionAliases, JSON.stringify(plan.sectionAliases));
      fs.writeFileSync(paths.routeAliases, JSON.stringify(plan.routeAliases));
      fs.writeFileSync(
        paths.historicalSectionMappings,
        JSON.stringify(staleHistoricalMappings),
      );

      expect(writeLinkPreservationPlan(plan, paths)).toEqual([
        paths.historicalSectionMappings,
      ]);
      expect(
        JSON.parse(fs.readFileSync(paths.historicalSectionMappings, "utf8")),
      ).toEqual(plan.historicalSectionMappings);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("requires an explicit mapping when prose and identity both change beyond recognition", () => {
    const previousSection = section({
      id: "old-id",
      href: "/old/",
      hash: "old",
      text: "Rivers carry memory through a valley of stone.",
    });
    const currentSection = section({
      id: "new-id",
      href: "/new/",
      hash: "new",
      text: "Institutional protocols allocate authority across committees.",
    });

    const unresolved = planLinkPreservation({
      previous: catalog([previousSection]),
      current: catalog([currentSection]),
    });
    expect(unresolved.unresolved).not.toEqual([]);

    const resolved = planLinkPreservation({
      previous: catalog([previousSection]),
      current: catalog([currentSection]),
      explicitMappings: new Map([["old-id", "new-id"]]),
    });
    expect(resolved.unresolved).toEqual([]);
    expect(resolved.addedSectionAliases).toContainEqual(
      expect.objectContaining({ sourceHref: "/old/", targetSectionId: "new-id" }),
    );
  });

  it("allows several retired sections to map explicitly to one merged successor", () => {
    const first = section({
      id: "old-first",
      href: "/old-first/",
      hash: "first",
      text: "The first retired section.",
    });
    const second = section({
      id: "old-second",
      href: "/old-second/",
      hash: "second",
      text: "The second retired section.",
    });
    const merged = section({
      id: "merged",
      href: "/merged/",
      hash: "merged",
      text: "A new synthesis replaces both retired sections.",
    });
    const plan = planLinkPreservation({
      previous: catalog([first, second]),
      current: catalog([merged]),
      explicitMappings: new Map([
        ["old-first", "merged"],
        ["old-second", "merged"],
      ]),
    });

    expect(plan.unresolved).toEqual([]);
    expect(plan.addedSectionAliases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceHref: "/old-first/",
          targetSectionId: "merged",
        }),
        expect.objectContaining({
          sourceHref: "/old-second/",
          targetSectionId: "merged",
        }),
      ]),
    );
    expect(plan.sectionLineage.sections).toContainEqual(
      expect.objectContaining({
        currentSectionId: "merged",
        continuityIds: ["old-first", "old-second"],
        progressContinuityGroups: [["old-first"], ["old-second"]],
        historicalSectionIds: ["old-first", "old-second"],
      }),
    );
  });

  it("requires identity-level allocation when a merged lineage splits", () => {
    const merged = section({
      id: "merged",
      href: "/merged/",
      hash: "old",
      text: "The formerly merged section.",
    });
    merged.continuityId = "old-a";
    merged.legacyContinuityIds = ["old-b"];
    merged.progressContinuityGroups = [["old-a"], ["old-b"]];
    merged.legacySectionIds = ["old-a", "old-b"];
    const primary = section({
      id: "primary",
      href: "/primary/",
      hash: "new-a",
      text: "The first successor.",
    });
    const secondary = section({
      id: "secondary",
      href: "/secondary/",
      hash: "new-b",
      text: "The second successor.",
    });
    const baseOptions = {
      previous: catalog([merged]),
      current: catalog([primary, secondary]),
      explicitMappings: new Map([["merged", "primary"]]),
      existingRouteLedger: {
        version: 2,
        routes: [
          {
            href: "/old-a/",
            kind: "section-alias" as const,
            targetContinuityIds: ["old-a"],
          },
          {
            href: "/old-b/",
            kind: "section-alias" as const,
            targetContinuityIds: ["old-b"],
          },
        ],
      },
      explicitRouteMappings: new Map([
        ["/old-a/", "/primary/"],
        ["/old-b/", "/secondary/"],
      ]),
    };

    const unsafe = planLinkPreservation(baseOptions);
    expect(unsafe.unresolved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("Merged lineage cannot be assigned"),
        }),
      ]),
    );

    const reviewed = planLinkPreservation({
      ...baseOptions,
      explicitContinuityMappings: new Map([
        ["old-a", "primary"],
        ["old-b", "secondary"],
        ["merged", "primary"],
      ]),
    });

    expect(reviewed.unresolved).toEqual([]);
    expect(reviewed.sectionLineage.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          currentSectionId: "primary",
          continuityIds: ["old-a"],
          progressContinuityGroups: [["old-a"]],
        }),
        expect.objectContaining({
          currentSectionId: "secondary",
          continuityIds: ["old-b"],
          progressContinuityGroups: [["old-b"]],
        }),
      ]),
    );
    expect(reviewed.sectionAliases.aliases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceHref: "/old-a/",
          targetSectionId: "primary",
        }),
        expect.objectContaining({
          sourceHref: "/old-b/",
          targetSectionId: "secondary",
        }),
      ]),
    );
  });

  it("requires an explicit mapping for a route found only in the ledger", () => {
    const current = section({
      id: "current",
      href: "/current/",
      hash: "same",
      text: "Persistent text.",
    });
    const options = {
      previous: catalog([current]),
      current: catalog([current]),
      existingRouteLedger: {
        version: 2,
        routes: [
          {
            href: "/ledger-only/",
            kind: "section-alias" as const,
            targetContinuityIds: ["current"],
          },
        ],
      },
    };

    const unresolved = planLinkPreservation(options);
    expect(unresolved.unresolved).toContainEqual(
      expect.objectContaining({
        sourceHref: "/ledger-only/",
        message: expect.stringContaining("recorded only in the historical ledger"),
      }),
    );

    const reviewed = planLinkPreservation({
      ...options,
      explicitRouteMappings: new Map([["/ledger-only/", "/current/"]]),
    });
    expect(reviewed.unresolved).toEqual([]);
    expect(reviewed.addedSectionAliases).toContainEqual(
      expect.objectContaining({
        sourceHref: "/ledger-only/",
        targetSectionId: "current",
      }),
    );
  });

  it("uses fuzzy similarity only as a suggestion", () => {
    const previousSection = section({
      id: "old-id",
      href: "/old/",
      hash: "old",
      text: "A coherent institution earns trust through accountable practice.",
    });
    const currentSection = section({
      id: "new-id",
      href: "/new/",
      hash: "new",
      text: "Coherent institutions earn trust through practices of accountability.",
    });
    const plan = planLinkPreservation({
      previous: catalog([previousSection]),
      current: catalog([currentSection]),
    });

    expect(plan.lineage).toEqual([]);
    expect(plan.addedSectionAliases).toEqual([]);
    expect(plan.unresolved[0]?.candidates?.[0]).toEqual(
      expect.objectContaining({ sectionId: "new-id" }),
    );
  });

  it("keeps an established identity through a deep rewrite", () => {
    const previousSection = section({
      id: "same-id",
      href: "/same/",
      hash: "old",
      text: "The former argument and image.",
    });
    const currentSection = section({
      id: "same-id",
      href: "/same/",
      hash: "new",
      text: "A completely rebuilt argument in a different register.",
    });
    const plan = planLinkPreservation({
      previous: catalog([previousSection]),
      current: catalog([currentSection]),
      existingSectionLineage: {
        version: 1,
        sections: [
          {
            currentSectionId: "same-id",
            continuityIds: ["same-id"],
            historicalSectionIds: [],
          },
        ],
      },
    });

    expect(plan.unresolved).toEqual([]);
    expect(plan.lineage).toContainEqual(
      expect.objectContaining({ reason: "established-lineage" }),
    );
  });

  it("reuses saved lineage after a renamed section is deeply rewritten", () => {
    const previousSection = section({
      id: "old-id",
      href: "/old/",
      hash: "old",
      text: "The former argument and image.",
    });
    const currentSection = section({
      id: "better-id",
      href: "/better/",
      hash: "new",
      text: "A completely rebuilt argument in a different register.",
    });
    const plan = planLinkPreservation({
      previous: catalog([previousSection]),
      current: catalog([currentSection]),
      existingSectionLineage: {
        version: 1,
        sections: [
          {
            currentSectionId: "better-id",
            continuityIds: ["old-id"],
            historicalSectionIds: ["old-id"],
            progressContinuityGroups: [["old-id"]],
          },
        ],
      },
      existingSectionAliases: {
        version: 1,
        aliases: [{ sourceHref: "/old/", targetSectionId: "better-id" }],
      },
    });

    expect(plan.unresolved).toEqual([]);
    expect(plan.lineage).toEqual([
      expect.objectContaining({
        previousSectionId: "old-id",
        currentSectionId: "better-id",
        reason: "established-lineage",
      }),
    ]);
    expect(plan.sectionLineage.sections).toContainEqual(
      expect.objectContaining({
        currentSectionId: "better-id",
        continuityIds: ["old-id"],
        historicalSectionIds: ["old-id"],
      }),
    );
  });

  it("reuses saved lineage for several retired sections sharing one successor", () => {
    const first = section({
      id: "old-first",
      href: "/old-first/",
      hash: "first",
      text: "The first retired section.",
    });
    const second = section({
      id: "old-second",
      href: "/old-second/",
      hash: "second",
      text: "The second retired section.",
    });
    const current = section({
      id: "merged",
      href: "/merged/",
      hash: "merged",
      text: "A new synthesis replaces both retired sections.",
    });
    const plan = planLinkPreservation({
      previous: catalog([first, second]),
      current: catalog([current]),
      existingSectionLineage: {
        version: 1,
        sections: [
          {
            currentSectionId: "merged",
            continuityIds: ["old-first", "old-second"],
            historicalSectionIds: ["old-first", "old-second"],
            progressContinuityGroups: [["old-first"], ["old-second"]],
          },
        ],
      },
      existingSectionAliases: {
        version: 1,
        aliases: [
          { sourceHref: "/old-first/", targetSectionId: "merged" },
          { sourceHref: "/old-second/", targetSectionId: "merged" },
        ],
      },
    });

    expect(plan.unresolved).toEqual([]);
    expect(plan.lineage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          previousSectionId: "old-first",
          currentSectionId: "merged",
          reason: "established-lineage",
        }),
        expect.objectContaining({
          previousSectionId: "old-second",
          currentSectionId: "merged",
          reason: "established-lineage",
        }),
      ]),
    );
    expect(plan.sectionLineage.sections).toContainEqual(
      expect.objectContaining({
        currentSectionId: "merged",
        continuityIds: ["old-first", "old-second"],
        historicalSectionIds: ["old-first", "old-second"],
      }),
    );
  });

  it("assigns a split lineage to only one reviewed successor", () => {
    const previousSection = section({
      id: "whole",
      href: "/whole/",
      hash: "old",
      text: "One section before the split.",
    });
    const primary = section({
      id: "primary",
      href: "/primary/",
      hash: "new-a",
      text: "The primary successor.",
    });
    const secondary = section({
      id: "secondary",
      href: "/secondary/",
      hash: "new-b",
      text: "The new companion section.",
    });
    const plan = planLinkPreservation({
      previous: catalog([previousSection]),
      current: catalog([primary, secondary]),
      explicitMappings: new Map([["whole", "primary"]]),
    });
    const primaryLineage = plan.sectionLineage.sections.find(
      (entry) => entry.currentSectionId === "primary",
    );
    const secondaryLineage = plan.sectionLineage.sections.find(
      (entry) => entry.currentSectionId === "secondary",
    );

    expect(primaryLineage?.continuityIds).toContain("whole");
    expect(secondaryLineage?.continuityIds).not.toContain("whole");
  });

  it("does not let a new section steal a reserved continuity identity", () => {
    const retired = section({
      id: "retired-id",
      href: "/retired/",
      hash: "old",
      text: "The historical section.",
    });
    const unrelatedReuse = section({
      id: "retired-id",
      href: "/unrelated/",
      hash: "unrelated",
      text: "An unrelated new section.",
    });
    const successor = section({
      id: "successor",
      href: "/successor/",
      hash: "successor",
      text: "The reviewed successor.",
    });
    const plan = planLinkPreservation({
      previous: catalog([retired]),
      current: catalog([unrelatedReuse, successor]),
      explicitMappings: new Map([["retired-id", "successor"]]),
    });
    const reuseLineage = plan.sectionLineage.sections.find(
      (entry) => entry.currentSectionId === "retired-id",
    );
    const successorLineage = plan.sectionLineage.sections.find(
      (entry) => entry.currentSectionId === "successor",
    );

    expect(reuseLineage?.continuityIds).not.toContain("retired-id");
    expect(successorLineage?.continuityIds).toContain("retired-id");
    expect(plan.unresolved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("owned by both") }),
      ]),
    );
  });

  it("does not preserve an alias whose old path becomes canonical again", () => {
    const currentSection = section({
      id: "current",
      href: "/restored/",
      hash: "same",
      text: "Persistent text.",
    });
    const plan = planLinkPreservation({
      previous: catalog([currentSection]),
      current: catalog([currentSection]),
      existingSectionAliases: {
        version: 1,
        aliases: [{ sourceHref: "/restored/", targetSectionId: "current" }],
      },
    });

    expect(plan.removedSectionAliases).toContainEqual(
      expect.objectContaining({ sourceHref: "/restored/" }),
    );
    expect(plan.sectionAliases.aliases).toEqual([]);
  });

  it("scores related prose above unrelated prose", () => {
    expect(
      proseSimilarity(
        "A coherent institution earns trust through accountable practice.",
        "Coherent institutions earn trust through practices of accountability.",
      ),
    ).toBeGreaterThan(
      proseSimilarity(
        "A coherent institution earns trust through accountable practice.",
        "The telescope crossed a winter sky above the mountain.",
      ),
    );
  });

  it("resolves a reviewed structural alias to the target lineage", () => {
    const currentSection = section({
      id: "current",
      href: "/manuscripts/1/part/chapter/current/",
      hash: "hash",
      text: "Current text.",
    });
    const currentCatalog = catalog([currentSection]);
    currentCatalog.routeAliases = [
      {
        sourceHref: "/manuscripts/1/old-part/old-chapter/",
        targetHref: "/manuscripts/1/part/chapter/",
      },
    ];

    expect(
      resolvePublishedRoute(
        currentCatalog,
        "/manuscripts/1/old-part/old-chapter/",
      ),
    ).toEqual(
      expect.objectContaining({
        kind: "route-alias",
        targetContinuityIds: ["current"],
        targetHref: "/manuscripts/1/part/chapter/",
      }),
    );
  });

  it("promotes a retired generated route alias into the committed config", () => {
    const currentSection = section({
      id: "current",
      href: "/manuscripts/1/part/chapter/current/",
      hash: "hash",
      text: "Current text.",
    });
    const previous = catalog([currentSection]);
    previous.routeAliases = [
      {
        sourceHref: "/manuscripts/1/front-matter/",
        targetHref: "/manuscripts/1/part/",
        note: "Generated compatibility route.",
      },
    ];

    const plan = planLinkPreservation({
      previous,
      current: catalog([currentSection]),
    });

    expect(plan.unresolved).toEqual([]);
    expect(plan.addedRouteAliases).toContainEqual({
      sourceHref: "/manuscripts/1/front-matter/",
      targetHref: "/manuscripts/1/part/",
      note: "Generated compatibility route.",
    });
  });

  it("does not commit a generated route alias that the current catalog still serves", () => {
    const currentSection = section({
      id: "current",
      href: "/manuscripts/1/part/chapter/current/",
      hash: "hash",
      text: "Current text.",
    });
    const previous = catalog([currentSection]);
    const current = catalog([currentSection]);
    const generatedAlias = {
      sourceHref: "/manuscripts/1/front-matter/",
      targetHref: "/manuscripts/1/part/",
      note: "Generated compatibility route.",
    };
    previous.routeAliases = [generatedAlias];
    current.routeAliases = [generatedAlias];

    const plan = planLinkPreservation({ previous, current });

    expect(plan.unresolved).toEqual([]);
    expect(plan.routeAliases.aliases).toEqual([]);
    expect(plan.addedRouteAliases).toEqual([]);
  });

  it("accepts a route map whose source is a generated historical alias", () => {
    const currentSection = section({
      id: "current",
      href: "/manuscripts/1/part/chapter/current/",
      hash: "hash",
      text: "Current text.",
    });
    const previous = catalog([currentSection], {
      partHref: "/manuscripts/1/old-part/",
      chapterHref: "/manuscripts/1/old-part/chapter/",
    });
    previous.routeAliases = [
      {
        sourceHref: "/manuscripts/1/front-matter/",
        targetHref: "/manuscripts/1/old-part/",
      },
    ];
    const current = catalog([currentSection], {
      partHref: "/manuscripts/1/new-part/",
      chapterHref: "/manuscripts/1/new-part/chapter/",
    });

    const plan = planLinkPreservation({
      previous,
      current,
      explicitRouteMappings: new Map([
        ["/manuscripts/1/front-matter/", "/manuscripts/1/new-part/"],
      ]),
    });

    expect(plan.unresolved).toEqual([]);
    expect(plan.addedRouteAliases).toContainEqual(
      expect.objectContaining({
        sourceHref: "/manuscripts/1/front-matter/",
        targetHref: "/manuscripts/1/new-part/",
      }),
    );
  });

  it("carries a generated alias through the reviewed mapping of its old target", () => {
    const currentSection = section({
      id: "current",
      href: "/manuscripts/1/part/chapter/current/",
      hash: "hash",
      text: "Current text.",
    });
    const previous = catalog([currentSection], {
      partHref: "/manuscripts/1/old-part/",
      chapterHref: "/manuscripts/1/old-part/chapter/",
    });
    previous.routeAliases = [
      {
        sourceHref: "/manuscripts/1/front-matter/",
        targetHref: "/manuscripts/1/old-part/",
      },
    ];
    const current = catalog([currentSection], {
      partHref: "/manuscripts/1/new-part/",
      chapterHref: "/manuscripts/1/new-part/chapter/",
    });

    const plan = planLinkPreservation({
      previous,
      current,
      explicitRouteMappings: new Map([
        ["/manuscripts/1/old-part/", "/manuscripts/1/new-part/"],
      ]),
    });

    expect(plan.unresolved).toEqual([]);
    expect(plan.addedRouteAliases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceHref: "/manuscripts/1/front-matter/",
          targetHref: "/manuscripts/1/new-part/",
        }),
        expect.objectContaining({
          sourceHref: "/manuscripts/1/old-part/",
          targetHref: "/manuscripts/1/new-part/",
        }),
      ]),
    );
  });
});
