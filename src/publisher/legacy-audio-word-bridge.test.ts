import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";

import type { PublisherNextPage } from "@genii-foundation/publisher-next/server";
import { createReaderNarrationSectionTextProfile } from "@genii-foundation/publisher-reader/narration";
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

  it("projects bounded section routes and keeps full work pages inert", () => {
    let maximumRouteSections = 0;
    let maximumRouteWords = 0;
    let maximumRouteBytes = 0;
    let maximumCanonicalRouteBytes = 0;
    let largestWorkMetrics: Readonly<{
      narrationSpans: number;
      safeBodyWords: number;
      safeSections: number;
      sections: number;
      unboundedCompactBytes: number;
    }> = Object.freeze({
      narrationSpans: 0,
      safeBodyWords: 0,
      safeSections: 0,
      sections: 0,
      unboundedCompactBytes: 0,
    });
    const projectedSafeSectionIds = new Set<string>();
    const safeBySectionId = new Map(
      authority.sections.map((section) => [section.sectionId, section]),
    );

    for (const route of reader.routes.active) {
      const page = pageForRoute(route);
      if (page === null) continue;
      const model = createCoherencePublisherAudioWordRouteModel(
        page,
        authority,
      );
      if (page.kind === "work") {
        // Work pages contain the full manuscript and narration anchors. They
        // stay inert until a singleton and performance design is reviewed.
        expect(model).toBe(emptyCoherencePublisherAudioWordRouteModel);
        const safeSections = page.work.sections.flatMap((section) => {
          const safe = safeBySectionId.get(section.id);
          return safe === undefined ? [] : [safe];
        });
        if (page.work.sections.length > largestWorkMetrics.sections) {
          largestWorkMetrics = Object.freeze({
            narrationSpans: page.work.sections.reduce(
              (total, section) =>
                total +
                createReaderNarrationSectionTextProfile(section).bodyWordCount,
              0,
            ),
            safeBodyWords: safeSections.reduce(
            (total, section) => total + section.bodyWordCount,
            0,
            ),
            safeSections: safeSections.length,
            sections: page.work.sections.length,
            unboundedCompactBytes: Buffer.byteLength(
              JSON.stringify({
                authorityBuildId: authority.buildId,
                schemaVersion: 1,
                sections: safeSections.map((section) => ({
                  bodyStartCharacter: section.bodyStartCharacter,
                  bodyWordCount: section.bodyWordCount,
                  profileText: section.profileText,
                  queueIdentity: {
                    audioVersionId: section.audioVersionId,
                    contentHash: section.legacyContentHash,
                  },
                  sectionId: section.sectionId,
                  titleWordCount: section.titleWordCount,
                })),
              }),
              "utf8",
            ),
          });
        }
        continue;
      }
      if (page.kind !== "section" || model.sections.length === 0) continue;
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
      maximumCanonicalRouteBytes,
      maximumRouteBytes,
      maximumRouteSections,
      maximumRouteWords,
    }).toEqual({
      maximumCanonicalRouteBytes: 4_589,
      maximumRouteBytes: 6_806,
      maximumRouteSections: 3,
      maximumRouteWords: 1_072,
    });
    expect(projectedSafeSectionIds.size).toBe(122);
    expect(largestWorkMetrics).toEqual({
      narrationSpans: 46_167,
      safeBodyWords: 9_328,
      safeSections: 32,
      sections: 151,
      unboundedCompactBytes: 70_588,
    });
    expect(largestWorkMetrics.unboundedCompactBytes).toBeGreaterThan(
      coherencePublisherAudioWordRouteLimits.maximumBytes,
    );
  });

  it("fails closed outside section scope and beyond route caps", () => {
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
