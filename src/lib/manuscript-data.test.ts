import { describe, expect, it } from "vitest";
import {
  allSections,
  breadcrumbRoutes,
  chapterByHref,
  chapterNavigation,
  catalog,
  manuscriptHrefFromRoute,
  manuscriptPathParams,
  partByHref,
  partById,
  routeAliasByHref,
  sectionNavigation,
  sectionByHrefOrAlias,
  sectionsForChapter,
  sectionsForPart,
  sectionsStartingAt,
  volumeByRouteSegment,
} from "./manuscript-data";
import { buildCatalog, resolvePublishedRoute } from "../../scripts/manuscripts/shared";

describe("manuscript data", () => {
  it("returns the canonical playback suffix from a section", () => {
    const sections = allSections();
    const start = sections[2]!;

    expect(sectionsStartingAt(start.sectionId).map((section) => section.sectionId)).toEqual(
      sections.slice(2).map((section) => section.sectionId),
    );
  });

  it("returns no playback sections for an unknown section", () => {
    expect(sectionsStartingAt("missing-section")).toEqual([]);
  });

  it("resolves numeric volume routes without renaming stable volume IDs", () => {
    const volume = volumeByRouteSegment("2");

    expect(volume?.volumeId).toBe("wielding-intelligence");
    expect(volume?.href).toBe("/manuscripts/2/");
    expect(volumeByRouteSegment("wielding-intelligence")?.href).toBe(volume?.href);
  });

  it("uses the part as the parent for singleton chapter sections", () => {
    const section = allSections().find(
      (candidate) =>
        candidate.href ===
        "/manuscripts/3/the-reckoning/the-central-wound/",
    );
    expect(section).toBeDefined();
    const part = partById(section!.volumeId, section!.partId);
    const navigation = sectionNavigation(section!);

    expect(navigation?.parent).toEqual({
      title: part?.title,
      href: part?.href,
    });
  });

  it("continues chapter readers through every part and volume boundary", () => {
    const sections = allSections();
    const sectionIndex = new Map(
      sections.map((section, index) => [section.sectionId, index]),
    );
    const failures = catalog.volumes.flatMap((volume) =>
      volume.parts.flatMap((part) =>
        part.chapters.flatMap((chapter) => {
          if (chapter !== part.chapters[part.chapters.length - 1]) return [];

          const chapterSections = sectionsForChapter(
            volume.volumeId,
            part.partId,
            chapter.chapterId,
          );
          const lastSection = chapterSections[chapterSections.length - 1];
          if (!lastSection) return [`${chapter.href}: missing sections`];

          const lastIndex = sectionIndex.get(lastSection.sectionId);
          const expectedNext =
            lastIndex === undefined ? undefined : sections[lastIndex + 1];
          const actualNext = chapterNavigation(
            volume.volumeId,
            part.partId,
            chapter.chapterId,
          )?.next;
          const expectedNavigation = expectedNext
            ? { title: expectedNext.title, href: expectedNext.readerHref }
            : null;

          return JSON.stringify(actualNext) === JSON.stringify(expectedNavigation)
            ? []
            : [
                `${chapter.href}: expected ${JSON.stringify(expectedNavigation)}, received ${JSON.stringify(actualNext)}`,
              ];
        }),
      ),
    );

    expect(failures).toEqual([]);
  });

  it("advances the final Diagnosis chapter into the first Response section", () => {
    const navigation = chapterNavigation(
      "wielding-intelligence",
      "the-diagnosis",
      "the-architecture-of-extraction",
    );

    expect(navigation?.next).toEqual({
      title: "Coherence as Infrastructure",
      href: "/manuscripts/2/the-response/coherence-as-infrastructure/",
    });
  });

  it("omits the duplicate chapter crumb for singleton chapter sections", () => {
    const route = breadcrumbRoutes().find(
      (candidate) =>
        candidate.href ===
        "/manuscripts/3/the-reckoning/the-central-wound/",
    );

    expect(route?.crumbs.map((crumb) => crumb.label)).toEqual([
      "The Reckoning",
      "The Central Wound",
    ]);
    expect(route?.crumbs.map((crumb) => crumb.href)).toEqual([
      "/manuscripts/3/the-reckoning/",
      "/manuscripts/3/the-reckoning/the-central-wound/",
    ]);
  });

  it("resolves structural title cards to their first content sections", () => {
    const oldRoute =
      "/manuscripts/wielding-intelligence/v02-wielding-intelligence/";
    const canonicalRoute =
      "/manuscripts/2/main/builders-of-the-coherent-civilization/";
    const result = sectionByHrefOrAlias(oldRoute);

    expect(
      allSections().some(
        (section) => section.sectionId === "v02-wielding-intelligence",
      ),
    ).toBe(false);
    expect(result?.section.sectionId).toBe(
      "v02-builders-of-the-coherent-civilization",
    );
    expect(result?.alias?.targetHref).toBe(canonicalRoute);
    expect(
      breadcrumbRoutes().some(
        (candidate) => candidate.href === "/manuscripts/2/main/wielding-intelligence/",
      ),
    ).toBe(false);
  });

  it("resolves collapsed canonical section hrefs and old duplicate aliases", () => {
    const canonical = "/manuscripts/1/seed-sprout-stem-and-soil/the-seed/";
    const oldDuplicate =
      "/manuscripts/humanitys-most-viable-future/seed-sprout-stem-and-soil/seed-sprout-stem-and-soil/v01-seed-sprout-stem-and-soil/";

    expect(sectionByHrefOrAlias(canonical)?.section.sectionId).toBe("v01-the-seed");
    expect(sectionByHrefOrAlias(oldDuplicate)?.alias?.targetHref).toBe(canonical);
  });

  it("resolves skipped part opener aliases to content sections", () => {
    const opener =
      "/manuscripts/humanitys-most-viable-future/seed-sprout-stem-and-soil/v01-seed-sprout-stem-and-soil/";
    const target = "/manuscripts/1/seed-sprout-stem-and-soil/the-seed/";
    const keys = new Set(
      manuscriptPathParams().map((param) => `${param.volumeId}/${param.route.join("/")}`),
    );

    expect(sectionByHrefOrAlias(opener)?.section.sectionId).toBe("v01-the-seed");
    expect(sectionByHrefOrAlias(opener)?.alias?.targetHref).toBe(target);
    expect(
      keys.has(
        "humanitys-most-viable-future/seed-sprout-stem-and-soil/v01-seed-sprout-stem-and-soil",
      ),
    ).toBe(true);
  });

  it("publishes clean synthetic opening and contents routes", () => {
    const opening = partByHref("/manuscripts/1/opening/");
    const contents = partByHref("/manuscripts/8/contents/");
    const openingSection = sectionByHrefOrAlias("/manuscripts/1/opening/orientation/");
    const contentsSection = sectionByHrefOrAlias(
      "/manuscripts/8/contents/prologue-two-scenes/start/",
    );

    expect(opening?.part.partId).toBe("front-matter");
    expect(opening?.part.title).toBe("Front Matter");
    expect(contents?.part.partId).toBe("front-matter");
    expect(contents?.part.title).toBe("Front Matter");
    expect(openingSection?.section.sectionId).toBe("v01-orientation");
    expect(contentsSection?.section.sectionId).toBe("v08-prologue-two-scenes");
  });

  it("keeps legacy front matter routes available as aliases", () => {
    const legacyOpeningPart = partByHref(
      "/manuscripts/humanitys-most-viable-future/front-matter/",
    );
    const legacyContentsPart = partByHref(
      "/manuscripts/misanthropic-artifice/front-matter/",
    );
    const legacyChapter = chapterByHref(
      "/manuscripts/misanthropic-artifice/front-matter/prologue-two-scenes/",
    );
    const legacySection = sectionByHrefOrAlias(
      "/manuscripts/misanthropic-artifice/front-matter/prologue-two-scenes/v08-prologue-two-scenes/",
    );
    const keys = new Set(
      manuscriptPathParams().map((param) => `${param.volumeId}/${param.route.join("/")}`),
    );

    expect(legacyOpeningPart?.part.href).toBe(
      "/manuscripts/1/opening/",
    );
    expect(legacyContentsPart?.part.href).toBe("/manuscripts/8/contents/");
    expect(legacyChapter?.chapter.href).toBe(
      "/manuscripts/8/contents/prologue-two-scenes/",
    );
    expect(legacySection?.section.href).toBe(
      "/manuscripts/8/contents/prologue-two-scenes/start/",
    );
    expect(legacySection?.alias?.targetHref).toBe(
      "/manuscripts/8/contents/prologue-two-scenes/start/",
    );
    expect(keys.has("humanitys-most-viable-future/front-matter")).toBe(true);
    expect(keys.has("misanthropic-artifice/front-matter/prologue-two-scenes")).toBe(true);
  });

  it("resolves skipped chapter opener aliases to content sections", () => {
    const opener =
      "/manuscripts/humanitys-most-viable-future/seed-sprout-stem-and-soil/the-sprout/v01-the-sprout/";
    const target =
      "/manuscripts/1/seed-sprout-stem-and-soil/the-sprout/when-scale-outruns-regulation/";
    const keys = new Set(
      manuscriptPathParams().map((param) => `${param.volumeId}/${param.route.join("/")}`),
    );

    expect(sectionByHrefOrAlias(opener)?.section.sectionId).toBe(
      "v01-when-scale-outruns-regulation",
    );
    expect(sectionByHrefOrAlias(opener)?.alias?.targetHref).toBe(target);
    expect(
      keys.has(
        "humanitys-most-viable-future/seed-sprout-stem-and-soil/the-sprout/v01-the-sprout",
      ),
    ).toBe(true);
  });

  it("keeps duplicate part and chapter labels out of collapsed breadcrumbs", () => {
    const route = breadcrumbRoutes().find(
      (candidate) =>
        candidate.href ===
        "/manuscripts/1/seed-sprout-stem-and-soil/the-seed/",
    );

    expect(route?.crumbs.map((crumb) => crumb.label)).toEqual([
      "Seed, Sprout, Stem & Soil",
      "The Seed",
    ]);
    expect(route?.crumbs.map((crumb) => crumb.href)).toEqual([
      "/manuscripts/1/seed-sprout-stem-and-soil/",
      "/manuscripts/1/seed-sprout-stem-and-soil/the-seed/",
    ]);
  });

  it("points multi-section chapters at one reader page with section anchors", () => {
    const sections = allSections().filter((section) =>
      section.chapterHref.endsWith(
        "/4/the-governance-architecture/the-amendment-architecture/",
      ),
    );
    const sectionIds = sections.map((section) => section.sectionId);

    expect(sectionIds).toEqual([
      "v04-the-amendment-architecture",
      "v04-research-lineages-9",
      "v04-open-questions-9",
    ]);
    expect(sections.map((section) => section.readerHref)).toEqual([
      `${sections[0]!.chapterHref}#v04-the-amendment-architecture`,
      `${sections[0]!.chapterHref}#v04-research-lineages-9`,
      `${sections[0]!.chapterHref}#v04-open-questions-9`,
    ]);

    const oldChildRoute = breadcrumbRoutes().find(
      (candidate) => candidate.href === sections[0]!.href,
    );

    expect(oldChildRoute?.crumbs.map((crumb) => crumb.label)).toEqual([
      "The Governance Architecture",
      "The Amendment Architecture",
    ]);
  });

  it("generates static params for canonical and aliased section paths", () => {
    const keys = new Set(
      manuscriptPathParams().map((param) => `${param.volumeId}/${param.route.join("/")}`),
    );

    expect(keys.has("1/seed-sprout-stem-and-soil/the-seed")).toBe(true);
    expect(
      keys.has(
        "humanitys-most-viable-future/seed-sprout-stem-and-soil/seed-sprout-stem-and-soil/v01-seed-sprout-stem-and-soil",
      ),
    ).toBe(true);
  }, 20_000);

  it("resolves every generated static path through page precedence", () => {
    const catalog = buildCatalog();
    const runtimeCache = new Map<
      string,
      | {
          kind: string;
          targetHref: string;
          targetContinuityIds: string[];
        }
      | undefined
    >();
    const canonicalRuntimeHref = (volumeId: string, route: string[]) => {
      const volume = volumeByRouteSegment(volumeId);
      const canonicalVolumeId = volume?.href.split("/").filter(Boolean)[1];
      return manuscriptHrefFromRoute(canonicalVolumeId ?? volumeId, route);
    };
    const runtimeResolution = (href: string) => {
      if (runtimeCache.has(href)) return runtimeCache.get(href);
      const routeAlias = routeAliasByHref(href);
      const resolvedHref = routeAlias?.targetHref ?? href;
      const section = sectionByHrefOrAlias(resolvedHref);
      const chapter = section ? undefined : chapterByHref(resolvedHref);
      const part = section || chapter ? undefined : partByHref(resolvedHref);
      const runtimeSections = section
        ? [section.section]
        : chapter
          ? sectionsForChapter(
              chapter.volume.volumeId,
              chapter.part.partId,
              chapter.chapter.chapterId,
            )
          : part
            ? sectionsForPart(part.volume.volumeId, part.part.partId)
            : [];
      const targetContinuityIds = [
        ...new Set(
          runtimeSections.flatMap((candidate) => [
            candidate.continuityId,
            ...candidate.legacyContinuityIds,
          ]),
        ),
      ].sort();
      const resolution = routeAlias
        ? {
            kind: "route-alias",
            targetHref: routeAlias.targetHref,
            targetContinuityIds,
          }
        : section
          ? {
              kind: section.alias ? "section-alias" : "section",
              targetHref: section.alias
                ? section.section.readerHref
                : section.section.href,
              targetContinuityIds,
            }
          : chapter
            ? {
                kind: "chapter",
                targetHref: chapter.chapter.href,
                targetContinuityIds,
              }
            : part
              ? {
                  kind: "part",
                  targetHref: part.part.href,
                  targetContinuityIds,
                }
              : undefined;
      runtimeCache.set(href, resolution);
      return resolution;
    };
    const failures = manuscriptPathParams().flatMap((param) => {
      const requestedHref = manuscriptHrefFromRoute(param.volumeId, param.route);
      const compiledMatch = resolvePublishedRoute(catalog, requestedHref);
      const runtimeMatch = runtimeResolution(
        canonicalRuntimeHref(param.volumeId, param.route),
      );
      if (!runtimeMatch || !compiledMatch) return [requestedHref];
      return runtimeMatch.kind === compiledMatch.kind &&
        runtimeMatch.targetHref === compiledMatch.targetHref &&
        JSON.stringify(runtimeMatch.targetContinuityIds) ===
          JSON.stringify(compiledMatch.targetContinuityIds)
        ? []
        : [
            `${requestedHref} runtime=${JSON.stringify(runtimeMatch)} compiled=${JSON.stringify(compiledMatch)}`,
          ];
    });

    expect(failures).toEqual([]);
  }, 60_000);

  it("lands every reader link on a page that renders its section", () => {
    const failures = allSections().flatMap((section) => {
      const href = section.readerHref.replace(/#.*$/, "");
      const standalone = sectionByHrefOrAlias(href)?.section;
      if (standalone?.sectionId === section.sectionId) return [];
      const chapter = chapterByHref(href);
      if (
        chapter &&
        sectionsForChapter(
          chapter.volume.volumeId,
          chapter.part.partId,
          chapter.chapter.chapterId,
        ).some((candidate) => candidate.sectionId === section.sectionId)
      ) {
        return [];
      }
      const part = partByHref(href);
      if (
        part &&
        sectionsForPart(part.volume.volumeId, part.part.partId).some(
          (candidate) => candidate.sectionId === section.sectionId,
        )
      ) {
        return [];
      }
      return [section.readerHref];
    });

    expect(failures).toEqual([]);
  });

  it("resolves numeric and named volume variants to the same alias target", () => {
    const numeric = routeAliasByHref("/manuscripts/1/front-matter/");
    const named = routeAliasByHref(
      "/manuscripts/humanitys-most-viable-future/front-matter/",
    );

    expect(numeric).toBeDefined();
    expect(named?.targetHref).toBe(numeric?.targetHref);
  });
});
