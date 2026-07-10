import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

type HistoricalRouteKind =
  | "volume"
  | "part"
  | "chapter"
  | "section"
  | "reader"
  | "section-alias"
  | "route-alias";

type CatalogSection = {
  sectionId: string;
  legacySectionIds?: string[];
  volumeId: string;
  title: string;
  href: string;
  readerHref?: string;
  contentHash?: string;
  sourceDoc?: string;
  sourceParagraphStart?: number;
  sourceParagraphEnd?: number;
};

type HistoricalEvolution = Map<string, string>;

type CatalogChapter = {
  chapterId: string;
  href: string;
  sectionIds: string[];
};

type CatalogPart = {
  partId: string;
  title: string;
  order: number;
  href: string;
  sectionIds: string[];
  chapters: CatalogChapter[];
};

type CatalogVolume = {
  volumeId: string;
  href: string;
  sectionIds: string[];
  parts: CatalogPart[];
};

type CatalogAlias = {
  sourceHref: string;
  targetSectionId: string;
};

type CatalogRouteAlias = {
  sourceHref: string;
  targetHref: string;
};

type CatalogSnapshot = {
  volumes: CatalogVolume[];
  sections: CatalogSection[];
  aliases?: CatalogAlias[];
  routeAliases?: CatalogRouteAlias[];
};

type CommitMetadata = {
  commit: string;
  committedAt: string;
  subject: string;
  newestIndex: number;
};

type HistoricalOccurrence = {
  commit: string;
  committedAt: string;
  subject: string;
  kind: HistoricalRouteKind;
  targetSectionIds: string[];
};

type HistoricalRoute = {
  href: string;
  occurrences: HistoricalOccurrence[];
  sectionsById: Map<string, CatalogSection[]>;
};

type RuntimeResolution = {
  href: string;
  kind: HistoricalRouteKind;
  targetSectionIds: string[];
};

type SectionMapping = {
  oldSectionId: string;
  currentSectionId: string;
  evidence: string[];
};

type SuccessorCandidate = {
  href: string;
  kind: "volume" | "part" | "chapter" | "section" | "reader";
  targetSectionIds: string[];
  mappedOldSectionIds: string[];
  confidence: "confirmed" | "strong" | "partial";
  evidence: string[];
};

type AuditOptions = {
  historyRef: string;
  currentRef: string;
  summaryOnly: boolean;
  write: boolean;
  recordLedger: boolean;
};

type SectionLineageEntry = {
  currentSectionId: string;
  continuityIds: string[];
  historicalSectionIds: string[];
};

type HistoricalSectionMapping = {
  oldSectionId: string;
  currentSectionId: string;
};

const repoRoot = path.resolve(import.meta.dirname, "../..");
const catalogRelativePath = "src/generated/manuscripts/catalog.json";
const lineagePath = path.join(repoRoot, "content/series/section-lineage.json");
const historicalMappingPath = path.join(
  repoRoot,
  "content/series/historical-section-mappings.json",
);
const aliasPath = path.join(repoRoot, "content/series/aliases.json");
const routeAliasPath = path.join(repoRoot, "content/series/route-aliases.json");
const routeLedgerPath = path.join(repoRoot, "content/series/route-ledger.json");

type ClassifiedHistoricalRoute = {
  href: string;
  routeKinds: HistoricalRouteKind[];
  sectionMappings: SectionMapping[];
  unmappedOldSectionIds: string[];
  obviousCurrentSuccessors: SuccessorCandidate[];
};

function git(args: string[]): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function catalogAtRef(ref: string): CatalogSnapshot {
  if (ref === "WORKTREE") {
    return JSON.parse(
      fs.readFileSync(path.join(repoRoot, catalogRelativePath), "utf8"),
    ) as CatalogSnapshot;
  }
  return JSON.parse(
    git(["show", `${ref}:${catalogRelativePath}`]),
  ) as CatalogSnapshot;
}

function normalizeHref(href: string): string {
  if (href === "/") return href;
  return href.endsWith("/") ? href : `${href}/`;
}

function pathHref(href: string): string {
  return normalizeHref(href.split("#", 1)[0] ?? href);
}

function volumeRouteSegment(volume: CatalogVolume): string {
  return volume.href.split("/").filter(Boolean)[1] ?? volume.volumeId;
}

function volumeRouteSegments(volume: CatalogVolume): string[] {
  return [...new Set([volumeRouteSegment(volume), volume.volumeId])];
}

function volumeByRouteSegment(
  catalog: CatalogSnapshot,
  segment: string,
): CatalogVolume | undefined {
  return catalog.volumes.find((volume) =>
    volumeRouteSegments(volume).includes(segment),
  );
}

function hrefWithVolumeSegment(href: string, volumeSegment: string): string {
  const parts = normalizeHref(href).split("/").filter(Boolean);
  if (parts[0] !== "manuscripts" || !parts[1]) return normalizeHref(href);
  parts[1] = volumeSegment;
  return normalizeHref(`/${parts.join("/")}`);
}

function canonicalizeVolumeHref(catalog: CatalogSnapshot, href: string): string {
  const parts = normalizeHref(href).split("/").filter(Boolean);
  if (parts[0] !== "manuscripts" || !parts[1]) return normalizeHref(href);
  const volume = volumeByRouteSegment(catalog, parts[1]);
  if (!volume) return normalizeHref(href);
  parts[1] = volumeRouteSegment(volume);
  return normalizeHref(`/${parts.join("/")}`);
}

function isSyntheticFrontMatterPart(part: CatalogPart): boolean {
  return part.partId === "front-matter" && part.order === 0 && part.title === "Front Matter";
}

function authoredPartCount(volume: CatalogVolume): number {
  return volume.parts.filter((part) => !isSyntheticFrontMatterPart(part)).length;
}

function displayPartRouteSegment(part: CatalogPart, volume: CatalogVolume): string {
  if (!isSyntheticFrontMatterPart(part)) return part.partId;
  return authoredPartCount(volume) === 0 ? "contents" : "opening";
}

const staticRouteCache = new WeakMap<
  CatalogSnapshot,
  Map<string, RuntimeResolution>
>();

function staticRoutes(catalog: CatalogSnapshot): Map<string, RuntimeResolution> {
  const cached = staticRouteCache.get(catalog);
  if (cached) return cached;
  const routes = new Map<string, RuntimeResolution>();
  const add = (
    href: string,
    kind: HistoricalRouteKind,
    targetSectionIds: string[],
  ) => {
    const normalized = pathHref(href);
    routes.set(normalized, {
      href: normalized,
      kind,
      targetSectionIds: [...new Set(targetSectionIds)].sort(),
    });
  };
  const addVariants = (
    volume: CatalogVolume,
    href: string,
    kind: HistoricalRouteKind,
    targetSectionIds: string[],
  ) => {
    for (const segment of volumeRouteSegments(volume)) {
      add(hrefWithVolumeSegment(href, segment), kind, targetSectionIds);
    }
  };

  for (const volume of catalog.volumes) {
    addVariants(volume, volume.href, "volume", volume.sectionIds);
    for (const part of volume.parts) {
      addVariants(volume, part.href, "part", part.sectionIds);
      if (isSyntheticFrontMatterPart(part)) {
        for (const segment of volumeRouteSegments(volume)) {
          add(
            `/manuscripts/${segment}/front-matter/`,
            "part",
            part.sectionIds,
          );
          add(
            `/manuscripts/${segment}/${displayPartRouteSegment(part, volume)}/`,
            "part",
            part.sectionIds,
          );
        }
      }
      if (part.partId === volume.volumeId) {
        for (const segment of volumeRouteSegments(volume)) {
          add(
            `/manuscripts/${segment}/${part.partId}/`,
            "part",
            part.sectionIds,
          );
          add(
            `/manuscripts/${segment}/part-${part.partId}/`,
            "part",
            part.sectionIds,
          );
        }
      }
      for (const chapter of part.chapters) {
        if (chapter.href !== part.href) {
          addVariants(
            volume,
            chapter.href,
            "chapter",
            chapter.sectionIds,
          );
        }
        if (isSyntheticFrontMatterPart(part)) {
          for (const segment of volumeRouteSegments(volume)) {
            add(
              `/manuscripts/${segment}/front-matter/${chapter.chapterId}/`,
              "chapter",
              chapter.sectionIds,
            );
          }
        }
      }
    }
  }

  for (const section of catalog.sections) {
    const volume = catalog.volumes.find(
      (candidate) => candidate.volumeId === section.volumeId,
    );
    if (volume) {
      addVariants(volume, section.href, "section", [section.sectionId]);
    } else {
      add(section.href, "section", [section.sectionId]);
    }
  }
  for (const alias of catalog.aliases ?? []) {
    const route = pathHref(alias.sourceHref).split("/").filter(Boolean);
    const volume = volumeByRouteSegment(catalog, route[1] ?? "");
    const sourceVariants = volume
      ? volumeRouteSegments(volume).map((segment) =>
          pathHref(hrefWithVolumeSegment(alias.sourceHref, segment)),
        )
      : [pathHref(alias.sourceHref)];
    if (
      sourceVariants.some(
        (sourceHref) => routes.get(sourceHref)?.kind === "section",
      )
    ) {
      continue;
    }
    if (volume) {
      addVariants(
        volume,
        alias.sourceHref,
        "section-alias",
        [alias.targetSectionId],
      );
    } else {
      add(alias.sourceHref, "section-alias", [alias.targetSectionId]);
    }
  }
  for (const alias of catalog.routeAliases ?? []) {
    const targets = targetsAtHref(catalog, alias.targetHref);
    const route = pathHref(alias.sourceHref).split("/").filter(Boolean);
    const volume = volumeByRouteSegment(catalog, route[1] ?? "");
    if (volume) {
      addVariants(volume, alias.sourceHref, "route-alias", targets);
    } else {
      add(alias.sourceHref, "route-alias", targets);
    }
  }
  staticRouteCache.set(catalog, routes);
  return routes;
}

function canonicalResolution(
  catalog: CatalogSnapshot,
  href: string,
): RuntimeResolution | undefined {
  const normalized = pathHref(href);
  const canonicalized = canonicalizeVolumeHref(catalog, normalized);
  const section = catalog.sections.find(
    (candidate) =>
      pathHref(candidate.href) === normalized ||
      pathHref(candidate.href) === canonicalized,
  );
  if (section) {
    return {
      href: normalized,
      kind: "section",
      targetSectionIds: [section.sectionId],
    };
  }
  for (const volume of catalog.volumes) {
    for (const part of volume.parts) {
      const chapter = part.chapters.find(
        (candidate) =>
          (pathHref(candidate.href) === normalized ||
            pathHref(candidate.href) === canonicalized) &&
          pathHref(candidate.href) !== pathHref(part.href),
      );
      if (chapter) {
        return {
          href: normalized,
          kind: "chapter",
          targetSectionIds: chapter.sectionIds,
        };
      }
      if (isSyntheticFrontMatterPart(part)) {
        const legacyChapter = part.chapters.find(
          (candidate) =>
            volumeRouteSegments(volume).some(
              (segment) =>
                pathHref(
                  `/manuscripts/${segment}/front-matter/${candidate.chapterId}/`,
                ) === normalized,
            ) && pathHref(candidate.href) !== pathHref(part.href),
        );
        if (legacyChapter) {
          return {
            href: normalized,
            kind: "chapter",
            targetSectionIds: legacyChapter.sectionIds,
          };
        }
      }
    }
  }
  for (const volume of catalog.volumes) {
    const part = volume.parts.find(
      (candidate) =>
        pathHref(candidate.href) === normalized ||
        pathHref(candidate.href) === canonicalized,
    );
    if (part) {
      return {
        href: normalized,
        kind: "part",
        targetSectionIds: part.sectionIds,
      };
    }
    const frontMatterPart = volume.parts.find(
      (candidate) =>
        isSyntheticFrontMatterPart(candidate) &&
        volumeRouteSegments(volume).some(
          (segment) =>
            pathHref(`/manuscripts/${segment}/front-matter/`) === normalized,
        ),
    );
    if (frontMatterPart) {
      return {
        href: normalized,
        kind: "part",
        targetSectionIds: frontMatterPart.sectionIds,
      };
    }
    const legacyPart = volume.parts.find(
      (candidate) =>
        candidate.partId === volume.volumeId &&
        volumeRouteSegments(volume).some(
          (segment) =>
            pathHref(`/manuscripts/${segment}/${candidate.partId}/`) === normalized,
        ),
    );
    if (legacyPart) {
      return {
        href: normalized,
        kind: "part",
        targetSectionIds: legacyPart.sectionIds,
      };
    }
    if (
      volumeRouteSegments(volume).some(
        (segment) => pathHref(`/manuscripts/${segment}/`) === normalized,
      )
    ) {
      return {
        href: normalized,
        kind: "volume",
        targetSectionIds: volume.sectionIds,
      };
    }
  }
  return undefined;
}

function baseRuntimeResolution(
  catalog: CatalogSnapshot,
  href: string,
): RuntimeResolution | undefined {
  return staticRoutes(catalog).get(pathHref(href));
}

function runtimeResolution(
  catalog: CatalogSnapshot,
  href: string,
): RuntimeResolution | undefined {
  const [rawPath, fragment] = href.split("#", 2);
  const base = baseRuntimeResolution(catalog, rawPath ?? href);
  if (!base || !fragment) return base;
  const targetSections = catalog.sections.filter((section) =>
    base.targetSectionIds.includes(section.sectionId),
  );
  const identities = targetSections
    .flatMap((section) => [
      { sectionId: section.sectionId, identity: section.sectionId },
      ...(section.legacySectionIds ?? []).map((identity) => ({
        sectionId: section.sectionId,
        identity,
      })),
    ])
    .sort((left, right) => right.identity.length - left.identity.length);
  const qualified = identities.find(
    (identity) =>
      fragment === identity.identity ||
      fragment.startsWith(`${identity.identity}-p-`),
  );
  const bare =
    targetSections.length === 1 &&
    /^p-(?:\d+|h[0-9a-f]{16}(?:-\d+)?)$/.test(fragment)
      ? targetSections[0]?.sectionId
      : undefined;
  const targetSectionId = qualified?.sectionId ?? bare;
  if (!targetSectionId) return undefined;
  return {
    href: normalizedHistoricalHref(href),
    kind: "reader",
    targetSectionIds: [targetSectionId],
  };
}

function commitHistory(ref: string): CommitMetadata[] {
  const format = "%H%x09%cI%x09%s";
  const output = git([
    "log",
    ref,
    "--first-parent",
    `--format=${format}`,
    "--",
    catalogRelativePath,
  ]);
  if (!output) return [];
  return output.split("\n").map((line, newestIndex) => {
    const [commit = "", committedAt = "", ...subject] = line.split("\t");
    return {
      commit,
      committedAt,
      subject: subject.join("\t"),
      newestIndex,
    };
  });
}

function targetsAtHref(catalog: CatalogSnapshot, href: string): string[] {
  const resolution = canonicalResolution(catalog, href);
  return resolution?.targetSectionIds ?? [];
}

function collectHistoricalRoutes(commits: CommitMetadata[]): {
  routes: Map<string, HistoricalRoute>;
  staticPathHrefs: Set<string>;
  sectionSnapshotsById: Map<string, CatalogSection[]>;
} {
  const routes = new Map<string, HistoricalRoute>();
  const staticPathHrefs = new Set<string>();
  const sectionSnapshotsById = new Map<string, CatalogSection[]>();
  const add = (
    commit: CommitMetadata,
    catalog: CatalogSnapshot,
    href: string,
    kind: HistoricalRouteKind,
    targetSectionIds: string[],
  ) => {
    if (!href.startsWith("/manuscripts/")) return;
    const route = routes.get(href) ?? {
      href,
      occurrences: [],
      sectionsById: new Map<string, CatalogSection[]>(),
    };
    const ids = [...new Set(targetSectionIds)].sort();
    const duplicate = route.occurrences.some(
      (occurrence) =>
        occurrence.commit === commit.commit &&
        occurrence.kind === kind &&
        JSON.stringify(occurrence.targetSectionIds) === JSON.stringify(ids),
    );
    if (!duplicate) {
      route.occurrences.push({
        commit: commit.commit,
        committedAt: commit.committedAt,
        subject: commit.subject,
        kind,
        targetSectionIds: ids,
      });
    }
    routes.set(href, route);
  };

  for (const commit of commits) {
    const catalog = catalogAtRef(commit.commit);
    for (const section of catalog.sections ?? []) {
      const snapshots = sectionSnapshotsById.get(section.sectionId) ?? [];
      if (
        !snapshots.some(
          (snapshot) =>
            snapshot.contentHash === section.contentHash &&
            snapshot.href === section.href,
        )
      ) {
        snapshots.push(section);
      }
      sectionSnapshotsById.set(section.sectionId, snapshots);
    }
    for (const [href, resolved] of staticRoutes(catalog)) {
      staticPathHrefs.add(href);
      add(commit, catalog, href, resolved.kind, resolved.targetSectionIds);
    }
    for (const section of catalog.sections ?? []) {
      if (section.readerHref?.includes("#")) {
        add(commit, catalog, section.readerHref, "reader", [section.sectionId]);
      }
    }
  }
  return { routes, staticPathHrefs, sectionSnapshotsById };
}

function readWorkingLineage(): SectionLineageEntry[] {
  if (!fs.existsSync(lineagePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(lineagePath, "utf8")) as {
    sections?: SectionLineageEntry[];
  };
  return parsed.sections ?? [];
}

function readHistoricalMappings(current: CatalogSnapshot): HistoricalSectionMapping[] {
  if (!fs.existsSync(historicalMappingPath)) return [];
  const parsed = JSON.parse(fs.readFileSync(historicalMappingPath, "utf8")) as {
    version?: number;
    mappings?: HistoricalSectionMapping[];
  };
  if (parsed.version !== 1 || !Array.isArray(parsed.mappings)) {
    throw new Error("Historical section mappings must use version 1.");
  }
  const currentIds = new Set(current.sections.map((section) => section.sectionId));
  const oldIds = new Set<string>();
  for (const mapping of parsed.mappings) {
    if (!mapping.oldSectionId || !mapping.currentSectionId) {
      throw new Error("Historical section mappings require old and current IDs.");
    }
    if (oldIds.has(mapping.oldSectionId)) {
      throw new Error(
        `Historical section '${mapping.oldSectionId}' is mapped more than once.`,
      );
    }
    if (!currentIds.has(mapping.currentSectionId)) {
      throw new Error(
        `Historical section '${mapping.oldSectionId}' targets missing section '${mapping.currentSectionId}'.`,
      );
    }
    oldIds.add(mapping.oldSectionId);
  }
  return parsed.mappings;
}

function historicalEvolution(
  sectionSnapshotsById: Map<string, CatalogSection[]>,
  current: CatalogSnapshot,
  lineage: SectionLineageEntry[],
  explicitMappings: HistoricalSectionMapping[],
): HistoricalEvolution {
  const owner = new Map<string, string>();
  for (const section of current.sections) owner.set(section.sectionId, section.sectionId);
  for (const entry of lineage) {
    for (const identity of [
      entry.currentSectionId,
      ...(entry.continuityIds ?? []),
      ...(entry.historicalSectionIds ?? []),
    ]) {
      owner.set(identity, entry.currentSectionId);
    }
  }
  for (const mapping of explicitMappings) {
    owner.set(mapping.oldSectionId, mapping.currentSectionId);
  }
  const snapshots = new Map<string, CatalogSection>();
  for (const [sectionId, candidates] of sectionSnapshotsById) {
    for (const candidate of candidates) {
      const key = JSON.stringify([
        sectionId,
        candidate.contentHash,
        candidate.sourceDoc,
        candidate.sourceParagraphStart,
        candidate.sourceParagraphEnd,
      ]);
      snapshots.set(key, candidate);
    }
  }
  const groups = new Map<string, Set<string>>();
  const add = (key: string, sectionId: string) => {
    const ids = groups.get(key) ?? new Set<string>();
    ids.add(sectionId);
    groups.set(key, ids);
  };
  for (const section of [...snapshots.values(), ...current.sections]) {
    if (section.contentHash) add(`hash:${section.contentHash}`, section.sectionId);
    if (
      section.sourceDoc &&
      typeof section.sourceParagraphStart === "number" &&
      typeof section.sourceParagraphEnd === "number"
    ) {
      add(
        `source:${section.sourceDoc}:${section.sourceParagraphStart}:${section.sourceParagraphEnd}`,
        section.sectionId,
      );
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const ids of groups.values()) {
      const knownOwners = new Set(
        [...ids].map((id) => owner.get(id)).filter((id): id is string => Boolean(id)),
      );
      if (knownOwners.size !== 1) continue;
      const currentSectionId = [...knownOwners][0]!;
      for (const id of ids) {
        if (owner.has(id)) continue;
        owner.set(id, currentSectionId);
        changed = true;
      }
    }
  }
  return owner;
}

function mapHistoricalSections(
  route: HistoricalRoute,
  sectionSnapshotsById: Map<string, CatalogSection[]>,
  current: CatalogSnapshot,
  lineage: SectionLineageEntry[],
  evolution: HistoricalEvolution,
): { mappings: SectionMapping[]; unmapped: string[] } {
  const oldSectionIds = [
    ...new Set(route.occurrences.flatMap((occurrence) => occurrence.targetSectionIds)),
  ].sort();
  const currentById = new Map(
    current.sections.map((section) => [section.sectionId, section]),
  );
  const lineageOwner = new Map<string, string>();
  for (const entry of lineage) {
    for (const identity of [
      entry.currentSectionId,
      ...(entry.continuityIds ?? []),
      ...(entry.historicalSectionIds ?? []),
    ]) {
      lineageOwner.set(identity, entry.currentSectionId);
    }
  }
  const currentByHash = new Map<string, CatalogSection[]>();
  for (const section of current.sections) {
    if (!section.contentHash) continue;
    const matches = currentByHash.get(section.contentHash) ?? [];
    matches.push(section);
    currentByHash.set(section.contentHash, matches);
  }

  const mappings: SectionMapping[] = [];
  const unmapped: string[] = [];
  for (const oldSectionId of oldSectionIds) {
    const evidence = new Set<string>();
    const candidates = new Set<string>();
    if (currentById.has(oldSectionId)) {
      candidates.add(oldSectionId);
      evidence.add("same-section-id");
    }
    const lineageTarget = lineageOwner.get(oldSectionId);
    if (lineageTarget && currentById.has(lineageTarget)) {
      candidates.add(lineageTarget);
      evidence.add("working-section-lineage");
    }
    const evolvedTarget = evolution.get(oldSectionId);
    if (evolvedTarget && currentById.has(evolvedTarget)) {
      candidates.add(evolvedTarget);
      if (evolvedTarget !== oldSectionId) evidence.add("historical-content-evolution");
    }
    const historicalSnapshots = sectionSnapshotsById.get(oldSectionId) ?? [];
    const hashMatches = new Set<string>();
    for (const snapshot of historicalSnapshots) {
      for (const match of currentByHash.get(snapshot.contentHash ?? "") ?? []) {
        hashMatches.add(match.sectionId);
      }
    }
    if (hashMatches.size === 1) {
      candidates.add([...hashMatches][0]!);
      evidence.add("unique-unchanged-content-hash");
    }
    if (candidates.size === 1) {
      mappings.push({
        oldSectionId,
        currentSectionId: [...candidates][0]!,
        evidence: [...evidence].sort(),
      });
    } else {
      unmapped.push(oldSectionId);
    }
  }
  return { mappings, unmapped };
}

function currentRouteCandidates(catalog: CatalogSnapshot): Array<{
  href: string;
  kind: SuccessorCandidate["kind"];
  targetSectionIds: string[];
}> {
  const candidates: Array<{
    href: string;
    kind: SuccessorCandidate["kind"];
    targetSectionIds: string[];
  }> = [];
  for (const volume of catalog.volumes) {
    candidates.push({
      href: volume.href,
      kind: "volume",
      targetSectionIds: volume.sectionIds,
    });
    for (const part of volume.parts) {
      candidates.push({ href: part.href, kind: "part", targetSectionIds: part.sectionIds });
      for (const chapter of part.chapters) {
        candidates.push({
          href: chapter.href,
          kind: "chapter",
          targetSectionIds: chapter.sectionIds,
        });
      }
    }
  }
  for (const section of catalog.sections) {
    candidates.push({
      href: section.href,
      kind: "section",
      targetSectionIds: [section.sectionId],
    });
    if (section.readerHref && section.readerHref !== section.href) {
      candidates.push({
        href: section.readerHref,
        kind: "reader",
        targetSectionIds: [section.sectionId],
      });
    }
  }
  return candidates;
}

function successorCandidates(
  route: HistoricalRoute,
  current: CatalogSnapshot,
  mappings: SectionMapping[],
  unmapped: string[],
): SuccessorCandidate[] {
  if (mappings.length === 0) return [];
  const mappedCurrent = new Set(mappings.map((mapping) => mapping.currentSectionId));
  const oldByCurrent = new Map<string, string[]>();
  for (const mapping of mappings) {
    const ids = oldByCurrent.get(mapping.currentSectionId) ?? [];
    ids.push(mapping.oldSectionId);
    oldByCurrent.set(mapping.currentSectionId, ids);
  }
  const kinds = new Set(route.occurrences.map((occurrence) => occurrence.kind));
  const preferredKinds = kinds.has("volume")
    ? new Set(["volume"])
    : kinds.has("part")
      ? new Set(["part", "chapter", "section", "reader"])
      : kinds.has("chapter")
        ? new Set(["chapter", "section", "reader"])
        : new Set(["section", "reader"]);

  return currentRouteCandidates(current)
    .map((candidate): SuccessorCandidate | null => {
      if (!preferredKinds.has(candidate.kind)) return null;
      const overlap = candidate.targetSectionIds.filter((sectionId) =>
        mappedCurrent.has(sectionId),
      );
      if (overlap.length === 0) return null;
      const mappedOldSectionIds = overlap.flatMap(
        (sectionId) => oldByCurrent.get(sectionId) ?? [],
      );
      const coversAllMapped = overlap.length === mappedCurrent.size;
      const confidence: SuccessorCandidate["confidence"] =
        coversAllMapped && unmapped.length === 0
          ? mappings.every((mapping) => mapping.evidence.includes("same-section-id"))
            ? "confirmed"
            : "strong"
          : "partial";
      return {
        href: candidate.href,
        kind: candidate.kind,
        targetSectionIds: [...new Set(candidate.targetSectionIds)].sort(),
        mappedOldSectionIds: [...new Set(mappedOldSectionIds)].sort(),
        confidence,
        evidence: [
          coversAllMapped ? "contains-all-mapped-lineage" : "partial-lineage-overlap",
          ...new Set(mappings.flatMap((mapping) => mapping.evidence)),
        ].sort(),
      };
    })
    .filter((candidate): candidate is SuccessorCandidate => Boolean(candidate))
    .sort((left, right) => {
      const confidenceOrder = { confirmed: 0, strong: 1, partial: 2 };
      return (
        confidenceOrder[left.confidence] - confidenceOrder[right.confidence] ||
        left.targetSectionIds.length - right.targetSectionIds.length ||
        left.href.localeCompare(right.href)
      );
    })
    .filter(
      (candidate, index, candidates) =>
        candidates.findIndex(
          (item) => item.href === candidate.href && item.kind === candidate.kind,
        ) === index,
    )
    .slice(0, 5);
}

function parseArgs(args: string[]): AuditOptions {
  const options: AuditOptions = {
    historyRef: "HEAD",
    currentRef: "WORKTREE",
    summaryOnly: false,
    write: false,
    recordLedger: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === "--history-ref") {
      if (!value) throw new Error("--history-ref requires a git ref.");
      options.historyRef = value;
      index += 1;
    } else if (arg === "--current-ref") {
      if (!value) throw new Error("--current-ref requires a git ref.");
      options.currentRef = value;
      index += 1;
    } else if (arg === "--summary") {
      options.summaryOnly = true;
    } else if (arg === "--write") {
      options.write = true;
    } else if (arg === "--record-ledger") {
      options.recordLedger = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Audit manuscript links from every first-parent catalog revision.",
          "",
          "Usage:",
          "  tsx scripts/manuscripts/audit-historical-links.ts",
          "  tsx scripts/manuscripts/audit-historical-links.ts --summary",
          "",
          "Options:",
          "  --history-ref <ref>  History tip. Default: HEAD.",
          "  --current-ref <ref>  Catalog used as the resolver. Default: WORKTREE.",
          "  --summary            Emit counts without the route classification.",
          "  --write              Write reviewed section lineage and aliases.",
          "  --record-ledger      Record all historical catalog routes after compile.",
        ].join("\n"),
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown option '${arg}'.`);
    }
  }
  return options;
}

function writeJson(file: string, value: unknown): void {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function selectWritableSuccessor(
  route: ClassifiedHistoricalRoute,
): SuccessorCandidate {
  if (route.routeKinds.length !== 1) {
    throw new Error(
      `Historical route '${route.href}' changed route roles and needs an explicit reviewed mapping.`,
    );
  }
  if (route.unmappedOldSectionIds.length > 0) {
    throw new Error(
      `Historical route '${route.href}' has ${route.unmappedOldSectionIds.length.toLocaleString()} unmapped section identity or identities.`,
    );
  }
  if (
    route.obviousCurrentSuccessors.some(
      (candidate) => candidate.confidence === "partial",
    )
  ) {
    throw new Error(
      `Historical route '${route.href}' has a partial successor and needs an explicit reviewed mapping.`,
    );
  }
  const expectedOldIds = new Set(
    route.sectionMappings.map((mapping) => mapping.oldSectionId),
  );
  const candidates = route.obviousCurrentSuccessors.filter((candidate) => {
    if (candidate.confidence === "partial") return false;
    const covered = new Set(candidate.mappedOldSectionIds);
    return (
      covered.size === expectedOldIds.size &&
      [...expectedOldIds].every((oldSectionId) => covered.has(oldSectionId))
    );
  });
  if (candidates.length !== 1) {
    throw new Error(
      `Historical route '${route.href}' has ${candidates.length.toLocaleString()} complete strong successor candidates. Exactly one is required.`,
    );
  }
  return candidates[0]!;
}

function writeHistoricalCompatibility(
  brokenRoutes: ClassifiedHistoricalRoute[],
  history: Map<string, HistoricalRoute>,
  current: CatalogSnapshot,
  lineage: SectionLineageEntry[],
  evolution: HistoricalEvolution,
): { sectionAliases: number; routeAliases: number; lineageIds: number } {
  const successors = new Map(
    brokenRoutes.map((route) => [route, selectWritableSuccessor(route)]),
  );
  const aliases = JSON.parse(fs.readFileSync(aliasPath, "utf8")) as {
    version: number;
    aliases: Array<{
      sourceHref: string;
      targetSectionId: string;
      note?: string;
    }>;
  };
  const routeAliases = JSON.parse(fs.readFileSync(routeAliasPath, "utf8")) as {
    version: number;
    aliases: Array<{ sourceHref: string; targetHref: string; note?: string }>;
  };
  const sectionAliasBySource = new Map(
    aliases.aliases.map((alias) => [pathHref(alias.sourceHref), alias]),
  );
  const routeAliasBySource = new Map(
    routeAliases.aliases.map((alias) => [pathHref(alias.sourceHref), alias]),
  );
  let addedSectionAliases = 0;
  let addedRouteAliases = 0;
  for (const route of brokenRoutes) {
    const kind = route.routeKinds[0]!;
    const sourceHref = pathHref(route.href);
    const successor = successors.get(route)!;
    if (kind === "section" || kind === "section-alias") {
      const targetSectionId = successor.targetSectionIds[0];
      if (!targetSectionId || successor.targetSectionIds.length !== 1) {
        throw new Error(
          `Historical section route '${sourceHref}' has no unique section successor.`,
        );
      }
      const existing = sectionAliasBySource.get(sourceHref);
      if (existing && existing.targetSectionId !== targetSectionId) {
        throw new Error(`Historical section alias '${sourceHref}' conflicts.`);
      }
      if (!existing) {
        const alias = {
          sourceHref,
          targetSectionId,
          note: "Reviewed successor from the complete catalog history.",
        };
        aliases.aliases.push(alias);
        sectionAliasBySource.set(sourceHref, alias);
        addedSectionAliases += 1;
      }
      continue;
    }
    if (kind === "reader") {
      if (runtimeResolution(current, sourceHref)) continue;
    }
    const targetHref = pathHref(successor.href);
    const existing = routeAliasBySource.get(sourceHref);
    if (existing && pathHref(existing.targetHref) !== targetHref) {
      throw new Error(`Historical structural alias '${sourceHref}' conflicts.`);
    }
    if (!existing) {
      const alias = {
        sourceHref,
        targetHref,
        note: "Reviewed successor from the complete catalog history.",
      };
      routeAliases.aliases.push(alias);
      routeAliasBySource.set(sourceHref, alias);
      addedRouteAliases += 1;
    }
  }

  const lineageByCurrent = new Map(
    lineage.map((entry) => [entry.currentSectionId, entry]),
  );
  const historicalIds = new Set(
    [...history.values()].flatMap((route) =>
      route.occurrences.flatMap((occurrence) => occurrence.targetSectionIds),
    ),
  );
  const currentIds = new Set(current.sections.map((section) => section.sectionId));
  let addedLineageIds = 0;
  for (const oldSectionId of historicalIds) {
    const currentSectionId = evolution.get(oldSectionId);
    if (!currentSectionId || currentIds.has(oldSectionId)) continue;
    const entry = lineageByCurrent.get(currentSectionId);
    if (!entry) {
      throw new Error(`Historical section '${oldSectionId}' has no lineage owner.`);
    }
    if (!entry.continuityIds.includes(oldSectionId)) {
      entry.continuityIds.push(oldSectionId);
      addedLineageIds += 1;
    }
    if (!entry.historicalSectionIds.includes(oldSectionId)) {
      entry.historicalSectionIds.push(oldSectionId);
    }
  }
  for (const entry of lineage) {
    const primary = entry.continuityIds[0] ?? entry.currentSectionId;
    entry.continuityIds = [
      primary,
      ...entry.continuityIds
        .filter((id) => id !== primary)
        .sort((left, right) => left.localeCompare(right)),
    ];
    entry.historicalSectionIds = [
      ...new Set(entry.historicalSectionIds),
    ].sort((left, right) => left.localeCompare(right));
  }
  aliases.aliases.sort((left, right) => left.sourceHref.localeCompare(right.sourceHref));
  routeAliases.aliases.sort((left, right) =>
    left.sourceHref.localeCompare(right.sourceHref),
  );
  writeJson(aliasPath, aliases);
  writeJson(routeAliasPath, routeAliases);
  writeJson(lineagePath, { version: 1, sections: lineage });
  return {
    sectionAliases: addedSectionAliases,
    routeAliases: addedRouteAliases,
    lineageIds: addedLineageIds,
  };
}

function normalizedHistoricalHref(href: string): string {
  const [pathPart, fragment] = href.split("#", 2);
  const normalizedPath = pathHref(pathPart ?? href);
  return fragment ? `${normalizedPath}#${fragment}` : normalizedPath;
}

function recordHistoricalLedger(
  history: Map<string, HistoricalRoute>,
  current: CatalogSnapshot,
  evolution: HistoricalEvolution,
  lineage: SectionLineageEntry[],
): number {
  const ledger = JSON.parse(fs.readFileSync(routeLedgerPath, "utf8")) as {
    version: number;
    routes: Array<{
      href: string;
      kind: HistoricalRouteKind;
      targetContinuityIds: string[];
    }>;
  };
  if (ledger.version !== 2) throw new Error("Route ledger must use version 2.");
  const continuityByCurrent = new Map(
    lineage.map((entry) => [entry.currentSectionId, new Set(entry.continuityIds)]),
  );
  const entries = new Map<string, (typeof ledger.routes)[number]>();
  const add = (entry: (typeof ledger.routes)[number]) => {
    const normalized = {
      ...entry,
      href: normalizedHistoricalHref(entry.href),
      targetContinuityIds: [...new Set(entry.targetContinuityIds)].sort(),
    };
    entries.set(
      JSON.stringify([normalized.href, normalized.kind, normalized.targetContinuityIds]),
      normalized,
    );
  };
  for (const entry of ledger.routes) add(entry);
  const before = entries.size;
  for (const route of history.values()) {
    const resolution = runtimeResolution(current, route.href);
    if (!preservesHistoricalSemantics(route, resolution, evolution)) {
      throw new Error(`Historical route '${route.href}' is unresolved.`);
    }
    for (const occurrence of route.occurrences) {
      const targetContinuityIds: string[] = [];
      for (const oldSectionId of occurrence.targetSectionIds) {
        const currentSectionId = evolution.get(oldSectionId);
        if (!currentSectionId) {
          throw new Error(
            `Historical route '${route.href}' has unmapped section identity '${oldSectionId}'.`,
          );
        }
        const owned = continuityByCurrent.get(currentSectionId);
        targetContinuityIds.push(
          owned?.has(oldSectionId) ? oldSectionId : currentSectionId,
        );
      }
      if (
        targetContinuityIds.length !== occurrence.targetSectionIds.length ||
        targetContinuityIds.length === 0
      ) {
        throw new Error(
          `Historical route '${route.href}' has no mapped continuity owner.`,
        );
      }
      add({
        href: route.href,
        kind: occurrence.kind,
        targetContinuityIds,
      });
    }
  }
  ledger.routes = [...entries.values()].sort(
    (left, right) =>
      left.href.localeCompare(right.href) ||
      left.kind.localeCompare(right.kind) ||
      left.targetContinuityIds.join("\0").localeCompare(
        right.targetContinuityIds.join("\0"),
      ),
  );
  writeJson(routeLedgerPath, ledger);
  return entries.size - before;
}

function mappedOccurrenceTargets(
  occurrence: HistoricalOccurrence,
  evolution: HistoricalEvolution,
): string[] | undefined {
  const targets: string[] = [];
  for (const oldSectionId of occurrence.targetSectionIds) {
    const currentSectionId = evolution.get(oldSectionId);
    if (!currentSectionId) return undefined;
    targets.push(currentSectionId);
  }
  return [...new Set(targets)].sort();
}

function preservesHistoricalSemantics(
  route: HistoricalRoute,
  resolution: RuntimeResolution | undefined,
  evolution: HistoricalEvolution,
): boolean {
  if (!resolution) return false;
  const currentTargets = new Set(resolution.targetSectionIds);
  return route.occurrences.every((occurrence) => {
    const mappedTargets = mappedOccurrenceTargets(occurrence, evolution);
    if (!mappedTargets || mappedTargets.length === 0) return false;
    const overlap = mappedTargets.filter((id) => currentTargets.has(id));
    const membershipMayEvolve = [
      "volume",
      "part",
      "chapter",
      "route-alias",
    ].includes(occurrence.kind);
    return membershipMayEvolve
      ? overlap.length > 0
      : overlap.length === mappedTargets.length;
  });
}

export function auditHistoricalLinks(options: AuditOptions) {
  const commits = commitHistory(options.historyRef);
  const historical = collectHistoricalRoutes(commits);
  const history = historical.routes;
  const current = catalogAtRef(options.currentRef);
  const generatedPaths = new Set(staticRoutes(current).keys());
  const lineage = readWorkingLineage();
  const explicitMappings = readHistoricalMappings(current);
  const evolution = historicalEvolution(
    historical.sectionSnapshotsById,
    current,
    lineage,
    explicitMappings,
  );
  const brokenRoutes = [...history.values()]
    .filter((route) => {
      const base = pathHref(route.href);
      const generated = generatedPaths.has(base);
      const resolution = runtimeResolution(current, route.href);
      return !generated || !preservesHistoricalSemantics(route, resolution, evolution);
    })
    .map((route) => {
      const base = pathHref(route.href);
      const generated = generatedPaths.has(base);
      const resolution = runtimeResolution(current, route.href);
      const preservesSemantics = preservesHistoricalSemantics(
        route,
        resolution,
        evolution,
      );
      const { mappings, unmapped } = mapHistoricalSections(
        route,
        historical.sectionSnapshotsById,
        current,
        lineage,
        evolution,
      );
      const chronological = [...route.occurrences].sort((left, right) =>
        left.committedAt.localeCompare(right.committedAt),
      );
      return {
        href: route.href,
        routeKinds: [
          ...new Set(route.occurrences.map((occurrence) => occurrence.kind)),
        ].sort(),
        firstSeenCommit: chronological[0]?.commit ?? null,
        lastSeenCommit: chronological.at(-1)?.commit ?? null,
        oldTargetSectionIds: [
          ...new Set(
            route.occurrences.flatMap((occurrence) => occurrence.targetSectionIds),
          ),
        ].sort(),
        classification: !generated
          ? "not-in-current-static-params"
          : !resolution
            ? "generated-but-runtime-unresolved"
            : preservesSemantics
            ? "resolved"
              : "resolved-to-wrong-lineage",
        sectionMappings: mappings,
        unmappedOldSectionIds: unmapped,
        obviousCurrentSuccessors: successorCandidates(
          route,
          current,
          mappings,
          unmapped,
        ),
        occurrences: chronological,
      };
    })
    .sort((left, right) => left.href.localeCompare(right.href));

  const byRouteKind: Record<string, number> = {};
  for (const route of brokenRoutes) {
    for (const kind of route.routeKinds) {
      byRouteKind[kind] = (byRouteKind[kind] ?? 0) + 1;
    }
  }
  const summary = {
    historyRef: options.historyRef,
    currentRef: options.currentRef,
    resolverModel: "catalog-runtime-with-volume-alias-variants",
    catalogCommitCount: commits.length,
    historicalHrefCount: history.size,
    historicalStaticPathCount: historical.staticPathHrefs.size,
    historicalFragmentHrefCount: [...history.keys()].filter((href) =>
      href.includes("#"),
    ).length,
    brokenHistoricalHrefCount: brokenRoutes.length,
    brokenByRouteKind: byRouteKind,
    withObviousSuccessor: brokenRoutes.filter(
      (route) => route.obviousCurrentSuccessors.length > 0,
    ).length,
    withoutObviousSuccessor: brokenRoutes.filter(
      (route) => route.obviousCurrentSuccessors.length === 0,
    ).length,
  };
  if ((options.write || options.recordLedger) && options.currentRef !== "WORKTREE") {
    throw new Error("History writes require --current-ref WORKTREE.");
  }
  const changes = options.write
    ? writeHistoricalCompatibility(
        brokenRoutes,
        history,
        current,
        lineage,
        evolution,
      )
    : undefined;
  const recordedLedgerEntries = options.recordLedger
    ? recordHistoricalLedger(history, current, evolution, lineage)
    : undefined;
  return options.summaryOnly
    ? { schemaVersion: 1, summary, changes, recordedLedgerEntries }
    : {
        schemaVersion: 1,
        summary,
        changes,
        recordedLedgerEntries,
        brokenRoutes,
      };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    console.log(JSON.stringify(auditHistoricalLinks(options), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
