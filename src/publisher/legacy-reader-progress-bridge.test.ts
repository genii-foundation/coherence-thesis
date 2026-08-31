import fs from "node:fs";
import path from "node:path";
import type { PublisherNextPage } from "@genii-foundation/publisher-next/server";
import type { PublicationReaderEnvelope } from "@genii-foundation/publisher-schema";
import { describe, expect, it } from "vitest";

import {
  createCoherencePublisherLegacyProgressModel,
  MAXIMUM_COHERENCE_PUBLISHER_PROGRESS_MODEL_BYTES,
  MAXIMUM_COHERENCE_PUBLISHER_PROGRESS_ROUTE_PARAGRAPHS,
  MAXIMUM_COHERENCE_PUBLISHER_PROGRESS_ROUTE_SECTIONS,
} from "./legacy-reader-progress-bridge";
import {
  parseCoherenceReaderStateMigrationArtifact,
  type CoherenceReaderStateMigrationArtifact,
  type CoherenceReaderStateMigrationSection,
} from "./reader-state-migration-schema";

type PublisherSection = PublicationReaderEnvelope["works"][number]["sections"][number];
type PublisherWork = PublicationReaderEnvelope["works"][number];

const publisherHash = (character: string) =>
  `sha256:${character.repeat(64)}`;

function publisherSection(
  id: string,
  options: Readonly<{ paragraphCount?: number }> = {},
): PublisherSection {
  const paragraphCount = options.paragraphCount ?? 1;
  return Object.freeze({
    activeRouteNames: Object.freeze(["canonical"]),
    blocks: Object.freeze([
      Object.freeze({
        contentHash: publisherHash("b"),
        id: `${id}-block`,
        kind: "paragraph" as const,
        markdown: "Alpha beta",
        readerAddress: Object.freeze({
          anchor: `${id}-block`,
          path: `/manuscripts/1/${id}/`,
        }),
        text: "Alpha beta",
        wordCount: 2,
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
    role: "section" as const,
    routes: Object.freeze({ canonical: `/manuscripts/1/${id}/` }),
    title: id,
    wordCount: 2,
    testParagraphCount: paragraphCount,
  }) as unknown as PublisherSection;
}

function migrationSection(
  section: PublisherSection,
  paragraphCount = 1,
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
    paragraphs: Object.freeze(
      Array.from({ length: paragraphCount }, (_, index) =>
        Object.freeze({
          legacyParagraphId: `p-h${index.toString(16).padStart(16, "0")}`,
          legacyContentHash: "fedcba9876543210",
          legacyTextCodeUnits: 10,
          blockId: `${section.id}-block`,
          blockContentHash: publisherHash("b"),
          blockTextCodeUnits: 10,
          offsetSegments: Object.freeze([
            Object.freeze({ legacyStart: 0, targetStart: 0, length: 10 }),
          ]),
        }),
      ),
    ),
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
  sections: readonly PublisherSection[],
): Extract<PublisherNextPage, { readonly kind: "section" }> {
  const owner = sections[0];
  if (owner === undefined) throw new TypeError("A test page needs an owner.");
  return Object.freeze({
    kind: "section",
    path: owner.readerAddress!.path,
    publication: Object.freeze({ id: "publication" }),
    work: Object.freeze({ id: "work" }),
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

describe("Coherence Publisher legacy progress bridge", () => {
  it("projects only the legacy fields that retain exact progress meaning", () => {
    const section = publisherSection("section");
    const model = createCoherencePublisherLegacyProgressModel(
      page([section]),
      artifact([migrationSection(section)]),
    );

    expect(model).toEqual({
      sections: [
        {
          sectionId: "section",
          continuityId: "section-continuity",
          legacyContinuityIds: ["section-old-continuity"],
          progressContinuityGroups: [
            ["section-continuity", "section-old-continuity"],
          ],
          legacySectionIds: ["section-old-section"],
          contentHash: "0123456789abcdef",
          paragraphs: [
            {
              anchor: "p-h0000000000000000",
              contentHash: "fedcba9876543210",
              paragraphId: "p-h0000000000000000",
            },
          ],
        },
      ],
    });
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.sections)).toBe(true);
  });

  it("fails the whole multi-section route closed when any authority drifts", () => {
    const first = publisherSection("first");
    const second = publisherSection("second");
    const changed = mutable(migrationSection(second));
    changed.contentHash = publisherHash("e");

    expect(
      createCoherencePublisherLegacyProgressModel(
        page([first, second]),
        artifact([migrationSection(first), changed]),
      ),
    ).toEqual({ sections: [] });
  });

  it.each([
    ["work owner", (value: DeepMutable<CoherenceReaderStateMigrationSection>) => {
      value.workId = "other-work";
    }],
    ["continuity", (value: DeepMutable<CoherenceReaderStateMigrationSection>) => {
      value.sectionContinuityId = "other-continuity";
    }],
    ["Reader content", (value: DeepMutable<CoherenceReaderStateMigrationSection>) => {
      value.contentHash = publisherHash("e");
    }],
    ["Reader destination", (value: DeepMutable<CoherenceReaderStateMigrationSection>) => {
      value.href = "/other/";
    }],
    ["legacy content", (value: DeepMutable<CoherenceReaderStateMigrationSection>) => {
      value.legacyContentHash = "not-a-legacy-hash";
    }],
    ["section aliases", (value: DeepMutable<CoherenceReaderStateMigrationSection>) => {
      value.acceptedLegacySectionIds = ["section"];
    }],
    ["continuity aliases", (value: DeepMutable<CoherenceReaderStateMigrationSection>) => {
      value.acceptedLegacyContinuityIds = ["section-continuity"];
    }],
    ["block identity", (value: DeepMutable<CoherenceReaderStateMigrationSection>) => {
      value.paragraphs[0]!.blockContentHash = publisherHash("e");
    }],
    ["block text extent", (value: DeepMutable<CoherenceReaderStateMigrationSection>) => {
      value.paragraphs[0]!.blockTextCodeUnits = 9;
    }],
    ["legacy paragraph content", (value: DeepMutable<CoherenceReaderStateMigrationSection>) => {
      value.paragraphs[0]!.legacyContentHash = "not-a-legacy-hash";
    }],
  ])("refuses a drifted %s", (_label, change) => {
    const section = publisherSection("section");
    const changed = mutable(migrationSection(section));
    change(changed);
    expect(
      createCoherencePublisherLegacyProgressModel(
        page([section]),
        artifact([changed]),
      ),
    ).toEqual({ sections: [] });
  });

  it("refuses duplicate route, migration, and paragraph identities", () => {
    const section = publisherSection("section");
    const duplicateParagraph = mutable(migrationSection(section, 2));
    duplicateParagraph.paragraphs[1]!.legacyParagraphId =
      duplicateParagraph.paragraphs[0]!.legacyParagraphId;

    expect(
      createCoherencePublisherLegacyProgressModel(
        page([section, section]),
        artifact([migrationSection(section)]),
      ),
    ).toEqual({ sections: [] });
    expect(
      createCoherencePublisherLegacyProgressModel(
        page([section]),
        artifact([migrationSection(section), migrationSection(section)]),
      ),
    ).toEqual({ sections: [] });
    expect(
      createCoherencePublisherLegacyProgressModel(
        page([section]),
        artifact([duplicateParagraph]),
      ),
    ).toEqual({ sections: [] });
  });

  it("keeps unsupported and unbounded route shapes inert", () => {
    const section = publisherSection("section");
    const inputArtifact = artifact([migrationSection(section)]);
    const workPage = Object.freeze({
      kind: "work",
      publication: Object.freeze({ id: "publication" }),
    }) as unknown as PublisherNextPage;
    expect(
      createCoherencePublisherLegacyProgressModel(workPage, inputArtifact),
    ).toEqual({ sections: [] });

    const tooManySections = Array.from(
      {
        length:
          MAXIMUM_COHERENCE_PUBLISHER_PROGRESS_ROUTE_SECTIONS + 1,
      },
      (_, index) => publisherSection(`section-${index}`),
    );
    expect(
      createCoherencePublisherLegacyProgressModel(
        page(tooManySections),
        artifact(tooManySections.map((item) => migrationSection(item))),
      ),
    ).toEqual({ sections: [] });

    const paragraphHeavy = publisherSection("paragraph-heavy");
    expect(
      createCoherencePublisherLegacyProgressModel(
        page([paragraphHeavy]),
        artifact([
          migrationSection(
            paragraphHeavy,
            MAXIMUM_COHERENCE_PUBLISHER_PROGRESS_ROUTE_PARAGRAPHS + 1,
          ),
        ]),
      ),
    ).toEqual({ sections: [] });

    const byteHeavy = mutable(publisherSection("byte-heavy"));
    byteHeavy.continuity.legacyIds = [
      `legacy-${"x".repeat(MAXIMUM_COHERENCE_PUBLISHER_PROGRESS_MODEL_BYTES)}`,
    ];
    byteHeavy.continuity.progressGroups = [[
      byteHeavy.continuity.id,
      ...byteHeavy.continuity.legacyIds,
    ]];
    expect(
      createCoherencePublisherLegacyProgressModel(
        page([byteHeavy]),
        artifact([migrationSection(byteHeavy)]),
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
  const parsedMigration = parseCoherenceReaderStateMigrationArtifact(
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
  if (parsedMigration === null) {
    throw new TypeError("The current migration artifact is invalid.");
  }
  return Object.freeze({ reader, migration: parsedMigration });
}

function routeSections(
  work: PublisherWork,
  owner: PublisherSection,
  routePath: string,
): readonly PublisherSection[] {
  const byId = new Map(work.sections.map((section) => [section.id, section]));
  const descendsFromOwner = (candidate: PublisherSection): boolean => {
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

describe("current Coherence Publisher progress route census", () => {
  it("binds every current section route within the reviewed runtime bounds", () => {
    const { reader, migration } = currentCorpus();
    expect(reader.buildId).toBe(
      "sha256:77f94de86e3fe3462a4f905ad2884207aa11f8b9137dcf90486031a214af7d03",
    );
    expect(migration.buildId).toBe(
      "sha256:36966a6aba2967e7fbfdc66a537a3a8d10adae528dbb511cf5a8c87c696c922c",
    );
    expect(reader.works).toHaveLength(9);
    expect(reader.works.flatMap(({ sections }) => sections)).toHaveLength(525);
    expect(migration.sections).toHaveLength(525);
    expect(
      migration.sections.reduce(
        (total, section) => total + section.paragraphs.length,
        0,
      ),
    ).toBe(2_555);

    const workById = new Map(reader.works.map((work) => [work.id, work]));
    const activeKinds = new Map<string, number>();
    for (const route of reader.routes.active) {
      activeKinds.set(
        route.target.kind,
        (activeKinds.get(route.target.kind) ?? 0) + 1,
      );
    }
    expect(reader.routes.active).toHaveLength(586);
    expect(Object.fromEntries(activeKinds)).toEqual({
      home: 1,
      work: 9,
      section: 573,
      "section-index": 3,
    });

    const sizeDistribution = new Map<number, number>();
    let sectionInstances = 0;
    let multiSectionRoutes = 0;
    let maximumSections = 0;
    let maximumParagraphs = 0;
    let maximumBytes = 0;
    const sectionOwnerIds = new Set<string>();
    for (const route of reader.routes.active) {
      const target = route.target;
      if (target.kind !== "section") continue;
      const work = workById.get(target.workId);
      const owner = work?.sections.find(
        ({ id }) => id === target.sectionId,
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
      const model = createCoherencePublisherLegacyProgressModel(
        routePage,
        migration,
      );
      expect(model.sections, route.path).toHaveLength(sections.length);
      sectionOwnerIds.add(owner.id);
      sectionInstances += sections.length;
      if (sections.length > 1) multiSectionRoutes += 1;
      maximumSections = Math.max(maximumSections, sections.length);
      maximumParagraphs = Math.max(
        maximumParagraphs,
        model.sections.reduce(
          (total, section) => total + section.paragraphs.length,
          0,
        ),
      );
      maximumBytes = Math.max(
        maximumBytes,
        new TextEncoder().encode(JSON.stringify(model)).byteLength,
      );
      sizeDistribution.set(
        sections.length,
        (sizeDistribution.get(sections.length) ?? 0) + 1,
      );
    }

    expect(sectionOwnerIds.size).toBe(525);
    expect(sectionInstances).toBe(680);
    expect(multiSectionRoutes).toBe(46);
    expect(Object.fromEntries(sizeDistribution)).toEqual({
      1: 527,
      2: 8,
      3: 30,
      4: 2,
      5: 1,
      6: 2,
      7: 2,
      8: 1,
    });
    expect(maximumSections).toBe(8);
    expect(maximumParagraphs).toBe(46);
    expect(maximumBytes).toBe(5_174);
  });
});
