import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { PublisherNextPage } from "@genii-foundation/publisher-next/server";
import type {
  PublicationReaderEnvelope,
  ReaderSection,
  ReaderWork,
} from "@genii-foundation/publisher-schema";
import { beforeAll, describe, expect, it } from "vitest";

import {
  COHERENCE_PUBLISHER_NARRATION_WORD_BINDING_RECORD_V1_SHA256,
  COHERENCE_PUBLISHER_NARRATION_WORD_TEXT_MAPPING_AUTHORITY_V1_BUILD_ID,
  createCoherencePublisherAudioWordAuthority,
  createCoherencePublisherAudioWordRouteModel,
  serializeCoherencePublisherAudioWordAuthority,
  type CoherencePublisherAudioWordAuthority,
} from "./legacy-audio-word-bridge";
import {
  coherencePublisherAudioWordRouteLimits,
  emptyCoherencePublisherAudioWordRouteModel,
  type CoherencePublisherAudioWordRouteSection,
} from "./legacy-audio-word-bridge-contract";
import type { CoherenceReaderStateMigrationArtifact } from "./reader-state-migration-schema";

const repositoryRoot = process.cwd();
const reader = JSON.parse(
  fs.readFileSync(
    path.join(
      repositoryRoot,
      "generated",
      "publisher",
      "host",
      "publication-reader.json",
    ),
    "utf8",
  ),
) as PublicationReaderEnvelope;
const migrationArtifact = JSON.parse(
  fs.readFileSync(
    path.join(
      repositoryRoot,
      "public",
      "publisher",
      "coherence-reader-state-migration.json",
    ),
    "utf8",
  ),
) as CoherenceReaderStateMigrationArtifact;
const legacyCatalog = JSON.parse(
  fs.readFileSync(
    path.join(repositoryRoot, "generated", "manuscripts", "catalog.json"),
    "utf8",
  ),
) as unknown;
const audioManifest = JSON.parse(
  fs.readFileSync(
    path.join(repositoryRoot, "publishing", "audio", "manifest.json"),
    "utf8",
  ),
) as unknown;
const progressSections = JSON.parse(
  fs.readFileSync(
    path.join(repositoryRoot, "public", "data", "progress-sections.json"),
    "utf8",
  ),
) as Array<{
  audioVersionId: string;
  contentHash: string;
  sectionId: string;
}>;

let authority: CoherencePublisherAudioWordAuthority;

beforeAll(() => {
  authority = createCoherencePublisherAudioWordAuthority({
    audioManifest,
    legacyCatalog,
    migrationArtifact,
    reader,
  });
});

function routeSections(work: ReaderWork, owner: ReaderSection, path: string) {
  const byId = new Map(work.sections.map((section) => [section.id, section]));
  const descendsFromOwner = (candidate: ReaderSection): boolean => {
    const seen = new Set<string>();
    let parentId = candidate.parentId;
    while (parentId !== null && !seen.has(parentId)) {
      if (parentId === owner.id) return true;
      seen.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    return false;
  };
  return work.sections.filter((candidate) =>
    candidate.id === owner.id ||
    (candidate.readerAddress?.path === path && descendsFromOwner(candidate))
  );
}

function pageForRoute(
  route: PublicationReaderEnvelope["routes"]["active"][number],
): PublisherNextPage | null {
  const { target } = route;
  if (target.kind !== "work" && target.kind !== "section") {
    return null;
  }
  const work = reader.works.find(({ id }) => id === target.workId);
  if (work === undefined) return null;
  if (target.kind === "work") {
    return {
      assets: [],
      kind: "work",
      links: [],
      path: route.path,
      publication: reader.publication,
      work,
    };
  }
  const section = work.sections.find(({ id }) =>
    id === target.sectionId
  );
  if (section === undefined) return null;
  return {
    assets: [],
    kind: "section",
    links: [],
    next: null,
    path: route.path,
    previous: null,
    publication: reader.publication,
    section,
    sections: routeSections(work, section, route.path),
    work,
  };
}

function pageForAuthoritySections(
  sections: readonly CoherencePublisherAudioWordAuthority["sections"][number][],
): Extract<PublisherNextPage, { readonly kind: "section" }> {
  const first = sections[0];
  if (first === undefined) throw new TypeError("Test sections are empty.");
  const work = reader.works.find(({ id }) => id === first.workId);
  if (work === undefined) throw new TypeError("Test work is missing.");
  const selected = sections.map((bound) => {
    const section = work.sections.find(({ id }) => id === bound.sectionId);
    if (section === undefined) throw new TypeError("Test section is missing.");
    return section;
  });
  return {
    assets: [],
    kind: "section",
    links: [],
    next: null,
    path: selected[0]!.readerAddress?.path ?? "/",
    previous: null,
    publication: reader.publication,
    section: selected[0]!,
    sections: selected,
    work,
  };
}

function pageForWorkSections(
  work: ReaderWork,
  sections: readonly ReaderSection[],
): Extract<PublisherNextPage, { readonly kind: "work" }> {
  return {
    assets: [],
    kind: "work",
    links: [],
    path: work.route,
    publication: reader.publication,
    work: { ...work, sections },
  };
}

function projectAuthoritySection(
  section: CoherencePublisherAudioWordAuthority["sections"][number],
): CoherencePublisherAudioWordRouteSection {
  return {
    bodyStartCharacter: section.bodyStartCharacter,
    bodyWordCount: section.bodyWordCount,
    profileText: section.profileText,
    queueIdentity: {
      audioVersionId: section.audioVersionId,
      contentHash: section.legacyContentHash,
    },
    sectionId: section.sectionId,
    titleWordCount: section.titleWordCount,
  };
}

describe("Coherence Publisher narration word authority", () => {
  it("rederives the exact reviewed text mapping record", () => {
    expect(authority).toMatchObject({
      bindingRecordSha256:
        COHERENCE_PUBLISHER_NARRATION_WORD_BINDING_RECORD_V1_SHA256,
      buildId:
        COHERENCE_PUBLISHER_NARRATION_WORD_TEXT_MAPPING_AUTHORITY_V1_BUILD_ID,
      kind: "coherence-publisher-narration-word-text-mapping-authority",
      safeSectionIdsSha256:
        "sha256:4aa80d0705d8bc974c6d78347a15c1796a2d527e752eb97aeee35ec29eeb40be",
      statistics: {
        bodyWordCount: 30_975,
        narrationWordCount: 31_468,
        sectionCount: 122,
        titleWordCount: 493,
      },
    });
    expect(authority.sections).toHaveLength(122);
    expect(Object.isFrozen(authority)).toBe(true);
    expect(Object.isFrozen(authority.sections)).toBe(true);
    expect(authority.sections.every(Object.isFrozen)).toBe(true);
    const progressIdentityBySectionId = new Map(
      progressSections.map((section) => [section.sectionId, section]),
    );
    expect(progressIdentityBySectionId.size).toBe(progressSections.length);
    expect(
      authority.sections.filter((section) => {
        const progressIdentity = progressIdentityBySectionId.get(
          section.sectionId,
        );
        return progressIdentity?.contentHash === section.legacyContentHash &&
          progressIdentity.audioVersionId === section.audioVersionId;
      }),
    ).toHaveLength(122);

    const serialized = serializeCoherencePublisherAudioWordAuthority(
      authority,
    );
    expect(serialized.endsWith("\n")).toBe(true);
    expect(JSON.parse(serialized)).toEqual(authority);
    expect(Buffer.byteLength(serialized, "utf8")).toBe(239_713);
  });

  it("rejects an exact text slice that is not a whole legacy word", () => {
    type MutableMigration = {
      sections: Array<{
        paragraphs: Array<{
          blockId: string;
          offsetSegments: Array<{
            legacyStart: number;
            length: number;
            targetStart: number;
          }>;
        }>;
        sectionId: string;
      }>;
    };
    const changed = JSON.parse(
      JSON.stringify(migrationArtifact),
    ) as MutableMigration;
    const section = changed.sections.find(({ sectionId }) =>
      sectionId === "v03-what-institutions-held-and-what-they-cost"
    );
    const paragraph = section?.paragraphs.find(({ blockId }) =>
      blockId ===
        "markdown-block-b10e54348bed6bc439812934ca7898c43dba60c622c90a20a39b452dede1c8e7"
    );
    if (paragraph === undefined) throw new TypeError("Test paragraph missing.");
    // "An" is an exact slice at the start of "And", but not a whole word.
    paragraph.offsetSegments = [{ legacyStart: 116, length: 2, targetStart: 0 }];

    expect(() =>
      createCoherencePublisherAudioWordAuthority({
        audioManifest,
        legacyCatalog,
        migrationArtifact:
          changed as unknown as CoherenceReaderStateMigrationArtifact,
        reader,
      })
    ).toThrow("body word 0 misses a whole-word boundary");
  });

  it("preserves the exact bounded section route census", () => {
    let admittedRoutes = 0;
    let sectionInstances = 0;
    let multiSectionRoutes = 0;
    let maximumRouteSections = 0;
    let maximumRouteWords = 0;
    let maximumRouteBytes = 0;
    let maximumCanonicalRouteBytes = 0;
    const sizeDistribution = new Map<number, number>();
    const projectedSafeSectionIds = new Set<string>();
    const sectionRoutes = reader.routes.active.filter((route) =>
      route.target.kind === "section"
    );
    expect(sectionRoutes).toHaveLength(573);

    for (const route of sectionRoutes) {
      const page = pageForRoute(route);
      if (page === null || page.kind !== "section") {
        throw new TypeError(`Section route ${route.path} is missing.`);
      }
      const model = createCoherencePublisherAudioWordRouteModel(
        page,
        authority,
      );
      if (model.sections.length === 0) continue;
      admittedRoutes += 1;
      sectionInstances += model.sections.length;
      if (model.sections.length > 1) multiSectionRoutes += 1;
      sizeDistribution.set(
        model.sections.length,
        (sizeDistribution.get(model.sections.length) ?? 0) + 1,
      );
      const routeWords = model.sections.reduce(
        (total, section) => total + section.bodyWordCount,
        0,
      );
      maximumRouteSections = Math.max(
        maximumRouteSections,
        model.sections.length,
      );
      maximumRouteWords = Math.max(maximumRouteWords, routeWords);
      const routeBytes = Buffer.byteLength(JSON.stringify(model), "utf8");
      maximumRouteBytes = Math.max(maximumRouteBytes, routeBytes);
      if (
        route.target.kind === "section" &&
        route.target.routeName === "canonical"
      ) {
        maximumCanonicalRouteBytes = Math.max(
          maximumCanonicalRouteBytes,
          routeBytes,
        );
      }
      for (const section of model.sections) {
        projectedSafeSectionIds.add(section.sectionId);
      }
      expect(model.sections.length).toBeLessThanOrEqual(
        coherencePublisherAudioWordRouteLimits.maximumSections,
      );
      expect(routeWords).toBeLessThanOrEqual(
        coherencePublisherAudioWordRouteLimits.maximumWords,
      );
      expect(routeBytes).toBeLessThanOrEqual(
        coherencePublisherAudioWordRouteLimits.maximumBytes,
      );
    }

    expect({
      admittedRoutes,
      maximumCanonicalRouteBytes,
      maximumRouteBytes,
      maximumRouteSections,
      maximumRouteWords,
      multiSectionRoutes,
      sectionInstances,
      sizeDistribution: Object.fromEntries(sizeDistribution),
    }).toEqual({
      admittedRoutes: 142,
      maximumCanonicalRouteBytes: 4_589,
      maximumRouteBytes: 6_806,
      maximumRouteSections: 3,
      maximumRouteWords: 1_072,
      multiSectionRoutes: 5,
      sectionInstances: 150,
      sizeDistribution: {
        1: 137,
        2: 2,
        3: 3,
      },
    });
    expect(projectedSafeSectionIds.size).toBe(122);
  });

  it("admits only the two legitimate complete work pages in the exact census", () => {
    type WorkRouteCensus = Readonly<{
      path: string;
      totalSections: number;
      safeSectionIds: readonly string[];
      safeBodyWords: number;
      modelBytes: number;
      outcome: "admitted" | "refused";
    }>;

    const safeBySectionId = new Map(
      authority.sections.map((section) => [section.sectionId, section]),
    );
    const workRoutes = reader.routes.active.filter((route) =>
      route.target.kind === "work"
    );
    expect(workRoutes).toHaveLength(9);
    const workRouteById = new Map(
      workRoutes.map((route) => {
        if (route.target.kind !== "work") {
          throw new TypeError(`Route ${route.path} is not a work route.`);
        }
        return [route.target.workId, route] as const;
      }),
    );
    expect(workRouteById.size).toBe(9);

    const census: WorkRouteCensus[] = [];
    const admitted: Array<Readonly<{
      path: string;
      sectionIds: readonly string[];
    }>> = [];
    for (const work of reader.works) {
      const route = workRouteById.get(work.id);
      if (route === undefined) {
        throw new TypeError(`Work route ${work.id} is missing.`);
      }
      const page = pageForRoute(route);
      if (page === null || page.kind !== "work") {
        throw new TypeError(`Work page ${route.path} is missing.`);
      }
      const safeSections = page.work.sections.flatMap((section) => {
        const safe = safeBySectionId.get(section.id);
        return safe === undefined ? [] : [safe];
      });
      const compactSections = safeSections.map(projectAuthoritySection);
      const safeBodyWords = compactSections.reduce(
        (total, section) => total + section.bodyWordCount,
        0,
      );
      const modelBytes = Buffer.byteLength(
        JSON.stringify({
          authorityBuildId: authority.buildId,
          schemaVersion: 1,
          sections: compactSections,
        }),
        "utf8",
      );
      const model = createCoherencePublisherAudioWordRouteModel(
        page,
        authority,
      );
      const outcome = model.sections.length === 0 ? "refused" : "admitted";
      census.push(Object.freeze({
        path: route.path,
        totalSections: page.work.sections.length,
        safeSectionIds: Object.freeze(
          safeSections.map((section) => section.sectionId),
        ),
        safeBodyWords,
        modelBytes,
        outcome,
      }));

      if (outcome === "refused") {
        expect(model, route.path).toBe(
          emptyCoherencePublisherAudioWordRouteModel,
        );
        continue;
      }
      expect(model.sections, route.path).toEqual(compactSections);
      expect(model.sections.length, route.path).toBeLessThanOrEqual(
        coherencePublisherAudioWordRouteLimits.maximumSections,
      );
      expect(safeBodyWords, route.path).toBeLessThanOrEqual(
        coherencePublisherAudioWordRouteLimits.maximumWords,
      );
      expect(modelBytes, route.path).toBeLessThanOrEqual(
        coherencePublisherAudioWordRouteLimits.maximumBytes,
      );
      admitted.push(Object.freeze({
        path: route.path,
        sectionIds: Object.freeze(
          model.sections.map((section) => section.sectionId),
        ),
      }));
    }

    expect(census.map((entry) => ({
      path: entry.path,
      totalSections: entry.totalSections,
      safeSections: entry.safeSectionIds.length,
      safeBodyWords: entry.safeBodyWords,
      modelBytes: entry.modelBytes,
      outcome: entry.outcome,
    }))).toEqual([
      {
        path: "/manuscripts/1/",
        totalSections: 37,
        safeSections: 9,
        safeBodyWords: 1_963,
        modelBytes: 14_811,
        outcome: "refused",
      },
      {
        path: "/manuscripts/2/",
        totalSections: 81,
        safeSections: 20,
        safeBodyWords: 4_805,
        modelBytes: 36_604,
        outcome: "refused",
      },
      {
        path: "/manuscripts/3/",
        totalSections: 121,
        safeSections: 16,
        safeBodyWords: 4_002,
        modelBytes: 29_058,
        outcome: "refused",
      },
      {
        path: "/manuscripts/4/",
        totalSections: 151,
        safeSections: 32,
        safeBodyWords: 9_328,
        modelBytes: 70_588,
        outcome: "refused",
      },
      {
        path: "/manuscripts/5/",
        totalSections: 24,
        safeSections: 1,
        safeBodyWords: 430,
        modelBytes: 2_745,
        outcome: "admitted",
      },
      {
        path: "/manuscripts/6/",
        totalSections: 24,
        safeSections: 16,
        safeBodyWords: 4_272,
        modelBytes: 28_155,
        outcome: "refused",
      },
      {
        path: "/manuscripts/7/",
        totalSections: 46,
        safeSections: 22,
        safeBodyWords: 4_432,
        modelBytes: 32_164,
        outcome: "refused",
      },
      {
        path: "/manuscripts/8/",
        totalSections: 31,
        safeSections: 5,
        safeBodyWords: 1_711,
        modelBytes: 11_081,
        outcome: "refused",
      },
      {
        path: "/manuscripts/9/",
        totalSections: 10,
        safeSections: 1,
        safeBodyWords: 32,
        modelBytes: 640,
        outcome: "admitted",
      },
    ]);
    expect(admitted).toEqual([
      {
        path: "/manuscripts/5/",
        sectionIds: ["v05-for-the-ones-not-yet-born"],
      },
      {
        path: "/manuscripts/9/",
        sectionIds: ["v09-what-the-design-holds-and-what-remains-open"],
      },
    ]);
    expect(census.filter(({ outcome }) => outcome === "refused")).toHaveLength(
      7,
    );
    expect(
      `sha256:${createHash("sha256")
        .update(JSON.stringify(census))
        .digest("hex")}`,
    ).toBe(
      "sha256:38516693131c2dda032d62a3b3d62f62be8b260f055c36c52436ce841c478afa",
    );
  });

  it("refuses a truncated large work even when its subset fits every cap", () => {
    const work = reader.works.find(({ id }) =>
      id === "humanitys-most-viable-future"
    );
    if (work === undefined) throw new TypeError("Volume I work is missing.");
    const sectionById = new Map(
      work.sections.map((section) => [section.id, section]),
    );
    const completeSafeSections = authority.sections.filter((section) =>
      section.workId === work.id
    );
    expect(completeSafeSections).toHaveLength(9);
    const truncatedSafeSections = completeSafeSections.slice(0, 2);
    const truncatedReaderSections = truncatedSafeSections.map((safe) => {
      const sectionId = safe.sectionId;
      const section = sectionById.get(sectionId);
      if (section === undefined) {
        throw new TypeError(`Truncated section ${sectionId} is missing.`);
      }
      return section;
    });
    const compactSections = truncatedSafeSections.map(projectAuthoritySection);
    expect(compactSections).toHaveLength(2);
    expect(
      compactSections.reduce(
        (total, section) => total + section.bodyWordCount,
        0,
      ),
    ).toBeLessThanOrEqual(coherencePublisherAudioWordRouteLimits.maximumWords);
    expect(
      Buffer.byteLength(
        JSON.stringify({
          authorityBuildId: authority.buildId,
          schemaVersion: 1,
          sections: compactSections,
        }),
        "utf8",
      ),
    ).toBeLessThanOrEqual(
      coherencePublisherAudioWordRouteLimits.maximumBytes,
    );
    expect(
      createCoherencePublisherAudioWordRouteModel(
        pageForWorkSections(work, truncatedReaderSections),
        authority,
      ),
    ).toBe(emptyCoherencePublisherAudioWordRouteModel);
  });

  it("refuses a large work whose complete safe section order drifts", () => {
    const work = reader.works.find(({ id }) =>
      id === "humanitys-most-viable-future"
    );
    if (work === undefined) throw new TypeError("Volume I work is missing.");
    const completeSafeSectionIds = authority.sections.flatMap((section) =>
      section.workId === work.id ? [section.sectionId] : []
    );
    expect(completeSafeSectionIds).toHaveLength(9);
    const reorderedSections = [...work.sections];
    const firstIndex = reorderedSections.findIndex(({ id }) =>
      id === completeSafeSectionIds[0]
    );
    const secondIndex = reorderedSections.findIndex(({ id }) =>
      id === completeSafeSectionIds[1]
    );
    if (firstIndex < 0 || secondIndex < 0) {
      throw new TypeError("Volume I safe reorder fixtures are missing.");
    }
    const first = reorderedSections[firstIndex]!;
    reorderedSections[firstIndex] = reorderedSections[secondIndex]!;
    reorderedSections[secondIndex] = first;
    const safeSectionIdsAfterReorder = reorderedSections.flatMap((section) =>
      completeSafeSectionIds.includes(section.id) ? [section.id] : []
    );
    expect([...safeSectionIdsAfterReorder].sort()).toEqual(
      [...completeSafeSectionIds].sort(),
    );
    expect(safeSectionIdsAfterReorder).not.toEqual(completeSafeSectionIds);
    expect(
      createCoherencePublisherAudioWordRouteModel(
        pageForWorkSections(work, reorderedSections),
        authority,
      ),
    ).toBe(emptyCoherencePublisherAudioWordRouteModel);
  });

  it("fails work route, identity, content, and profile drift closed", () => {
    const route = reader.routes.active.find((candidate) =>
      candidate.target.kind === "work" &&
      candidate.target.workId === "purposeful"
    );
    if (route === undefined) {
      throw new TypeError("Purposeful work route is missing.");
    }
    const page = pageForRoute(route);
    if (page === null || page.kind !== "work") {
      throw new TypeError("Purposeful work page is missing.");
    }
    const safeSectionId = "v05-for-the-ones-not-yet-born";
    const safeSection = page.work.sections.find(({ id }) =>
      id === safeSectionId
    );
    if (safeSection === undefined) {
      throw new TypeError("Purposeful safe section is missing.");
    }
    const foreignSafeSection = reader.works
      .flatMap((work) => work.sections)
      .find(({ id }) =>
        id === "v09-what-the-design-holds-and-what-remains-open"
      );
    if (foreignSafeSection === undefined) {
      throw new TypeError("Foreign safe section is missing.");
    }
    expect(
      createCoherencePublisherAudioWordRouteModel(page, authority).sections.map(
        ({ sectionId }) => sectionId,
      ),
    ).toEqual([safeSectionId]);

    const wrongPublication = {
      ...page,
      publication: {
        ...page.publication,
        id: "other-publication",
      },
    } as Extract<PublisherNextPage, { readonly kind: "work" }>;
    const wrongPath = {
      ...page,
      path: "/manuscripts/5/wrong/",
    } as Extract<PublisherNextPage, { readonly kind: "work" }>;
    const empty = {
      ...page,
      work: {
        ...page.work,
        sections: [],
      },
    } as Extract<PublisherNextPage, { readonly kind: "work" }>;
    const duplicate = {
      ...page,
      work: {
        ...page.work,
        sections: [...page.work.sections, safeSection],
      },
    } as Extract<PublisherNextPage, { readonly kind: "work" }>;
    const extraSafe = {
      ...page,
      work: {
        ...page.work,
        sections: [...page.work.sections, foreignSafeSection],
      },
    } as Extract<PublisherNextPage, { readonly kind: "work" }>;
    const contentDrift = {
      ...page,
      work: {
        ...page.work,
        sections: page.work.sections.map((section) =>
          section.id === safeSectionId
            ? {
                ...section,
                contentHash:
                  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              }
            : section
        ),
      },
    } as Extract<PublisherNextPage, { readonly kind: "work" }>;
    const profileDrift = {
      ...page,
      work: {
        ...page.work,
        sections: page.work.sections.map((section) =>
          section.id === safeSectionId
            ? { ...section, title: `${section.title} drift` }
            : section
        ),
      },
    } as Extract<PublisherNextPage, { readonly kind: "work" }>;

    for (const candidate of [
      wrongPublication,
      wrongPath,
      empty,
      duplicate,
      extraSafe,
      contentDrift,
      profileDrift,
    ]) {
      expect(
        createCoherencePublisherAudioWordRouteModel(candidate, authority),
      ).toBe(emptyCoherencePublisherAudioWordRouteModel);
    }
  });

  it("fails closed outside supported route scope and beyond route caps", () => {
    const homePage: PublisherNextPage = {
      collections: reader.collections,
      kind: "home",
      path: "/",
      publication: reader.publication,
      works: reader.works,
    };
    expect(
      createCoherencePublisherAudioWordRouteModel(homePage, authority),
    ).toBe(emptyCoherencePublisherAudioWordRouteModel);

    const byWork = new Map<
      string,
      CoherencePublisherAudioWordAuthority["sections"][number][]
    >();
    for (const section of authority.sections) {
      const group = byWork.get(section.workId) ?? [];
      group.push(section);
      byWork.set(section.workId, group);
    }
    const fiveSections = [...byWork.values()].find((group) =>
      group.length >= 5
    )?.slice(0, 5);
    if (fiveSections === undefined) {
      throw new TypeError("Five-section cap fixture is missing.");
    }
    expect(
      createCoherencePublisherAudioWordRouteModel(
        pageForAuthoritySections(fiveSections),
        authority,
      ),
    ).toBe(emptyCoherencePublisherAudioWordRouteModel);

    const excessiveWordSections = [...byWork.values()]
      .map((group) =>
        [...group]
          .sort((left, right) => right.bodyWordCount - left.bodyWordCount)
          .slice(0, 4)
      )
      .find((group) =>
        group.reduce(
          (total, section) => total + section.bodyWordCount,
          0,
        ) > coherencePublisherAudioWordRouteLimits.maximumWords
      );
    if (excessiveWordSections === undefined) {
      throw new TypeError("Word cap fixture is missing.");
    }
    expect(excessiveWordSections.length).toBeLessThanOrEqual(4);
    expect(
      createCoherencePublisherAudioWordRouteModel(
        pageForAuthoritySections(excessiveWordSections),
        authority,
      ),
    ).toBe(emptyCoherencePublisherAudioWordRouteModel);
  });
});
