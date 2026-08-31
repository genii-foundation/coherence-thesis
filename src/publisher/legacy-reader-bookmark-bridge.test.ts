import fs from "node:fs";
import path from "node:path";
import type { PublisherNextPage } from "@genii-foundation/publisher-next/server";
import type {
  PublicationReaderEnvelope,
  ReaderSection,
  ReaderWork,
} from "@genii-foundation/publisher-schema/reader";
import { describe, expect, it } from "vitest";

import type { Section as LegacySection } from "@/lib/manuscript-data";
import {
  createCoherencePublisherBookmarkRouteModel,
  MAXIMUM_COHERENCE_PUBLISHER_BOOKMARK_MODEL_BYTES,
  MAXIMUM_COHERENCE_PUBLISHER_BOOKMARK_ROUTE_SECTIONS,
} from "@/publisher/legacy-reader-bookmark-bridge";
import {
  parseCoherenceReaderStateMigrationArtifact,
  type CoherenceReaderStateMigrationArtifact,
  type CoherenceReaderStateMigrationSection,
} from "@/publisher/reader-state-migration-schema";

const publisherHash = (character: string) =>
  `sha256:${character.repeat(64)}`;

function publisherSection(
  id: string,
  text = "Alpha beta gamma",
): ReaderSection {
  return Object.freeze({
    activeRouteNames: Object.freeze(["canonical"]),
    blocks: Object.freeze([
      Object.freeze({
        contentHash: publisherHash("b"),
        domId: `${id}-block-dom`,
        id: `${id}-block`,
        kind: "paragraph",
        markdown: text,
        readerAddress: Object.freeze({
          anchor: `${id}-block-dom`,
          path: `/manuscripts/1/${id}/`,
        }),
        text,
        wordCount: 3,
      }),
    ]),
    childIds: Object.freeze([]),
    contentHash: publisherHash("a"),
    continuity: Object.freeze({
      historicalSectionIds: Object.freeze([`${id}-old-section`]),
      id: `${id}-continuity`,
      legacyIds: Object.freeze([`${id}-old-continuity`]),
      progressGroups: Object.freeze([
        Object.freeze([`${id}-continuity`, `${id}-old-continuity`]),
      ]),
    }),
    depth: 0,
    domId: id,
    id,
    navigable: true,
    nextId: null,
    order: 1,
    parentId: null,
    previousId: null,
    readerAddress: Object.freeze({ path: `/manuscripts/1/${id}/` }),
    readingMinutes: 1,
    role: "section",
    routes: Object.freeze({
      canonical: Object.freeze({ path: `/manuscripts/1/${id}/` }),
    }),
    title: id,
    wordCount: 3,
  }) as unknown as ReaderSection;
}

function legacySection(
  section: ReaderSection,
  text = section.blocks[0]!.text,
): LegacySection {
  return {
    sectionId: section.id,
    continuityId: section.continuity.id,
    legacyContinuityIds: [...section.continuity.legacyIds],
    progressContinuityGroups: section.continuity.progressGroups.map((group) => [
      ...group,
    ]),
    legacySectionIds: [...section.continuity.historicalSectionIds],
    contentHash: "0123456789abcdef",
    title: section.title,
    href: "/manuscripts/1/",
    chapterHref: "/manuscripts/1/chapter/",
    readerHref: section.readerAddress!.path,
    wordCount: 3,
    paragraphs: [
      {
        paragraphId: "p-hfedcba9876543210",
        anchor: "p-hfedcba9876543210",
        contentHash: "fedcba9876543210",
        order: 1,
        text,
      },
    ],
  } as LegacySection;
}

function migrationSection(
  section: ReaderSection,
  text = section.blocks[0]!.text,
): CoherenceReaderStateMigrationSection {
  return Object.freeze({
    workId: "work",
    sectionId: section.id,
    sectionContinuityId: section.continuity.id,
    acceptedLegacySectionIds: Object.freeze([
      section.id,
      ...section.continuity.historicalSectionIds,
    ].sort()),
    acceptedLegacyContinuityIds: Object.freeze([
      ...new Set([
        section.continuity.id,
        ...section.continuity.legacyIds,
        ...section.continuity.progressGroups.flat(),
      ]),
    ].sort()),
    href: section.readerAddress!.path,
    legacyContentHash: "0123456789abcdef",
    contentHash: section.contentHash,
    paragraphs: Object.freeze([
      Object.freeze({
        legacyParagraphId: "p-hfedcba9876543210",
        legacyContentHash: "fedcba9876543210",
        legacyTextCodeUnits: text.length,
        blockId: section.blocks[0]!.id,
        blockContentHash: section.blocks[0]!.contentHash,
        blockTextCodeUnits: section.blocks[0]!.text.length,
        offsetSegments: Object.freeze([
          Object.freeze({
            legacyStart: 0,
            targetStart: 0,
            length: text.length,
          }),
        ]),
      }),
    ]),
  });
}

function identicalTwoParagraphSection(): ReaderSection {
  const section = publisherSection("two", "Same exact paragraph");
  const first = section.blocks[0]!;
  return Object.freeze({
    ...section,
    blocks: Object.freeze([
      first,
      Object.freeze({
        ...first,
        domId: "two-block-2-dom",
        id: "two-block-2",
        readerAddress: Object.freeze({
          anchor: "two-block-2-dom",
          path: "/manuscripts/1/two/",
        }),
      }),
    ]),
    wordCount: 6,
  }) as unknown as ReaderSection;
}

function identicalTwoParagraphLegacy(
  section: ReaderSection,
): LegacySection {
  const base = legacySection(section, "Same exact paragraph");
  return {
    ...base,
    wordCount: 6,
    paragraphs: [
      {
        paragraphId: "p-haaaaaaaaaaaaaaaa",
        anchor: "p-haaaaaaaaaaaaaaaa",
        contentHash: "aaaaaaaaaaaaaaaa",
        order: 1,
        text: "Same exact paragraph",
      },
      {
        paragraphId: "p-hbbbbbbbbbbbbbbbb",
        anchor: "p-hbbbbbbbbbbbbbbbb",
        contentHash: "bbbbbbbbbbbbbbbb",
        order: 2,
        text: "Same exact paragraph",
      },
    ],
  } as LegacySection;
}

function identicalTwoParagraphMigration(
  section: ReaderSection,
): CoherenceReaderStateMigrationSection {
  const base = migrationSection(section, "Same exact paragraph");
  return Object.freeze({
    ...base,
    paragraphs: Object.freeze([
      Object.freeze({
        ...base.paragraphs[0]!,
        legacyParagraphId: "p-haaaaaaaaaaaaaaaa",
        legacyContentHash: "aaaaaaaaaaaaaaaa",
        blockId: section.blocks[0]!.id,
        blockContentHash: section.blocks[0]!.contentHash,
      }),
      Object.freeze({
        ...base.paragraphs[0]!,
        legacyParagraphId: "p-hbbbbbbbbbbbbbbbb",
        legacyContentHash: "bbbbbbbbbbbbbbbb",
        blockId: section.blocks[1]!.id,
        blockContentHash: section.blocks[1]!.contentHash,
      }),
    ]),
  });
}

function artifact(
  sections: readonly CoherenceReaderStateMigrationSection[],
): CoherenceReaderStateMigrationArtifact {
  return Object.freeze({
    schemaVersion: "1.0",
    publicationId: "publication",
    readerBuildId: publisherHash("c"),
    href: "/publisher/coherence-reader-state-migration.json",
    legacyProgressStorageKeys: Object.freeze([
      "coherence-reader-progress-v2",
      "coherence-reader-progress-v1",
    ] as const),
    legacyBookmarksStorageKeys: Object.freeze([
      "coherence-reader-bookmarks-v2",
      "coherence-reader-bookmarks-v1",
    ] as const),
    sections: Object.freeze([...sections]),
    buildId: publisherHash("d"),
  });
}

function page(
  sections: readonly ReaderSection[],
  pathOverride?: string,
): Extract<PublisherNextPage, { readonly kind: "section" }> {
  const owner = sections[0];
  if (owner === undefined) throw new TypeError("A test page needs an owner.");
  const work = Object.freeze({
    id: "work",
    sections: Object.freeze([...sections]),
  }) as unknown as ReaderWork;
  return Object.freeze({
    kind: "section",
    path: pathOverride ?? owner.readerAddress!.path,
    publication: Object.freeze({ id: "publication" }),
    work,
    section: owner,
    sections: Object.freeze([...sections]),
  }) as unknown as Extract<PublisherNextPage, { readonly kind: "section" }>;
}

type DeepMutable<T> = T extends readonly (infer Item)[]
  ? DeepMutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
    : T;

function mutable<T>(value: T): DeepMutable<T> {
  return structuredClone(value) as DeepMutable<T>;
}

describe("Coherence Publisher bookmark route authority", () => {
  it("projects one exact reversible paragraph and retains the Reader section", () => {
    const section = publisherSection("section");
    const model = createCoherencePublisherBookmarkRouteModel(
      page([section], "/legacy/section/"),
      artifact([migrationSection(section)]),
      [legacySection(section)],
    );

    expect(model.sections).toHaveLength(1);
    expect(model.sections[0]).toMatchObject({
      fallbackPath: "/legacy/section/",
      workId: "work",
      legacySection: {
        sectionId: "section",
        continuityId: "section-continuity",
        contentHash: "0123456789abcdef",
        paragraphs: [
          {
            paragraphId: "p-hfedcba9876543210",
            anchor: "p-hfedcba9876543210",
            contentHash: "fedcba9876543210",
          },
        ],
      },
      paragraphs: [
        {
          legacyParagraphId: "p-hfedcba9876543210",
          legacyContentHash: "fedcba9876543210",
          blockId: "section-block",
          blockContentHash: publisherHash("b"),
          offsetSegment: {
            legacyStart: 0,
            targetStart: 0,
            length: 16,
          },
        },
      ],
    });
    expect(model.sections[0]?.publisherSection).toBe(section);
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.sections)).toBe(true);
    expect(Object.isFrozen(model.sections[0]?.paragraphs)).toBe(true);
  });

  it("accepts identical paragraphs only when their mapped blocks stay in order", () => {
    const section = identicalTwoParagraphSection();
    const migration = identicalTwoParagraphMigration(section);
    const legacy = identicalTwoParagraphLegacy(section);

    const model = createCoherencePublisherBookmarkRouteModel(
      page([section]),
      artifact([migration]),
      [legacy],
    );
    expect(model.sections[0]?.paragraphs.map(({ blockId }) => blockId)).toEqual([
      "two-block",
      "two-block-2",
    ]);

    const swapped = mutable(migration);
    swapped.paragraphs[0]!.blockId = "two-block-2";
    swapped.paragraphs[1]!.blockId = "two-block";
    expect(
      createCoherencePublisherBookmarkRouteModel(
        page([section]),
        artifact([swapped]),
        [legacy],
      ),
    ).toEqual({ sections: [] });
  });

  it.each([
    ["split segment", (value: DeepMutable<CoherenceReaderStateMigrationSection>) => {
      value.paragraphs[0]!.offsetSegments = [
        { legacyStart: 0, targetStart: 0, length: 5 },
        { legacyStart: 5, targetStart: 5, length: 11 },
      ];
    }],
    ["shifted target", (value: DeepMutable<CoherenceReaderStateMigrationSection>) => {
      value.paragraphs[0]!.offsetSegments[0]!.targetStart = 1;
    }],
    ["partial segment", (value: DeepMutable<CoherenceReaderStateMigrationSection>) => {
      value.paragraphs[0]!.offsetSegments[0]!.length -= 1;
    }],
    ["legacy length", (value: DeepMutable<CoherenceReaderStateMigrationSection>) => {
      value.paragraphs[0]!.legacyTextCodeUnits -= 1;
    }],
    ["block length", (value: DeepMutable<CoherenceReaderStateMigrationSection>) => {
      value.paragraphs[0]!.blockTextCodeUnits -= 1;
    }],
    ["block hash", (value: DeepMutable<CoherenceReaderStateMigrationSection>) => {
      value.paragraphs[0]!.blockContentHash = publisherHash("e");
    }],
    ["legacy hash", (value: DeepMutable<CoherenceReaderStateMigrationSection>) => {
      value.paragraphs[0]!.legacyContentHash = "aaaaaaaaaaaaaaaa";
    }],
  ])("refuses a %s", (_label, change) => {
    const section = publisherSection("section");
    const changed = mutable(migrationSection(section));
    change(changed);
    expect(
      createCoherencePublisherBookmarkRouteModel(
        page([section]),
        artifact([changed]),
        [legacySection(section)],
      ),
    ).toEqual({ sections: [] });
  });

  it("refuses text drift and every duplicate ownership form", () => {
    const section = publisherSection("section");
    const migration = migrationSection(section);
    const legacy = legacySection(section);

    expect(
      createCoherencePublisherBookmarkRouteModel(
        page([section]),
        artifact([migration]),
        [legacySection(section, "Alpha beta delta")],
      ),
    ).toEqual({ sections: [] });
    expect(
      createCoherencePublisherBookmarkRouteModel(
        page([section, section]),
        artifact([migration]),
        [legacy],
      ),
    ).toEqual({ sections: [] });
    expect(
      createCoherencePublisherBookmarkRouteModel(
        page([section]),
        artifact([migration, migration]),
        [legacy],
      ),
    ).toEqual({ sections: [] });
    expect(
      createCoherencePublisherBookmarkRouteModel(
        page([section]),
        artifact([migration]),
        [legacy, legacy],
      ),
    ).toEqual({ sections: [] });
  });

  it("keeps nonsection, oversized, and detached Reader pages inert", () => {
    const section = publisherSection("section");
    const migration = migrationSection(section);
    const legacy = legacySection(section);
    const workPage = Object.freeze({
      kind: "work",
      publication: Object.freeze({ id: "publication" }),
    }) as unknown as PublisherNextPage;
    expect(
      createCoherencePublisherBookmarkRouteModel(
        workPage,
        artifact([migration]),
        [legacy],
      ),
    ).toEqual({ sections: [] });

    const tooManySections = Array.from(
      {
        length: MAXIMUM_COHERENCE_PUBLISHER_BOOKMARK_ROUTE_SECTIONS + 1,
      },
      (_, index) => publisherSection(`section-${index}`),
    );
    expect(
      createCoherencePublisherBookmarkRouteModel(
        page(tooManySections),
        artifact(tooManySections.map((item) => migrationSection(item))),
        tooManySections.map((item) => legacySection(item)),
      ),
    ).toEqual({ sections: [] });

    const largeText = "word ".repeat(
      MAXIMUM_COHERENCE_PUBLISHER_BOOKMARK_MODEL_BYTES,
    );
    const largeSection = publisherSection("large", largeText);
    expect(
      createCoherencePublisherBookmarkRouteModel(
        page([largeSection]),
        artifact([migrationSection(largeSection)]),
        [legacySection(largeSection)],
      ),
    ).toEqual({ sections: [] });

    const detached = mutable(page([section]));
    detached.sections[0] = mutable(section);
    expect(
      createCoherencePublisherBookmarkRouteModel(
        detached as unknown as PublisherNextPage,
        artifact([migration]),
        [legacy],
      ),
    ).toEqual({ sections: [] });
  });
});

function currentCorpus() {
  const reader = JSON.parse(
    fs.readFileSync(
      path.join(
        process.cwd(),
        "generated",
        "publisher",
        "host",
        "publication-reader.json",
      ),
      "utf8",
    ),
  ) as PublicationReaderEnvelope;
  const legacy = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "generated", "manuscripts", "catalog.json"),
      "utf8",
    ),
  ) as { sections: LegacySection[] };
  const migration = parseCoherenceReaderStateMigrationArtifact(
    JSON.parse(
      fs.readFileSync(
        path.join(
          process.cwd(),
          "public",
          "publisher",
          "coherence-reader-state-migration.json",
        ),
        "utf8",
      ),
    ) as unknown,
  );
  if (migration === null) {
    throw new TypeError("The current migration artifact is invalid.");
  }
  return Object.freeze({ reader, legacy: legacy.sections, migration });
}

function routeSections(
  work: ReaderWork,
  owner: ReaderSection,
  routePath: string,
): readonly ReaderSection[] {
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
  return work.sections.filter(
    (candidate) =>
      candidate.id === owner.id ||
      (candidate.readerAddress?.path === routePath &&
        descendsFromOwner(candidate)),
  );
}

describe("current Coherence Publisher bookmark route census", () => {
  it("admits only the exact reversible section route subset", () => {
    const { reader, legacy, migration } = currentCorpus();
    expect(reader.buildId).toBe(
      "sha256:77f94de86e3fe3462a4f905ad2884207aa11f8b9137dcf90486031a214af7d03",
    );
    expect(migration.buildId).toBe(
      "sha256:36966a6aba2967e7fbfdc66a537a3a8d10adae528dbb511cf5a8c87c696c922c",
    );
    expect(reader.works).toHaveLength(9);
    expect(reader.works.flatMap(({ sections }) => sections)).toHaveLength(525);
    expect(legacy).toHaveLength(525);
    expect(migration.sections).toHaveLength(525);

    const workById = new Map(reader.works.map((work) => [work.id, work]));
    const inertKinds = new Map<string, number>();
    const admittedOwnerIds = new Set<string>();
    const sizeDistribution = new Map<number, number>();
    let admittedRoutes = 0;
    let sectionInstances = 0;
    let multiSectionRoutes = 0;
    let maximumSections = 0;
    let maximumParagraphs = 0;
    let maximumBytes = 0;
    let maximumPath = "";

    for (const route of reader.routes.active) {
      const target = route.target;
      if (target.kind !== "section") {
        inertKinds.set(target.kind, (inertKinds.get(target.kind) ?? 0) + 1);
        const inertPage = Object.freeze({
          kind: target.kind,
          path: route.path,
          publication: reader.publication,
        }) as unknown as PublisherNextPage;
        expect(
          createCoherencePublisherBookmarkRouteModel(
            inertPage,
            migration,
            legacy,
          ).sections,
          route.path,
        ).toEqual([]);
        continue;
      }
      const work = workById.get(target.workId);
      const owner = work?.sections.find(
        (section) => section.id === target.sectionId,
      );
      if (work === undefined || owner === undefined) {
        throw new TypeError(`Route ${route.path} has no owner.`);
      }
      const sections = routeSections(work, owner, route.path);
      const routePage = Object.freeze({
        kind: "section",
        path: route.path,
        publication: reader.publication,
        work,
        section: owner,
        sections,
      }) as unknown as PublisherNextPage;
      const model = createCoherencePublisherBookmarkRouteModel(
        routePage,
        migration,
        legacy,
      );
      if (model.sections.length === 0) continue;
      admittedRoutes += 1;
      admittedOwnerIds.add(owner.id);
      sectionInstances += model.sections.length;
      if (model.sections.length > 1) multiSectionRoutes += 1;
      maximumSections = Math.max(maximumSections, model.sections.length);
      maximumParagraphs = Math.max(
        maximumParagraphs,
        model.sections.reduce(
          (total, section) => total + section.paragraphs.length,
          0,
        ),
      );
      const bytes = new TextEncoder().encode(JSON.stringify(model)).byteLength;
      if (bytes > maximumBytes) {
        maximumBytes = bytes;
        maximumPath = route.path;
      }
      sizeDistribution.set(
        model.sections.length,
        (sizeDistribution.get(model.sections.length) ?? 0) + 1,
      );
    }

    expect(reader.routes.active).toHaveLength(586);
    expect(Object.fromEntries(inertKinds)).toEqual({
      home: 1,
      work: 9,
      "section-index": 3,
    });
    expect(admittedRoutes).toBe(120);
    expect(admittedOwnerIds.size).toBe(119);
    expect(sectionInstances).toBe(120);
    expect(multiSectionRoutes).toBe(0);
    expect(maximumSections).toBe(1);
    expect(maximumParagraphs).toBe(14);
    expect(maximumBytes).toBe(29_961);
    expect(maximumPath).toBe("/manuscripts/7/the-argument-arrived/");
    expect(Object.fromEntries(sizeDistribution)).toEqual({ 1: 120 });
  });
});
