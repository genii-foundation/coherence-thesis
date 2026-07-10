import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  aliasConfigPath,
  buildCatalog,
  catalogPath,
  currentPublishedRoutes,
  manuscriptRoot,
  readAliasConfig,
  readRouteAliasConfig,
  readRouteLedger,
  readSectionLineage,
  repoRoot,
  resolvePublishedRoute,
  routeAliasConfigPath,
  sectionLineagePath,
  validateSectionLineageConfig,
  writeJson,
  type CompiledCatalog,
  type CompiledSection,
  type PublishedRouteKind,
  type RouteAliasConfig,
  type RouteAliasInput,
  type RouteLedger,
  type SectionAliasConfig,
  type SectionAlias,
  type SectionAliasInput,
  type SectionLineageConfig,
  type SectionLineageEntry,
} from "./shared";

export type SectionLineageMatch = {
  previousSectionId: string;
  currentSectionId: string;
  confidence: number;
  reason: "explicit" | "established-lineage" | "same-content";
};

export type LinkPreservationIssue = {
  previousSectionId?: string;
  sourceHref?: string;
  message: string;
  candidates?: Array<{ sectionId?: string; href?: string; score: number }>;
};

export type LinkPreservationPlan = {
  base: string;
  lineage: SectionLineageMatch[];
  sectionLineage: SectionLineageConfig;
  sectionAliases: SectionAliasConfig;
  routeAliases: RouteAliasConfig;
  addedSectionAliases: SectionAliasInput[];
  updatedSectionAliases: SectionAliasInput[];
  removedSectionAliases: SectionAliasInput[];
  addedRouteAliases: RouteAliasInput[];
  updatedRouteAliases: RouteAliasInput[];
  removedRouteAliases: RouteAliasInput[];
  unresolved: LinkPreservationIssue[];
  changed: boolean;
};

type PlanOptions = {
  previous: CompiledCatalog;
  current: CompiledCatalog;
  existingSectionAliases?: SectionAliasConfig;
  existingRouteAliases?: RouteAliasConfig;
  existingRouteLedger?: RouteLedger;
  existingSectionLineage?: SectionLineageConfig;
  explicitMappings?: Map<string, string>;
  explicitContinuityMappings?: Map<string, string>;
  explicitRouteMappings?: Map<string, string>;
  base?: string;
};

type CliOptions = {
  base: string;
  write: boolean;
  format: "text" | "json";
  mappings: Map<string, string>;
  continuityMappings: Map<string, string>;
  routeMappings: Map<string, string>;
  help: boolean;
};

type StructuralRoute = {
  href: string;
  kind: Extract<PublishedRouteKind, "volume" | "part" | "chapter">;
  targetContinuityIds: string[];
};

type RouteSuccessor = {
  href: string;
  kind: Extract<PublishedRouteKind, "part" | "chapter" | "section">;
  targetContinuityIds: string[];
};

function normalizedTokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .match(/[a-z0-9]+(?:['\u2019][a-z0-9]+)?/g) ?? [],
  );
}

export function proseSimilarity(left: string, right: string): number {
  const leftTokens = normalizedTokens(left);
  const rightTokens = normalizedTokens(right);
  if (leftTokens.size === 0 && rightTokens.size === 0) return 1;
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  return (2 * intersection) / (leftTokens.size + rightTokens.size);
}

function compatibleContinuityIds(section: CompiledSection): string[] {
  return [
    ...new Set([
      section.continuityId || section.sectionId,
      ...(section.legacyContinuityIds ?? []),
    ]),
  ];
}

function intersect(left: string[], right: string[]): string[] {
  const wanted = new Set(right);
  return left.filter((item) => wanted.has(item));
}

function relativePosition(index: number, length: number): number {
  return length <= 1 ? 0 : index / (length - 1);
}

function sectionSuggestionScore({
  previous,
  current,
  previousIndex,
  currentIndex,
  previousCount,
  currentCount,
}: {
  previous: CompiledSection;
  current: CompiledSection;
  previousIndex: number;
  currentIndex: number;
  previousCount: number;
  currentCount: number;
}): number {
  const prose = proseSimilarity(previous.text, current.text);
  const title = proseSimilarity(previous.title, current.title);
  const position =
    1 -
    Math.abs(
      relativePosition(previousIndex, previousCount) -
        relativePosition(currentIndex, currentCount),
    );
  const sameSource =
    previous.sourceDoc && current.sourceDoc && previous.sourceDoc === current.sourceDoc;
  const lineDistance =
    sameSource &&
    typeof previous.sourceParagraphStart === "number" &&
    typeof current.sourceParagraphStart === "number"
      ? Math.abs(previous.sourceParagraphStart - current.sourceParagraphStart)
      : 200;
  const sourcePosition = sameSource ? 1 - Math.min(1, lineDistance / 200) : 0;
  return prose * 0.7 + title * 0.1 + position * 0.1 + sourcePosition * 0.1;
}

function volumeSections(catalog: CompiledCatalog, volumeId: string): CompiledSection[] {
  return catalog.sections.filter((section) => section.volumeId === volumeId);
}

function matchLineage(
  previous: CompiledCatalog,
  current: CompiledCatalog,
  existingLineage: SectionLineageConfig,
  explicitMappings: Map<string, string>,
): { lineage: SectionLineageMatch[]; unresolved: LinkPreservationIssue[] } {
  const previousById = new Map(
    previous.sections.map((section) => [section.sectionId, section]),
  );
  const currentById = new Map(
    current.sections.map((section) => [section.sectionId, section]),
  );
  const establishedByCurrent = new Map(
    existingLineage.sections.map((entry) => [entry.currentSectionId, entry]),
  );
  const matches = new Map<string, SectionLineageMatch>();
  const automaticallyUsedCurrent = new Set<string>();
  const unresolved: LinkPreservationIssue[] = [];

  const add = (
    previousSectionId: string,
    currentSectionId: string,
    confidence: number,
    reason: SectionLineageMatch["reason"],
    allowSharedTarget = false,
  ) => {
    if (
      matches.has(previousSectionId) ||
      (!allowSharedTarget && automaticallyUsedCurrent.has(currentSectionId))
    ) {
      return false;
    }
    matches.set(previousSectionId, {
      previousSectionId,
      currentSectionId,
      confidence,
      reason,
    });
    automaticallyUsedCurrent.add(currentSectionId);
    return true;
  };

  for (const [previousSectionId, currentSectionId] of explicitMappings) {
    if (!previousById.has(previousSectionId)) {
      unresolved.push({
        previousSectionId,
        message: `Explicit mapping source '${previousSectionId}' is not in the base catalog.`,
      });
      continue;
    }
    if (!currentById.has(currentSectionId)) {
      unresolved.push({
        previousSectionId,
        message: `Explicit mapping target '${currentSectionId}' is not in the current catalog.`,
      });
      continue;
    }
    add(previousSectionId, currentSectionId, 1, "explicit", true);
  }

  for (const previousSection of previous.sections) {
    if (matches.has(previousSection.sectionId)) continue;
    const currentSection = currentById.get(previousSection.sectionId);
    const established = establishedByCurrent.get(previousSection.sectionId);
    if (!currentSection || !established) continue;
    if (
      intersect(
        compatibleContinuityIds(previousSection),
        established.continuityIds,
      ).length > 0
    ) {
      add(
        previousSection.sectionId,
        currentSection.sectionId,
        1,
        "established-lineage",
      );
    }
  }

  for (const previousSection of previous.sections) {
    if (matches.has(previousSection.sectionId)) continue;
    const candidates = current.sections.filter(
      (candidate) =>
        !automaticallyUsedCurrent.has(candidate.sectionId) &&
        candidate.volumeId === previousSection.volumeId &&
        candidate.contentHash === previousSection.contentHash,
    );
    if (candidates.length === 1) {
      add(
        previousSection.sectionId,
        candidates[0]!.sectionId,
        1,
        "same-content",
      );
    }
  }

  for (const previousSection of previous.sections) {
    if (matches.has(previousSection.sectionId)) continue;
    const previousInVolume = volumeSections(previous, previousSection.volumeId);
    const currentInVolume = volumeSections(current, previousSection.volumeId);
    const previousIndex = previousInVolume.findIndex(
      (candidate) => candidate.sectionId === previousSection.sectionId,
    );
    const candidates = currentInVolume
      .filter((candidate) => !automaticallyUsedCurrent.has(candidate.sectionId))
      .map((candidate) => ({
        sectionId: candidate.sectionId,
        score: sectionSuggestionScore({
          previous: previousSection,
          current: candidate,
          previousIndex,
          currentIndex: currentInVolume.findIndex(
            (item) => item.sectionId === candidate.sectionId,
          ),
          previousCount: previousInVolume.length,
          currentCount: currentInVolume.length,
        }),
      }))
      .sort(
        (left, right) =>
          right.score - left.score || left.sectionId.localeCompare(right.sectionId),
      );
    unresolved.push({
      previousSectionId: previousSection.sectionId,
      sourceHref: previousSection.href,
      message:
        "No confirmed successor exists. Review the suggested candidates and supply an explicit section mapping.",
      candidates: candidates.slice(0, 3),
    });
  }

  return {
    lineage: [...matches.values()].sort(
      (left, right) =>
        previous.sections.findIndex(
          (section) => section.sectionId === left.previousSectionId,
        ) -
        previous.sections.findIndex(
          (section) => section.sectionId === right.previousSectionId,
        ),
    ),
    unresolved,
  };
}

function nextContinuityId(
  section: CompiledSection,
  used: Set<string>,
): string {
  const candidates = [section.sectionId, `section-${section.contentHash}`];
  for (const candidate of candidates) {
    if (!used.has(candidate)) return candidate;
  }
  let suffix = 2;
  while (used.has(`section-${section.contentHash}-${suffix}`)) suffix += 1;
  return `section-${section.contentHash}-${suffix}`;
}

function buildSectionLineageConfig(
  previous: CompiledCatalog,
  current: CompiledCatalog,
  matches: SectionLineageMatch[],
  existing: SectionLineageConfig,
  explicitContinuityMappings: Map<string, string>,
): { config: SectionLineageConfig; unresolved: LinkPreservationIssue[] } {
  const previousById = new Map(
    previous.sections.map((section) => [section.sectionId, section]),
  );
  const currentById = new Map(
    current.sections.map((section) => [section.sectionId, section]),
  );
  const existingByCurrent = new Map(
    existing.sections.map((entry) => [entry.currentSectionId, entry]),
  );
  const previousIdentities = new Set(
    previous.sections.flatMap((section) => [
      section.sectionId,
      ...compatibleContinuityIds(section),
      ...(section.legacySectionIds ?? []),
    ]),
  );
  const unresolved: LinkPreservationIssue[] = [];
  for (const [identity, currentSectionId] of explicitContinuityMappings) {
    if (!previousIdentities.has(identity)) {
      unresolved.push({
        previousSectionId: identity,
        message: `Explicit continuity mapping source '${identity}' is not a historical section or continuity identity.`,
      });
    }
    if (!currentById.has(currentSectionId)) {
      unresolved.push({
        previousSectionId: identity,
        message: `Explicit continuity mapping target '${currentSectionId}' is not in the current catalog.`,
      });
    }
  }

  const reservedContinuityIds = new Set<string>();
  for (const predecessor of previous.sections) {
    for (const id of compatibleContinuityIds(predecessor)) {
      reservedContinuityIds.add(id);
    }
  }
  for (const entry of existing.sections) {
    for (const id of entry.continuityIds) reservedContinuityIds.add(id);
  }
  const continuityIdsByCurrent = new Map<string, string[]>();
  const historicalIdsByCurrent = new Map<string, string[]>();
  const progressGroupsByCurrent = new Map<string, string[][]>();
  const continuityOwner = new Map<string, string>();
  const historicalOwner = new Map<string, string>();
  const addClaim = (
    claims: Map<string, string[]>,
    owners: Map<string, string>,
    currentSectionId: string,
    identity: string,
    label: string,
  ) => {
    if (!identity || !currentById.has(currentSectionId)) return;
    const owner = owners.get(identity);
    if (owner && owner !== currentSectionId) {
      unresolved.push({
        previousSectionId: identity,
        message: `${label} identity '${identity}' is assigned to both '${owner}' and '${currentSectionId}'.`,
      });
      return;
    }
    owners.set(identity, currentSectionId);
    const values = claims.get(currentSectionId) ?? [];
    if (!values.includes(identity)) values.push(identity);
    claims.set(currentSectionId, values);
  };
  const addProgressGroup = (currentSectionId: string, group: string[]) => {
    const normalized = [...new Set(group)].filter(
      (id) => continuityOwner.get(id) === currentSectionId,
    );
    if (normalized.length === 0) return;
    const groups = progressGroupsByCurrent.get(currentSectionId) ?? [];
    const overlapping = groups
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate }) =>
        candidate.some((identity) => normalized.includes(identity)),
      );
    if (overlapping.length > 1) {
      unresolved.push({
        previousSectionId: normalized[0],
        message:
          `Progress identities '${normalized.join(", ")}' overlap multiple merge groups in '${currentSectionId}'.`,
      });
      return;
    }
    if (overlapping.length === 1) {
      groups[overlapping[0]!.index] = [
        ...new Set([...overlapping[0]!.candidate, ...normalized]),
      ];
    } else {
      groups.push(normalized);
    }
    progressGroupsByCurrent.set(currentSectionId, groups);
  };

  for (const currentSection of current.sections) {
    const established = existingByCurrent.get(currentSection.sectionId);
    for (const id of established?.continuityIds ?? []) {
      addClaim(
        continuityIdsByCurrent,
        continuityOwner,
        currentSection.sectionId,
        id,
        "Continuity",
      );
    }
    for (const id of established?.historicalSectionIds ?? []) {
      addClaim(
        historicalIdsByCurrent,
        historicalOwner,
        currentSection.sectionId,
        id,
        "Historical section",
      );
    }
    for (const group of established?.progressContinuityGroups ?? []) {
      addProgressGroup(currentSection.sectionId, group);
    }
  }

  for (const match of matches) {
    const predecessor = previousById.get(match.previousSectionId);
    if (!predecessor) continue;
    const continuityIds = compatibleContinuityIds(predecessor);
    const historicalIds = [
      ...new Set([
        ...(predecessor.legacySectionIds ?? []),
        ...(predecessor.sectionId === match.currentSectionId
          ? []
          : [predecessor.sectionId]),
      ]),
    ];
    const requiresExplicitAllocation =
      match.reason === "explicit" && continuityIds.length > 1;
    const identitiesRequiringAllocation = [
      ...new Set([...continuityIds, ...historicalIds]),
    ];
    if (
      requiresExplicitAllocation &&
      identitiesRequiringAllocation.some(
        (identity) => !explicitContinuityMappings.has(identity),
      )
    ) {
      const missing = identitiesRequiringAllocation.filter(
        (identity) => !explicitContinuityMappings.has(identity),
      );
      unresolved.push({
        previousSectionId: predecessor.sectionId,
        sourceHref: predecessor.href,
        message:
          `Merged lineage cannot be assigned to one rewritten successor implicitly. Add --continuity-map for every prior identity. Missing: ${missing.join(", ")}.`,
      });
    }
    const ownerFor = (identity: string): string =>
      explicitContinuityMappings.get(identity) ?? match.currentSectionId;
    for (const id of continuityIds) {
      addClaim(
        continuityIdsByCurrent,
        continuityOwner,
        ownerFor(id),
        id,
        "Continuity",
      );
    }
    for (const id of historicalIds) {
      addClaim(
        historicalIdsByCurrent,
        historicalOwner,
        ownerFor(id),
        id,
        "Historical section",
      );
    }
    for (const group of predecessor.progressContinuityGroups ?? []) {
      const owners = new Set(group.map(ownerFor));
      if (owners.size !== 1) {
        unresolved.push({
          previousSectionId: predecessor.sectionId,
          sourceHref: predecessor.href,
          message:
            `Equivalent progress identities '${group.join(", ")}' cannot be split across successors.`,
        });
        continue;
      }
      addProgressGroup([...owners][0]!, group);
    }
  }

  const usedContinuityIds = new Set(continuityOwner.keys());
  const sections = current.sections.map((currentSection): SectionLineageEntry => {
    const continuityIds = [...(continuityIdsByCurrent.get(currentSection.sectionId) ?? [])];
    if (continuityIds.length === 0) {
      const id = nextContinuityId(
        currentSection,
        new Set([...usedContinuityIds, ...reservedContinuityIds]),
      );
      continuityIds.push(id);
      usedContinuityIds.add(id);
      continuityOwner.set(id, currentSection.sectionId);
    }
    const groups = [
      ...(progressGroupsByCurrent.get(currentSection.sectionId) ?? []),
    ];
    if (!groups.some((group) => group.includes(continuityIds[0]!))) {
      groups.unshift([continuityIds[0]!]);
    }
    const primaryGroupIndex = groups.findIndex((group) =>
      group.includes(continuityIds[0]!),
    );
    const primaryGroup = groups.splice(primaryGroupIndex, 1)[0] ?? [continuityIds[0]!];
    const primaryIndex = primaryGroup.indexOf(continuityIds[0]!);
    primaryGroup.splice(primaryIndex, 1);
    primaryGroup.unshift(continuityIds[0]!);
    return {
      currentSectionId: currentSection.sectionId,
      continuityIds,
      historicalSectionIds: (
        historicalIdsByCurrent.get(currentSection.sectionId) ?? []
      ).filter((id) => id !== currentSection.sectionId),
      progressContinuityGroups: [primaryGroup, ...groups],
    };
  });
  return { config: { version: 1, sections }, unresolved };
}

function catalogWithLineage(
  catalog: CompiledCatalog,
  config: SectionLineageConfig,
): CompiledCatalog {
  const byCurrent = new Map(
    config.sections.map((entry) => [entry.currentSectionId, entry]),
  );
  return {
    ...catalog,
    routeAliases: catalog.routeAliases ?? [],
    sections: catalog.sections.map((section) => {
      const entry = byCurrent.get(section.sectionId);
      return {
        ...section,
        continuityId: entry?.continuityIds[0] ?? section.sectionId,
        legacyContinuityIds: entry?.continuityIds.slice(1) ?? [],
        progressContinuityGroups: entry?.progressContinuityGroups ?? [
          [entry?.continuityIds[0] ?? section.sectionId],
        ],
        legacySectionIds: entry?.historicalSectionIds ?? [],
      };
    }),
  };
}

function canonicalHrefs(catalog: CompiledCatalog): Set<string> {
  const hrefs = new Set<string>();
  for (const volume of catalog.volumes) {
    hrefs.add(volume.href);
    for (const part of volume.parts) {
      hrefs.add(part.href);
      for (const chapter of part.chapters) hrefs.add(chapter.href);
    }
  }
  for (const section of catalog.sections) hrefs.add(section.href);
  return hrefs;
}

function normalizedRouteHref(href: string): string {
  const [rawPath, fragment] = href.split("#", 2);
  const pathHref = rawPath === "/" || rawPath?.endsWith("/")
    ? rawPath
    : `${rawPath}/`;
  return fragment ? `${pathHref}#${fragment}` : pathHref ?? href;
}

function routePath(href: string): string {
  return normalizedRouteHref(href).split("#", 1)[0] ?? href;
}

function ledgerResolutionPreservesLineage(
  entry: RouteLedger["routes"][number],
  resolution: { targetContinuityIds: string[] } | undefined,
): boolean {
  if (!resolution) return false;
  const currentIds = new Set(resolution.targetContinuityIds);
  const overlap = entry.targetContinuityIds.filter((id) => currentIds.has(id));
  const membershipMayEvolve = [
    "volume",
    "part",
    "chapter",
    "route-alias",
  ].includes(entry.kind);
  return membershipMayEvolve
    ? overlap.length > 0
    : overlap.length === entry.targetContinuityIds.length;
}

function structuralRoutes(catalog: CompiledCatalog): StructuralRoute[] {
  const routes = new Map<string, StructuralRoute>();
  const consider = (
    href: string,
    kind: StructuralRoute["kind"],
  ) => {
    const resolved = resolvePublishedRoute(catalog, href);
    if (!resolved || resolved.kind !== kind) return;
    routes.set(`${kind}:${href}`, {
      href,
      kind,
      targetContinuityIds: resolved.targetContinuityIds,
    });
  };
  for (const volume of catalog.volumes) {
    consider(volume.href, "volume");
    for (const part of volume.parts) {
      consider(part.href, "part");
      for (const chapter of part.chapters) consider(chapter.href, "chapter");
    }
  }
  return [...routes.values()];
}

function sortedSectionAliases(
  aliases: Iterable<SectionAliasInput>,
): SectionAliasInput[] {
  return [...aliases].sort(
    (left, right) =>
      left.sourceHref.localeCompare(right.sourceHref) ||
      left.targetSectionId.localeCompare(right.targetSectionId),
  );
}

function sortedRouteAliases(aliases: Iterable<RouteAliasInput>): RouteAliasInput[] {
  return [...aliases].sort(
    (left, right) =>
      left.sourceHref.localeCompare(right.sourceHref) ||
      left.targetHref.localeCompare(right.targetHref),
  );
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function diffSectionAliases(
  previous: SectionAliasInput[],
  next: SectionAliasInput[],
): {
  added: SectionAliasInput[];
  updated: SectionAliasInput[];
  removed: SectionAliasInput[];
} {
  const previousBySource = new Map(previous.map((entry) => [entry.sourceHref, entry]));
  const nextBySource = new Map(next.map((entry) => [entry.sourceHref, entry]));
  return {
    added: next.filter((entry) => !previousBySource.has(entry.sourceHref)),
    updated: next.filter((entry) => {
      const old = previousBySource.get(entry.sourceHref);
      return old && !sameJson(old, entry);
    }),
    removed: previous.filter((entry) => !nextBySource.has(entry.sourceHref)),
  };
}

function diffRouteAliases(
  previous: RouteAliasInput[],
  next: RouteAliasInput[],
): {
  added: RouteAliasInput[];
  updated: RouteAliasInput[];
  removed: RouteAliasInput[];
} {
  const previousBySource = new Map(previous.map((entry) => [entry.sourceHref, entry]));
  const nextBySource = new Map(next.map((entry) => [entry.sourceHref, entry]));
  return {
    added: next.filter((entry) => !previousBySource.has(entry.sourceHref)),
    updated: next.filter((entry) => {
      const old = previousBySource.get(entry.sourceHref);
      return old && !sameJson(old, entry);
    }),
    removed: previous.filter((entry) => !nextBySource.has(entry.sourceHref)),
  };
}

function uniqueIssues(issues: LinkPreservationIssue[]): LinkPreservationIssue[] {
  return issues.filter(
    (issue, index) =>
      issues.findIndex(
        (candidate) =>
          candidate.previousSectionId === issue.previousSectionId &&
          candidate.sourceHref === issue.sourceHref &&
          candidate.message === issue.message,
      ) === index,
  );
}

export function planLinkPreservation({
  previous,
  current,
  existingSectionAliases = { version: 1, aliases: [] },
  existingRouteAliases = { version: 1, aliases: [] },
  existingRouteLedger = { version: 2, routes: [] },
  existingSectionLineage = { version: 1, sections: [] },
  explicitMappings = new Map(),
  explicitContinuityMappings = new Map(),
  explicitRouteMappings = new Map(),
  base = "HEAD",
}: PlanOptions): LinkPreservationPlan {
  const matched = matchLineage(
    previous,
    current,
    existingSectionLineage,
    explicitMappings,
  );
  const lineageBuild = buildSectionLineageConfig(
    previous,
    current,
    matched.lineage,
    existingSectionLineage,
    explicitContinuityMappings,
  );
  const sectionLineage = lineageBuild.config;
  const proposedCurrent = catalogWithLineage(current, sectionLineage);
  const currentSections = new Map(
    proposedCurrent.sections.map((section) => [section.sectionId, section]),
  );
  const previousSections = new Map(
    previous.sections.map((section) => [section.sectionId, section]),
  );
  const successorByPrevious = new Map(
    matched.lineage.map((entry) => [entry.previousSectionId, entry.currentSectionId]),
  );
  const currentCanonical = canonicalHrefs(proposedCurrent);
  const currentGeneratedAliasSources = new Set(
    proposedCurrent.aliases.map((alias) => alias.sourceHref),
  );
  const nextSectionAliases = new Map<string, SectionAliasInput>();
  const unresolved = [...matched.unresolved, ...lineageBuild.unresolved];
  try {
    validateSectionLineageConfig(proposedCurrent, sectionLineage);
  } catch (error) {
    unresolved.push({
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const successorFor = (previousSectionId: string): string | undefined =>
    currentSections.has(previousSectionId)
      ? previousSectionId
      : successorByPrevious.get(previousSectionId);

  const addSectionAlias = (
    sourceHref: string,
    previousSectionId: string,
    note: string,
  ) => {
    const successorId = successorFor(previousSectionId);
    const previousSection = previousSections.get(previousSectionId);
    const successor = successorId ? currentSections.get(successorId) : undefined;
    if (!successor || !previousSection) {
      unresolved.push({
        previousSectionId,
        sourceHref,
        message: "A historical section route has no confirmed current successor.",
      });
      return;
    }
    const existingResolution = resolvePublishedRoute(proposedCurrent, sourceHref);
    if (existingResolution) {
      const expected = compatibleContinuityIds(previousSection);
      if (
        intersect(expected, existingResolution.targetContinuityIds).length !==
        expected.length
      ) {
        unresolved.push({
          previousSectionId,
          sourceHref,
          message:
            "This historical section route is now occupied by unrelated content. Choose a different current route before publishing.",
        });
      }
      return;
    }
    if (currentGeneratedAliasSources.has(sourceHref)) return;
    const current = nextSectionAliases.get(sourceHref);
    if (current && current.targetSectionId !== successor.sectionId) {
      unresolved.push({
        previousSectionId,
        sourceHref,
        message: `Two historical sections claim the same alias source for '${current.targetSectionId}' and '${successor.sectionId}'.`,
      });
      return;
    }
    nextSectionAliases.set(sourceHref, {
      sourceHref,
      targetSectionId: successor.sectionId,
      note,
    });
  };
  const addDirectSectionAlias = (
    sourceHref: string,
    targetSectionId: string,
    note: string,
  ) => {
    const target = currentSections.get(targetSectionId);
    if (!target) {
      unresolved.push({
        sourceHref,
        message: `Reviewed section alias target '${targetSectionId}' is not current.`,
      });
      return;
    }
    const existing = nextSectionAliases.get(sourceHref);
    if (existing && existing.targetSectionId !== targetSectionId) {
      unresolved.push({
        sourceHref,
        message: `Historical route is claimed by both '${existing.targetSectionId}' and '${targetSectionId}'.`,
      });
      return;
    }
    nextSectionAliases.set(sourceHref, { sourceHref, targetSectionId, note });
  };

  for (const alias of existingSectionAliases.aliases) {
    const successorId = successorFor(alias.targetSectionId);
    if (!successorId) {
      unresolved.push({
        previousSectionId: alias.targetSectionId,
        sourceHref: alias.sourceHref,
        message: "An existing section alias target has no confirmed successor.",
      });
      continue;
    }
    const successor = currentSections.get(successorId);
    const sourceResolution = resolvePublishedRoute(
      proposedCurrent,
      alias.sourceHref,
    );
    if (sourceResolution && successor) {
      const expected = compatibleContinuityIds(successor);
      if (
        intersect(expected, sourceResolution.targetContinuityIds).length !==
        expected.length
      ) {
        unresolved.push({
          previousSectionId: alias.targetSectionId,
          sourceHref: alias.sourceHref,
          message:
            "An existing section alias source is now occupied by unrelated lineage.",
        });
      }
      continue;
    }
    if (currentCanonical.has(alias.sourceHref)) continue;
    nextSectionAliases.set(alias.sourceHref, {
      ...alias,
      targetSectionId: successorId,
    });
  }
  for (const section of previous.sections) {
    addSectionAlias(
      section.href,
      section.sectionId,
      `Preserved from ${base} after an editorial route revision.`,
    );
  }
  for (const alias of previous.aliases) {
    addSectionAlias(
      alias.sourceHref,
      alias.targetSectionId,
      `Inherited from ${base} after an editorial route revision.`,
    );
  }

  const currentStructural = structuralRoutes(proposedCurrent);
  const currentSuccessors: RouteSuccessor[] = [
    ...currentStructural.filter(
      (route): route is StructuralRoute & { kind: "part" | "chapter" } =>
        route.kind === "part" || route.kind === "chapter",
    ),
    ...proposedCurrent.sections.flatMap((section): RouteSuccessor[] => {
      const resolved = resolvePublishedRoute(proposedCurrent, section.href);
      return resolved?.kind === "section"
        ? [
            {
              href: section.href,
              kind: "section",
              targetContinuityIds: resolved.targetContinuityIds,
            },
          ]
        : [];
    }),
  ];
  const currentSuccessorByHref = new Map(
    currentSuccessors.map((route) => [route.href, route]),
  );
  const nextRouteAliases = new Map<string, RouteAliasInput>();
  const addRouteAlias = (alias: RouteAliasInput) => {
    if (nextSectionAliases.has(alias.sourceHref)) {
      unresolved.push({
        sourceHref: alias.sourceHref,
        message: "A route cannot be both a section alias and a structural alias.",
      });
      return;
    }
    const current = nextRouteAliases.get(alias.sourceHref);
    if (current && current.targetHref !== alias.targetHref) {
      unresolved.push({
        sourceHref: alias.sourceHref,
        message: `Conflicting structural alias targets '${current.targetHref}' and '${alias.targetHref}'.`,
      });
      return;
    }
    nextRouteAliases.set(alias.sourceHref, alias);
  };

  // The compiled catalog contains both configured aliases and compatibility
  // aliases generated by the router. A generated alias is still a published
  // contract. If a later structural edit stops generating it, promote it into
  // the committed alias config instead of silently dropping the old route.
  const historicalRouteAliases = new Map<string, RouteAliasInput>();
  for (const alias of previous.routeAliases ?? []) {
    historicalRouteAliases.set(alias.sourceHref, alias);
  }
  // The working config is authoritative when it has been edited since the base
  // catalog was committed.
  for (const alias of existingRouteAliases.aliases) {
    historicalRouteAliases.set(alias.sourceHref, alias);
  }

  for (const alias of historicalRouteAliases.values()) {
    const historicalResolution =
      resolvePublishedRoute(previous, alias.sourceHref) ??
      resolvePublishedRoute(previous, alias.targetHref);
    const currentSource = resolvePublishedRoute(
      proposedCurrent,
      alias.sourceHref,
    );
    if (currentSource) {
      if (
        historicalResolution &&
        intersect(
          currentSource.targetContinuityIds,
          historicalResolution.targetContinuityIds,
        ).length === 0
      ) {
        unresolved.push({
          sourceHref: alias.sourceHref,
          message:
            "A historical structural alias source is now occupied by unrelated content.",
        });
      }
      continue;
    }

    const explicitTarget =
      explicitRouteMappings.get(alias.sourceHref) ??
      explicitRouteMappings.get(alias.targetHref);
    const targetHref = explicitTarget ?? alias.targetHref;
    const target = currentCanonical.has(targetHref)
      ? resolvePublishedRoute(proposedCurrent, targetHref)
      : undefined;
    if (!target) {
      unresolved.push({
        sourceHref: alias.sourceHref,
        message:
          "A historical structural alias target disappeared. Supply an explicit reviewed route mapping.",
      });
      continue;
    }
    if (
      historicalResolution &&
      intersect(
        target.targetContinuityIds,
        historicalResolution.targetContinuityIds,
      ).length === 0
    ) {
      unresolved.push({
        sourceHref: alias.sourceHref,
        message:
          `Reviewed route target '${targetHref}' does not preserve the historical alias lineage.`,
      });
      continue;
    }
    addRouteAlias({
      ...alias,
      targetHref,
      note:
        alias.note ?? `Inherited historical route alias from ${base}.`,
    });
  }

  for (const previousRoute of structuralRoutes(previous)) {
    const currentAtSource = resolvePublishedRoute(proposedCurrent, previousRoute.href);
    if (currentAtSource) {
      if (
        intersect(
          previousRoute.targetContinuityIds,
          currentAtSource.targetContinuityIds,
        ).length === 0
      ) {
        unresolved.push({
          sourceHref: previousRoute.href,
          message:
            "This historical structural route is now occupied by unrelated content. Change the new canonical route before publishing.",
        });
      }
      continue;
    }
    if (previousRoute.kind === "volume") {
      unresolved.push({
        sourceHref: previousRoute.href,
        message:
          "Volume route identities are fixed by this workflow. Restore the route or implement a reviewed volume redirect.",
      });
      continue;
    }
    const explicitTarget = explicitRouteMappings.get(previousRoute.href);
    if (explicitTarget) {
      const target = currentSuccessorByHref.get(explicitTarget);
      if (!target) {
        unresolved.push({
          sourceHref: previousRoute.href,
          message: `Explicit route target '${explicitTarget}' is not a current section, chapter, or part route.`,
        });
        continue;
      }
      addRouteAlias({
        sourceHref: previousRoute.href,
        targetHref: target.href,
        note: `Reviewed structural successor from ${base}.`,
      });
      continue;
    }
    const scoredCandidates = currentSuccessors
      .filter((candidate) =>
        [previousRoute.kind, "section"].includes(candidate.kind),
      )
      .map((candidate) => {
        const overlap = intersect(
          previousRoute.targetContinuityIds,
          candidate.targetContinuityIds,
        ).length;
        return {
          route: candidate,
          score:
            previousRoute.targetContinuityIds.length === 0
              ? 0
              : overlap / previousRoute.targetContinuityIds.length,
          containsAll: overlap === previousRoute.targetContinuityIds.length,
        };
      })
      .sort(
        (left, right) =>
          right.score - left.score || left.route.href.localeCompare(right.route.href),
      );
    const sameKindCandidates = scoredCandidates.filter(
      (candidate) =>
        candidate.containsAll && candidate.route.kind === previousRoute.kind,
    );
    const candidates =
      sameKindCandidates.length > 0
        ? sameKindCandidates
        : scoredCandidates.filter(
            (candidate) =>
              candidate.containsAll && candidate.route.kind === "section",
          );
    if (candidates.length === 1) {
      addRouteAlias({
        sourceHref: previousRoute.href,
        targetHref: candidates[0]!.route.href,
        note: `Preserved ${previousRoute.kind} route from ${base}.`,
      });
      continue;
    }
    unresolved.push({
      sourceHref: previousRoute.href,
      message:
        "No unique structural successor contains the historical lineage. Supply an explicit reviewed route mapping.",
      candidates: scoredCandidates
        .map((candidate) => ({
          href: candidate.route.href,
          score: candidate.score,
        }))
        .filter((candidate) => candidate.score > 0)
        .sort(
          (left, right) =>
            right.score - left.score || (left.href ?? "").localeCompare(right.href ?? ""),
        )
        .slice(0, 3),
    });
  }

  const catalogWithPlannedAliases = (): CompiledCatalog => ({
    ...proposedCurrent,
    aliases: [
      ...proposedCurrent.aliases,
      ...[...nextSectionAliases.values()].map(
        (alias): SectionAlias => ({
          ...alias,
          targetHref: currentSections.get(alias.targetSectionId)?.href ?? "",
          sourceRoute: {
            volumeId: "",
            partId: "",
            chapterId: "",
            sectionId: "",
          },
        }),
      ),
    ],
    routeAliases: [
      ...(proposedCurrent.routeAliases ?? []),
      ...nextRouteAliases.values(),
    ],
  });
  const ledgerSources = new Set<string>();
  let plannedCatalog = catalogWithPlannedAliases();
  let plannedRoutesByHref = new Map<string, RouteLedger["routes"]>();
  const refreshPlannedRoutes = () => {
    plannedRoutesByHref = new Map();
    for (const route of currentPublishedRoutes(plannedCatalog)) {
      const href = normalizedRouteHref(route.href);
      const routes = plannedRoutesByHref.get(href) ?? [];
      routes.push(route);
      plannedRoutesByHref.set(href, routes);
    }
  };
  refreshPlannedRoutes();
  for (const entry of existingRouteLedger.routes) {
    const sourceHref = normalizedRouteHref(entry.href);
    const sourcePath = routePath(sourceHref);
    ledgerSources.add(sourceHref);
    ledgerSources.add(sourcePath);
    const indexedResolutions = plannedRoutesByHref.get(sourceHref) ?? [];
    const dynamicResolution =
      indexedResolutions.length === 0 && sourceHref.includes("#")
        ? resolvePublishedRoute(plannedCatalog, sourceHref)
        : undefined;
    const currentResolutions = [
      ...indexedResolutions,
      ...(dynamicResolution ? [dynamicResolution] : []),
    ];
    if (currentResolutions.length > 0) {
      if (
        !currentResolutions.some((resolution) =>
          ledgerResolutionPreservesLineage(entry, resolution),
        )
      ) {
        unresolved.push({
          sourceHref,
          message:
            "A route-ledger path is occupied by unrelated lineage. Change the new canonical route or provide a different reviewed successor.",
        });
      }
      continue;
    }

    const explicitTarget =
      explicitRouteMappings.get(sourceHref) ??
      explicitRouteMappings.get(sourcePath);
    if (!explicitTarget) {
      unresolved.push({
        sourceHref,
        message:
          "A route recorded only in the historical ledger no longer resolves. Supply an explicit reviewed route mapping.",
      });
      continue;
    }
    const targetResolution = resolvePublishedRoute(
      proposedCurrent,
      normalizedRouteHref(explicitTarget),
    );
    if (!targetResolution) {
      unresolved.push({
        sourceHref,
        message: `Explicit route target '${explicitTarget}' is not a current published route.`,
      });
      continue;
    }
    if (!ledgerResolutionPreservesLineage(entry, targetResolution)) {
      unresolved.push({
        sourceHref,
        message:
          `Explicit route target '${explicitTarget}' does not own the historical route lineage. Use --continuity-map before assigning a split predecessor route.`,
      });
      continue;
    }
    const targetSections = proposedCurrent.sections.filter((section) =>
      intersect(
        compatibleContinuityIds(section),
        targetResolution.targetContinuityIds,
      ).length > 0,
    );
    if (
      ["section", "section-alias", "reader"].includes(entry.kind) &&
      targetSections.length === 1
    ) {
      addDirectSectionAlias(
        sourcePath,
        targetSections[0]!.sectionId,
        `Reviewed route-ledger successor from ${base}.`,
      );
    } else if (!sourceHref.includes("#")) {
      addRouteAlias({
        sourceHref: sourcePath,
        targetHref: routePath(explicitTarget),
        note: `Reviewed route-ledger successor from ${base}.`,
      });
    } else {
      unresolved.push({
        sourceHref,
        message:
          "A historical reader fragment cannot be repaired with a structural redirect. Map its prior section identity to the intended successor.",
      });
      continue;
    }
    plannedCatalog = catalogWithPlannedAliases();
    refreshPlannedRoutes();
    const plannedResolutions = plannedRoutesByHref.get(sourceHref) ?? [];
    const plannedDynamicResolution =
      plannedResolutions.length === 0 && sourceHref.includes("#")
        ? resolvePublishedRoute(plannedCatalog, sourceHref)
        : undefined;
    if (
      ![
        ...plannedResolutions,
        ...(plannedDynamicResolution ? [plannedDynamicResolution] : []),
      ].some((resolution) =>
        ledgerResolutionPreservesLineage(entry, resolution),
      )
    ) {
      unresolved.push({
        sourceHref,
        message:
          "The reviewed route-ledger mapping does not reproduce the historical route and fragment semantics.",
      });
    }
  }

  for (const [sourceHref, targetHref] of explicitRouteMappings) {
    if (
      structuralRoutes(previous).some((route) => route.href === sourceHref) ||
      historicalRouteAliases.has(sourceHref) ||
      ledgerSources.has(normalizedRouteHref(sourceHref)) ||
      ledgerSources.has(routePath(sourceHref))
    ) {
      continue;
    }
    unresolved.push({
      sourceHref,
      message: `Explicit route mapping source '${sourceHref}' is not a historical structural route.`,
    });
    if (!currentSuccessorByHref.has(targetHref)) {
      unresolved.push({
        sourceHref,
        message: `Explicit route mapping target '${targetHref}' is not current.`,
      });
    }
  }

  const sectionAliases = {
    version: 1,
    aliases: sortedSectionAliases(nextSectionAliases.values()),
  };
  const routeAliases = {
    version: 1,
    aliases: sortedRouteAliases(nextRouteAliases.values()),
  };
  const sectionDiff = diffSectionAliases(
    sortedSectionAliases(existingSectionAliases.aliases),
    sectionAliases.aliases,
  );
  const routeDiff = diffRouteAliases(
    sortedRouteAliases(existingRouteAliases.aliases),
    routeAliases.aliases,
  );
  const normalizedExistingLineage = {
    version: 1,
    sections: existingSectionLineage.sections,
  };
  return {
    base,
    lineage: matched.lineage,
    sectionLineage,
    sectionAliases,
    routeAliases,
    addedSectionAliases: sectionDiff.added,
    updatedSectionAliases: sectionDiff.updated,
    removedSectionAliases: sectionDiff.removed,
    addedRouteAliases: routeDiff.added,
    updatedRouteAliases: routeDiff.updated,
    removedRouteAliases: routeDiff.removed,
    unresolved: uniqueIssues(unresolved),
    changed:
      !sameJson(normalizedExistingLineage, sectionLineage) ||
      !sameJson(
        sortedSectionAliases(existingSectionAliases.aliases),
        sectionAliases.aliases,
      ) ||
      !sameJson(
        sortedRouteAliases(existingRouteAliases.aliases),
        routeAliases.aliases,
      ),
  };
}

export function loadCatalogAtGitRef(ref: string): CompiledCatalog {
  const relativeCatalogPath = path.relative(repoRoot, catalogPath);
  const source = execFileSync("git", ["show", `${ref}:${relativeCatalogPath}`], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const catalog = JSON.parse(source) as CompiledCatalog;
  catalog.routeAliases ??= [];
  catalog.sections = catalog.sections.map((section) => ({
    ...section,
    continuityId: section.continuityId ?? section.sectionId,
    legacyContinuityIds: section.legacyContinuityIds ?? [],
    progressContinuityGroups: section.progressContinuityGroups ?? [
      [section.continuityId ?? section.sectionId],
      ...(section.legacyContinuityIds ?? []).map((id) => [id]),
    ],
    legacySectionIds: section.legacySectionIds ?? [],
  }));
  return catalog;
}

function parseMapping(value: string, label: string): [string, string] {
  const separator = value.indexOf("=");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`${label} must use old=new.`);
  }
  return [value.slice(0, separator), value.slice(separator + 1)];
}

export function parseLinkArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    base: "HEAD",
    write: false,
    format: "text",
    mappings: new Map(),
    continuityMappings: new Map(),
    routeMappings: new Map(),
    help: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    const value = args[index + 1];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--write") options.write = true;
    else if (arg === "--base") {
      if (!value || value.startsWith("--")) throw new Error("--base requires a value.");
      options.base = value;
      index += 1;
    } else if (arg === "--format") {
      if (value !== "text" && value !== "json") {
        throw new Error("--format must be 'text' or 'json'.");
      }
      options.format = value;
      index += 1;
    } else if (arg === "--map") {
      if (!value || value.startsWith("--")) throw new Error("--map requires a value.");
      const [previousSectionId, currentSectionId] = parseMapping(value, "--map");
      options.mappings.set(previousSectionId, currentSectionId);
      index += 1;
    } else if (arg === "--route-map") {
      if (!value || value.startsWith("--")) {
        throw new Error("--route-map requires a value.");
      }
      const [sourceHref, targetHref] = parseMapping(value, "--route-map");
      options.routeMappings.set(sourceHref, targetHref);
      index += 1;
    } else if (arg === "--continuity-map") {
      if (!value || value.startsWith("--")) {
        throw new Error("--continuity-map requires a value.");
      }
      const [identity, currentSectionId] = parseMapping(
        value,
        "--continuity-map",
      );
      options.continuityMappings.set(identity, currentSectionId);
      index += 1;
    } else {
      throw new Error(`Unknown link preservation option '${arg}'.`);
    }
  }
  return options;
}

function formatAliasChanges(
  lines: string[],
  label: string,
  aliases: Array<SectionAliasInput | RouteAliasInput>,
): void {
  if (aliases.length === 0) return;
  lines.push("", `${label}:`);
  for (const alias of aliases) {
    const target =
      "targetSectionId" in alias ? alias.targetSectionId : alias.targetHref;
    lines.push(`  ${alias.sourceHref} -> ${target}`);
  }
}

export function formatLinkPlan(plan: LinkPreservationPlan): string {
  const lines = [
    `Link preservation plan against ${plan.base}`,
    `${plan.lineage.length.toLocaleString()} confirmed section lineage match(es)`,
    `${plan.addedSectionAliases.length.toLocaleString()} section alias(es) to add`,
    `${plan.updatedSectionAliases.length.toLocaleString()} section alias(es) to update`,
    `${plan.removedSectionAliases.length.toLocaleString()} section alias(es) to remove`,
    `${plan.addedRouteAliases.length.toLocaleString()} structural alias(es) to add`,
    `${plan.updatedRouteAliases.length.toLocaleString()} structural alias(es) to update`,
    `${plan.removedRouteAliases.length.toLocaleString()} structural alias(es) to remove`,
    `${plan.unresolved.length.toLocaleString()} unresolved item(s)`,
  ];
  formatAliasChanges(lines, "Section aliases to add", plan.addedSectionAliases);
  formatAliasChanges(lines, "Section aliases to update", plan.updatedSectionAliases);
  formatAliasChanges(lines, "Section aliases to remove", plan.removedSectionAliases);
  formatAliasChanges(lines, "Structural aliases to add", plan.addedRouteAliases);
  formatAliasChanges(lines, "Structural aliases to update", plan.updatedRouteAliases);
  formatAliasChanges(lines, "Structural aliases to remove", plan.removedRouteAliases);
  if (plan.unresolved.length > 0) {
    lines.push("", "Unresolved:");
    for (const issue of plan.unresolved) {
      const location = issue.sourceHref ?? issue.previousSectionId ?? "unknown";
      lines.push(`  ${location}: ${issue.message}`);
      for (const candidate of issue.candidates ?? []) {
        lines.push(
          `    ${candidate.sectionId ?? candidate.href ?? "unknown"}: ${candidate.score.toFixed(3)}`,
        );
      }
    }
  }
  return lines.join("\n");
}

export function linkHelp(): string {
  return [
    "Preserve manuscript access while allowing public headings, IDs, and routes to evolve.",
    "",
    "Usage:",
    "  npm run manuscripts:preserve-links",
    "  npm run manuscripts:preserve-links -- --write",
    "  npm run manuscripts:preserve-links -- --map old-id=new-id --write",
    "  npm run manuscripts:preserve-links -- --continuity-map old-identity=new-id --write",
    "  npm run manuscripts:preserve-links -- --route-map /old/=/new/ --write",
    "",
    "Options:",
    "  --base <git-ref>        Catalog baseline. Default: HEAD.",
    "  --map <old=new>         Confirm a section successor. Repeatable.",
    "  --continuity-map <old=new>  Assign one prior continuity or section identity. Repeatable.",
    "  --route-map <old=new>   Confirm a part or chapter successor. Repeatable.",
    "  --write                 Update lineage and alias source files after all checks pass.",
    "  --format text|json      Select output format.",
    "  --help                  Show this help.",
  ].join("\n");
}

export function runLinkCli(args = process.argv.slice(2)): number {
  try {
    const options = parseLinkArgs(args);
    if (options.help) {
      console.log(linkHelp());
      return 0;
    }
    const previous = loadCatalogAtGitRef(options.base);
    const existingLineage = readSectionLineage();
    const current = buildCatalog(manuscriptRoot, {
      aliasConfig: { version: 1, aliases: [] },
      routeAliasConfig: { version: 1, aliases: [] },
      sectionLineage: existingLineage,
    });
    const plan = planLinkPreservation({
      previous,
      current,
      existingSectionAliases: readAliasConfig(),
      existingRouteAliases: readRouteAliasConfig(),
      existingRouteLedger: readRouteLedger(),
      existingSectionLineage: existingLineage,
      explicitMappings: options.mappings,
      explicitContinuityMappings: options.continuityMappings,
      explicitRouteMappings: options.routeMappings,
      base: options.base,
    });
    console.log(
      options.format === "json" ? JSON.stringify(plan, null, 2) : formatLinkPlan(plan),
    );
    if (plan.unresolved.length > 0) return 1;
    if (options.write && plan.changed) {
      writeJson(sectionLineagePath, plan.sectionLineage);
      writeJson(aliasConfigPath, plan.sectionAliases);
      writeJson(routeAliasConfigPath, plan.routeAliases);
      console.log(`Updated ${path.relative(repoRoot, sectionLineagePath)}`);
      console.log(`Updated ${path.relative(repoRoot, aliasConfigPath)}`);
      console.log(`Updated ${path.relative(repoRoot, routeAliasConfigPath)}`);
      return 0;
    }
    return plan.changed ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = runLinkCli();
}
