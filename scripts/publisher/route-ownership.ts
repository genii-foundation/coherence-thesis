import {
  inspectCanonicalRoutePath,
  inspectCanonicalUrlFragment,
} from "@genii-foundation/publisher-schema/routes";

export const PUBLISHER_FIXED_RENDERER_RESOURCES = Object.freeze([
  Object.freeze({ method: "GET", path: "/publication-reader-offline.json" }),
  Object.freeze({ method: "GET", path: "/offline-sw.js" }),
  Object.freeze({ method: "GET", path: "/publication-reader-search.json" }),
  Object.freeze({ method: "GET", path: "/publication-reader-progress.json" }),
  Object.freeze({ method: "GET", path: "/publication-audio.json" }),
  Object.freeze({ method: "GET", path: "/publication-sync.json" }),
] as const);

export const PUBLISHER_FIXED_SYNC_METHOD_PATHS = Object.freeze([
  Object.freeze({ method: "POST", path: "/api/auth/start" }),
  Object.freeze({ method: "POST", path: "/api/auth/verify" }),
  Object.freeze({ method: "DELETE", path: "/api/account" }),
  Object.freeze({ method: "GET", path: "/api/session" }),
  Object.freeze({ method: "DELETE", path: "/api/session" }),
  Object.freeze({ method: "GET", path: "/api/sync" }),
  Object.freeze({ method: "POST", path: "/api/sync" }),
  Object.freeze({ method: "GET", path: "/auth/callback" }),
] as const);

export const DEFAULT_RETAINED_COHERENCE_EXACT_PATHS = Object.freeze([
  "/admin",
  "/favicon.ico",
  "/icon.svg",
  "/overview",
  "/overview/",
  "/progress",
  "/progress/",
  "/progress-icon-lab",
  "/progress-icon-lab/",
  "/robots.txt",
  "/sitemap.xml",
] as const);

export const DEFAULT_CURRENT_COHERENCE_EXACT_PATHS = Object.freeze([
  "/admin",
  "/api/account",
  "/auth/callback",
  "/favicon.ico",
  "/icon.svg",
  "/offline-sw.js",
  "/overview",
  "/overview/",
  "/progress",
  "/progress/",
  "/progress-icon-lab",
  "/progress-icon-lab/",
  "/robots.txt",
  "/sitemap.xml",
] as const);

export const DEFAULT_RETAINED_COHERENCE_PREFIXES = Object.freeze([
  "/_next/",
  "/admin/",
  "/art/",
  "/data/",
  "/downloads/",
  "/share/",
] as const);

const activeRouteKinds = new Set([
  "collection",
  "home",
  "section",
  "section-index",
  "updates",
  "work",
]);

type ReaderAddress = {
  readonly path: string;
  readonly anchor?: string;
};

export type PublisherReaderRouteEnvelope = {
  readonly routes: {
    readonly active: readonly {
      readonly path: string;
      readonly target: { readonly kind: string };
    }[];
    readonly redirects: readonly {
      readonly from: string;
      readonly to: string;
      readonly status: 301 | 302 | 307 | 308;
    }[];
  };
  readonly works: readonly {
    readonly sections: readonly {
      readonly readerAddress: ReaderAddress | null;
      readonly domId: string | null;
      readonly blocks: readonly {
        readonly readerAddress: ReaderAddress | null;
        readonly domId: string | null;
      }[];
    }[];
  }[];
};

export type CoherenceCatalogRouteInput = {
  readonly volumes: readonly {
    readonly href: string;
    readonly parts: readonly {
      readonly href: string;
      readonly chapters: readonly { readonly href: string }[];
    }[];
  }[];
  readonly sections: readonly {
    readonly sectionId: string;
    readonly href: string;
    readonly readerHref: string;
    readonly legacySectionIds: readonly string[];
    readonly paragraphs?: readonly { readonly anchor: string }[];
  }[];
};

export type CoherenceRouteLedgerInput = {
  readonly routes: readonly {
    readonly href: string;
    readonly kind: string;
    readonly targetContinuityIds: readonly string[];
  }[];
};

export type CoherenceRouteAliasesInput = {
  readonly aliases: readonly {
    readonly sourceHref: string;
    readonly targetHref: string;
  }[];
};

export type CoherenceSectionAliasesInput = {
  readonly aliases: readonly {
    readonly sourceHref: string;
    readonly targetSectionId: string;
    readonly targetHref?: string;
  }[];
};

export type PublisherFragmentTranslation = {
  readonly fromHref: string;
  readonly toHref: string;
};

export type PublisherRouteOwnershipInput = {
  readonly reader: PublisherReaderRouteEnvelope;
  readonly catalog: CoherenceCatalogRouteInput;
  readonly routeLedger: CoherenceRouteLedgerInput;
  readonly routeAliases: CoherenceRouteAliasesInput;
  readonly sectionAliases: CoherenceSectionAliasesInput;
  readonly fragmentTranslations?: readonly PublisherFragmentTranslation[];
  readonly extensionArtifact?: unknown;
  readonly syncArtifact?: unknown;
  readonly currentCoherenceExactPaths?: readonly string[];
  readonly retainedCoherenceExactPaths?: readonly string[];
  readonly retainedCoherencePrefixes?: readonly string[];
};

export type PublisherRouteOwnershipIssueCode =
  | "active-path-duplicate"
  | "aggregate-chapter-unowned"
  | "aggregate-part-unowned"
  | "collision"
  | "decoded-route-collision"
  | "durable-query"
  | "fragment-gap"
  | "fragment-translation-invalid"
  | "path-invalid"
  | "reader-fragment-address-invalid"
  | "redirect-slash-companion-missing"
  | "redirect-source-duplicate"
  | "route-alias-unowned"
  | "section-alias-target-mismatch"
  | "section-alias-unowned"
  | "unclassified-durable-path"
  | "unexpected-extension-artifact"
  | "unexpected-sync-artifact"
  | "unsupported-active-kind";

export type PublisherRouteOwnershipIssue = {
  readonly code: PublisherRouteOwnershipIssueCode;
  readonly message: string;
  readonly path: string;
};

export type PublisherMethodPath = {
  readonly method: string;
  readonly path: string;
};

export type PublisherActiveRouteOwnership = {
  readonly kind: string;
  readonly path: string;
};

export type PublisherExplicitRedirectOwnership = {
  readonly from: string;
  readonly status: 301 | 302 | 307 | 308;
  readonly to: string;
};

export type PublisherDerivedSlashRedirectOwnership = {
  readonly from: string;
  readonly status: 308;
  readonly to: string;
};

export type PublisherExactPathCollision = {
  readonly owners: readonly string[];
  readonly path: string;
};

export type PublisherDecodedRouteCollision = {
  readonly decodedSegments: readonly string[];
  readonly paths: readonly string[];
};

export type PublisherFragmentGap = {
  readonly fragment: string;
  readonly href: string;
  readonly pathname: string;
  readonly sources: readonly string[];
};

export type PublisherRouteOwnershipCounts = {
  readonly routeLedgerEntryCount: number;
  readonly durableHrefCount: number;
  readonly durablePathnameCount: number;
  readonly durableQueryHrefCount: number;
  readonly durableFragmentEntryCount: number;
  readonly durableFragmentHrefCount: number;
  readonly publisherActiveRouteCount: number;
  readonly publisherActivePathCount: number;
  readonly publisherActiveWorkPathCount: number;
  readonly publisherActiveSectionPathCount: number;
  readonly publisherActiveOtherPathCount: number;
  readonly publisherExplicitRedirectCount: number;
  readonly publisherDerivedSlashRedirectCount: number;
  readonly publisherRendererResourceCount: number;
  readonly publisherSyncMethodPathCount: number;
  readonly publisherSyncPathCount: number;
  readonly currentCoherenceExactPathCount: number;
  readonly retainedCoherenceExactPathCount: number;
  readonly retainedCoherencePrefixCount: number;
  readonly catalogPartPathCount: number;
  readonly catalogChapterPathCount: number;
  readonly unownedPartPathCount: number;
  readonly unownedChapterPathCount: number;
  readonly exactPathCollisionCount: number;
  readonly decodedRouteCollisionCount: number;
  readonly pathCollisionCount: number;
  readonly unclassifiedDurablePathnameCount: number;
  readonly readerFragmentAddressCount: number;
  readonly requiredFragmentHrefCount: number;
  readonly fragmentTranslationCount: number;
  readonly fragmentGapCount: number;
  readonly issueCount: number;
};

export type PublisherRouteOwnershipReport = {
  readonly counts: PublisherRouteOwnershipCounts;
  readonly publisher: {
    readonly activeRoutes: readonly PublisherActiveRouteOwnership[];
    readonly workPaths: readonly string[];
    readonly sectionPaths: readonly string[];
    readonly otherActivePaths: readonly string[];
    readonly explicitRedirects: readonly PublisherExplicitRedirectOwnership[];
    readonly derivedSlashRedirects: readonly PublisherDerivedSlashRedirectOwnership[];
    readonly fixedRendererResources: readonly PublisherMethodPath[];
    readonly fixedSyncMethodPaths: readonly PublisherMethodPath[];
  };
  readonly coherence: {
    readonly currentExactPaths: readonly string[];
    readonly retainedExactPaths: readonly string[];
    readonly retainedPrefixes: readonly string[];
  };
  readonly aggregate: {
    readonly partPaths: readonly string[];
    readonly chapterPaths: readonly string[];
    readonly unownedPartPaths: readonly string[];
    readonly unownedChapterPaths: readonly string[];
  };
  readonly durable: {
    readonly hrefs: readonly string[];
    readonly pathnames: readonly string[];
    readonly unclassifiedPathnames: readonly string[];
  };
  readonly fragments: {
    readonly readerAddresses: readonly string[];
    readonly requiredHrefs: readonly string[];
    readonly translations: readonly PublisherFragmentTranslation[];
    readonly gaps: readonly PublisherFragmentGap[];
  };
  readonly exactPathCollisions: readonly PublisherExactPathCollision[];
  readonly decodedRouteCollisions: readonly PublisherDecodedRouteCollision[];
  readonly issues: readonly PublisherRouteOwnershipIssue[];
};

type ParsedHref = {
  readonly fragment?: string;
  readonly href: string;
  readonly pathname: string;
  readonly query?: string;
};

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareText);
}

function addIssue(
  issues: PublisherRouteOwnershipIssue[],
  code: PublisherRouteOwnershipIssueCode,
  path: string,
  message: string,
): void {
  issues.push({ code, message, path });
}

function displayValue(value: string): string {
  return JSON.stringify(value);
}

function inspectPath(
  value: string,
  label: string,
  issues: PublisherRouteOwnershipIssue[],
): boolean {
  const inspection = inspectCanonicalRoutePath(value);
  if (inspection.valid) return true;
  addIssue(
    issues,
    "path-invalid",
    label,
    `${displayValue(value)} is not a canonical route path: ${inspection.issue}.`,
  );
  return false;
}

function parseHref(
  href: string,
  label: string,
  issues: PublisherRouteOwnershipIssue[],
): ParsedHref | undefined {
  const fragmentIndex = href.indexOf("#");
  const beforeFragment = fragmentIndex < 0 ? href : href.slice(0, fragmentIndex);
  const fragment = fragmentIndex < 0 ? undefined : href.slice(fragmentIndex + 1);
  const queryIndex = beforeFragment.indexOf("?");
  const pathname = queryIndex < 0
    ? beforeFragment
    : beforeFragment.slice(0, queryIndex);
  const query = queryIndex < 0 ? undefined : beforeFragment.slice(queryIndex + 1);

  if (!inspectPath(pathname, label, issues)) return undefined;
  if (fragment !== undefined) {
    const inspection = inspectCanonicalUrlFragment(fragment);
    if (!inspection.valid) {
      addIssue(
        issues,
        "path-invalid",
        label,
        `${displayValue(href)} has an invalid URL fragment: ${inspection.issue}.`,
      );
      return undefined;
    }
  }
  return {
    href,
    pathname,
    ...(query === undefined ? {} : { query }),
    ...(fragment === undefined ? {} : { fragment }),
  };
}

function parsePathOnly(
  path: string,
  label: string,
  issues: PublisherRouteOwnershipIssue[],
): string | undefined {
  if (path.includes("?") || path.includes("#")) {
    addIssue(
      issues,
      "path-invalid",
      label,
      `${displayValue(path)} must contain only a pathname.`,
    );
    return undefined;
  }
  return inspectPath(path, label, issues) ? path : undefined;
}

function decodedFragment(fragment: string): string | undefined {
  const inspection = inspectCanonicalUrlFragment(fragment);
  return inspection.valid ? inspection.decoded : undefined;
}

function fragmentKey(pathname: string, fragment: string): string | undefined {
  const decoded = decodedFragment(fragment);
  return decoded === undefined ? undefined : `${pathname}#${decoded}`;
}

function sortedIssues(
  issues: PublisherRouteOwnershipIssue[],
): PublisherRouteOwnershipIssue[] {
  const unique = new Map<string, PublisherRouteOwnershipIssue>();
  for (const issue of issues) {
    unique.set(`${issue.path}\u0000${issue.code}\u0000${issue.message}`, issue);
  }
  return [...unique.values()].sort((left, right) =>
    compareText(
      `${left.path}\u0000${left.code}\u0000${left.message}`,
      `${right.path}\u0000${right.code}\u0000${right.message}`,
    ),
  );
}

function oppositeSlashPath(path: string): string {
  return path.endsWith("/") ? path.slice(0, -1) : `${path}/`;
}

function matchesPrefix(path: string, prefix: string): boolean {
  return path.startsWith(prefix);
}

function methodPathComparator(
  left: PublisherMethodPath,
  right: PublisherMethodPath,
): number {
  return compareText(`${left.path}\u0000${left.method}`, `${right.path}\u0000${right.method}`);
}

function redirectComparator(
  left: PublisherExplicitRedirectOwnership,
  right: PublisherExplicitRedirectOwnership,
): number {
  return compareText(
    `${left.from}\u0000${left.to}\u0000${left.status}`,
    `${right.from}\u0000${right.to}\u0000${right.status}`,
  );
}

function translatedFragmentComparator(
  left: PublisherFragmentTranslation,
  right: PublisherFragmentTranslation,
): number {
  return compareText(
    `${left.fromHref}\u0000${left.toHref}`,
    `${right.fromHref}\u0000${right.toHref}`,
  );
}

export function buildPublisherRouteOwnershipReport(
  input: PublisherRouteOwnershipInput,
): PublisherRouteOwnershipReport {
  const issues: PublisherRouteOwnershipIssue[] = [];
  const currentExactPaths = uniqueSorted(
    input.currentCoherenceExactPaths ?? DEFAULT_CURRENT_COHERENCE_EXACT_PATHS,
  );
  const retainedExactPaths = uniqueSorted(
    input.retainedCoherenceExactPaths ?? DEFAULT_RETAINED_COHERENCE_EXACT_PATHS,
  );
  const retainedPrefixes = uniqueSorted(
    input.retainedCoherencePrefixes ?? DEFAULT_RETAINED_COHERENCE_PREFIXES,
  );

  currentExactPaths.forEach((path, index) => {
    parsePathOnly(path, `currentCoherenceExactPaths[${index}]`, issues);
  });
  retainedExactPaths.forEach((path, index) => {
    parsePathOnly(path, `retainedCoherenceExactPaths[${index}]`, issues);
  });
  retainedPrefixes.forEach((prefix, index) => {
    const label = `retainedCoherencePrefixes[${index}]`;
    if (parsePathOnly(prefix, label, issues) !== undefined && !prefix.endsWith("/")) {
      addIssue(
        issues,
        "path-invalid",
        label,
        `${displayValue(prefix)} must end with a slash to define a prefix.`,
      );
    }
  });

  const activeRoutes = input.reader.routes.active.map(({ path, target }) => ({
    kind: target.kind,
    path,
  }));
  const activePathCounts = new Map<string, number>();
  const validActiveRoutes: PublisherActiveRouteOwnership[] = [];
  const workPaths: string[] = [];
  const sectionPaths: string[] = [];
  const otherActivePaths: string[] = [];

  activeRoutes.forEach((route, index) => {
    const label = `reader.routes.active[${index}].path`;
    if (!activeRouteKinds.has(route.kind)) {
      addIssue(
        issues,
        "unsupported-active-kind",
        label,
        `Active route ${displayValue(route.path)} has unsupported target kind ${displayValue(route.kind)}.`,
      );
    }
    const count = (activePathCounts.get(route.path) ?? 0) + 1;
    activePathCounts.set(route.path, count);
    if (count > 1) {
      addIssue(
        issues,
        "active-path-duplicate",
        route.path,
        `Active route path ${displayValue(route.path)} appears more than once.`,
      );
    }
    if (parsePathOnly(route.path, label, issues) === undefined) return;
    validActiveRoutes.push(route);
    if (route.kind === "work") workPaths.push(route.path);
    else if (route.kind === "section") sectionPaths.push(route.path);
    else otherActivePaths.push(route.path);
  });

  const explicitRedirects = input.reader.routes.redirects.map((redirect) => ({
    from: redirect.from,
    status: redirect.status,
    to: redirect.to,
  }));
  const redirectBySource = new Map<string, PublisherExplicitRedirectOwnership>();
  explicitRedirects.forEach((redirect, index) => {
    const from = parsePathOnly(
      redirect.from,
      `reader.routes.redirects[${index}].from`,
      issues,
    );
    parsePathOnly(
      redirect.to,
      `reader.routes.redirects[${index}].to`,
      issues,
    );
    if (from === undefined) return;
    if (redirectBySource.has(from)) {
      addIssue(
        issues,
        "redirect-source-duplicate",
        from,
        `Redirect source ${displayValue(from)} appears more than once.`,
      );
      return;
    }
    redirectBySource.set(from, redirect);
  });

  for (const redirect of redirectBySource.values()) {
    if (redirect.from === "/" || !redirect.from.endsWith("/")) continue;
    const companionPath = redirect.from.slice(0, -1);
    const companion = redirectBySource.get(companionPath);
    if (
      companion === undefined ||
      companion.status !== 308 ||
      companion.to !== redirect.from
    ) {
      addIssue(
        issues,
        "redirect-slash-companion-missing",
        redirect.from,
        `Slash-ended redirect source ${displayValue(redirect.from)} requires an explicit 308 companion from ${displayValue(companionPath)} to ${displayValue(redirect.from)}.`,
      );
    }
  }

  const derivedSlashRedirects: PublisherDerivedSlashRedirectOwnership[] = [];
  for (const route of validActiveRoutes) {
    if (route.path === "/") continue;
    const from = oppositeSlashPath(route.path);
    if (redirectBySource.has(from)) continue;
    derivedSlashRedirects.push({ from, status: 308, to: route.path });
  }
  derivedSlashRedirects.sort((left, right) =>
    compareText(`${left.from}\u0000${left.to}`, `${right.from}\u0000${right.to}`),
  );

  const decodedRoutes = new Map<string, Map<string, string[]>>();
  for (const route of validActiveRoutes) {
    const decodedSegments = decodeURIComponent(route.path).split("/").filter(Boolean);
    const key = JSON.stringify(decodedSegments);
    const byPath = decodedRoutes.get(key) ?? new Map<string, string[]>();
    const kinds = byPath.get(route.path) ?? [];
    kinds.push(route.kind);
    byPath.set(route.path, kinds);
    decodedRoutes.set(key, byPath);
  }
  const decodedRouteCollisions: PublisherDecodedRouteCollision[] = [];
  for (const [key, byPath] of decodedRoutes) {
    const paths = uniqueSorted(byPath.keys());
    if (paths.length < 2) continue;
    const decodedSegments = JSON.parse(key) as string[];
    decodedRouteCollisions.push({ decodedSegments, paths });
    addIssue(
      issues,
      "decoded-route-collision",
      paths.join(", "),
      `Active routes ${paths.map(displayValue).join(", ")} collapse to decoded Next.js segments ${displayValue(key)}.`,
    );
  }
  decodedRouteCollisions.sort((left, right) =>
    compareText(JSON.stringify(left.decodedSegments), JSON.stringify(right.decodedSegments)),
  );

  const fixedRendererResources = [...PUBLISHER_FIXED_RENDERER_RESOURCES]
    .map((entry) => ({ ...entry }))
    .sort(methodPathComparator);
  const fixedSyncMethodPaths = [...PUBLISHER_FIXED_SYNC_METHOD_PATHS]
    .map((entry) => ({ ...entry }))
    .sort(methodPathComparator);
  const fixedSyncPaths = uniqueSorted(fixedSyncMethodPaths.map(({ path }) => path));

  if (input.extensionArtifact !== undefined) {
    addIssue(
      issues,
      "unexpected-extension-artifact",
      "extensionArtifact",
      "The migration candidate must not include a Publisher extension artifact.",
    );
  }
  if (input.syncArtifact !== undefined) {
    addIssue(
      issues,
      "unexpected-sync-artifact",
      "syncArtifact",
      "The migration candidate must not include a Publisher sync artifact.",
    );
  }

  input.routeAliases.aliases.forEach((alias, index) => {
    const source = parsePathOnly(
      alias.sourceHref,
      `routeAliases.aliases[${index}].sourceHref`,
      issues,
    );
    const target = parsePathOnly(
      alias.targetHref,
      `routeAliases.aliases[${index}].targetHref`,
      issues,
    );
    if (source === undefined || target === undefined) return;
    const redirect = redirectBySource.get(source);
    if (redirect === undefined || redirect.to !== target) {
      addIssue(
        issues,
        "route-alias-unowned",
        source,
        `Route alias ${displayValue(source)} requires an explicit Publisher redirect to ${displayValue(target)}.`,
      );
    }
  });

  const sectionById = new Map(
    input.catalog.sections.map((section) => [section.sectionId, section] as const),
  );
  const activeSectionPathSet = new Set(
    validActiveRoutes
      .filter(({ kind }) => kind === "section")
      .map(({ path }) => path),
  );
  input.sectionAliases.aliases.forEach((alias, index) => {
    const source = parsePathOnly(
      alias.sourceHref,
      `sectionAliases.aliases[${index}].sourceHref`,
      issues,
    );
    const section = sectionById.get(alias.targetSectionId);
    if (section === undefined) {
      addIssue(
        issues,
        "section-alias-unowned",
        alias.sourceHref,
        `Section alias targets missing catalog section ${displayValue(alias.targetSectionId)}.`,
      );
      return;
    }
    const sectionTarget = parsePathOnly(
      section.href,
      `catalog.sections[${displayValue(section.sectionId)}].href`,
      issues,
    );
    const declaredTarget = alias.targetHref === undefined
      ? sectionTarget
      : parsePathOnly(
          alias.targetHref,
          `sectionAliases.aliases[${index}].targetHref`,
          issues,
        );
    if (
      sectionTarget !== undefined &&
      declaredTarget !== undefined &&
      declaredTarget !== sectionTarget
    ) {
      addIssue(
        issues,
        "section-alias-target-mismatch",
        alias.sourceHref,
        `Section alias target ${displayValue(declaredTarget)} differs from catalog section href ${displayValue(sectionTarget)}.`,
      );
      return;
    }
    if (source === undefined || sectionTarget === undefined) return;
    if (!activeSectionPathSet.has(sectionTarget)) {
      addIssue(
        issues,
        "section-alias-unowned",
        source,
        `Section alias target ${displayValue(sectionTarget)} is not an active Publisher section route.`,
      );
      return;
    }
    const redirect = redirectBySource.get(source);
    if (redirect === undefined || redirect.to !== sectionTarget) {
      addIssue(
        issues,
        "section-alias-unowned",
        source,
        `Section alias ${displayValue(source)} requires an explicit Publisher redirect to ${displayValue(sectionTarget)}.`,
      );
    }
  });

  const publisherCanonicalOwners = new Set<string>([
    ...validActiveRoutes.map(({ path }) => path),
    ...redirectBySource.keys(),
  ]);
  const partPaths: string[] = [];
  const chapterPaths: string[] = [];
  input.catalog.volumes.forEach((volume, volumeIndex) => {
    volume.parts.forEach((part, partIndex) => {
      const partPath = parsePathOnly(
        part.href,
        `catalog.volumes[${volumeIndex}].parts[${partIndex}].href`,
        issues,
      );
      if (partPath !== undefined) partPaths.push(partPath);
      part.chapters.forEach((chapter, chapterIndex) => {
        const chapterPath = parsePathOnly(
          chapter.href,
          `catalog.volumes[${volumeIndex}].parts[${partIndex}].chapters[${chapterIndex}].href`,
          issues,
        );
        if (chapterPath !== undefined) chapterPaths.push(chapterPath);
      });
    });
  });
  const uniquePartPaths = uniqueSorted(partPaths);
  const uniqueChapterPaths = uniqueSorted(chapterPaths);
  const unownedPartPaths = uniquePartPaths.filter(
    (path) => !publisherCanonicalOwners.has(path),
  );
  const unownedChapterPaths = uniqueChapterPaths.filter(
    (path) => !publisherCanonicalOwners.has(path),
  );
  unownedPartPaths.forEach((path) => {
    addIssue(
      issues,
      "aggregate-part-unowned",
      path,
      `Catalog part path ${displayValue(path)} is neither a Publisher active route nor an explicit redirect source.`,
    );
  });
  unownedChapterPaths.forEach((path) => {
    addIssue(
      issues,
      "aggregate-chapter-unowned",
      path,
      `Catalog chapter path ${displayValue(path)} is neither a Publisher active route nor an explicit redirect source.`,
    );
  });

  const readerAddressByKey = new Map<string, string>();
  const addReaderFragmentAddress = (
    address: ReaderAddress | null,
    fragment: string | null | undefined,
    label: string,
  ): void => {
    if (address === null || fragment === null || fragment === undefined) return;
    const pathInspection = inspectCanonicalRoutePath(address.path);
    const fragmentInspection = inspectCanonicalUrlFragment(fragment);
    if (!pathInspection.valid) {
      addIssue(
        issues,
        "reader-fragment-address-invalid",
        label,
        `Reader fragment address ${displayValue(`${address.path}#${fragment}`)} is invalid: route path ${pathInspection.issue}.`,
      );
      return;
    }
    if (!fragmentInspection.valid) {
      addIssue(
        issues,
        "reader-fragment-address-invalid",
        label,
        `Reader fragment address ${displayValue(`${address.path}#${fragment}`)} is invalid: fragment ${fragmentInspection.issue}.`,
      );
      return;
    }
    const key = `${address.path}#${fragmentInspection.decoded}`;
    const serialized = `${address.path}#${fragment}`;
    const existing = readerAddressByKey.get(key);
    if (existing === undefined || serialized < existing) {
      readerAddressByKey.set(key, serialized);
    }
  };

  input.reader.works.forEach((work, workIndex) => {
    work.sections.forEach((section, sectionIndex) => {
      const sectionLabel = `reader.works[${workIndex}].sections[${sectionIndex}]`;
      addReaderFragmentAddress(
        section.readerAddress,
        section.readerAddress?.anchor,
        `${sectionLabel}.readerAddress.anchor`,
      );
      addReaderFragmentAddress(
        section.readerAddress,
        section.domId,
        `${sectionLabel}.domId`,
      );
      section.blocks.forEach((block, blockIndex) => {
        const blockLabel = `${sectionLabel}.blocks[${blockIndex}]`;
        addReaderFragmentAddress(
          block.readerAddress,
          block.readerAddress?.anchor,
          `${blockLabel}.readerAddress.anchor`,
        );
        addReaderFragmentAddress(
          block.readerAddress,
          block.domId,
          `${blockLabel}.domId`,
        );
      });
    });
  });

  const requiredFragmentSources = new Map<string, Set<string>>();
  const addRequiredFragment = (href: string, source: string): void => {
    const parsed = parseHref(href, `${source}:${href}`, issues);
    if (parsed?.fragment === undefined) return;
    const sources = requiredFragmentSources.get(href) ?? new Set<string>();
    sources.add(source);
    requiredFragmentSources.set(href, sources);
  };

  input.routeLedger.routes.forEach((entry) => {
    if (entry.href.includes("#")) addRequiredFragment(entry.href, "route-ledger");
  });
  input.catalog.sections.forEach((section) => {
    const parsed = parseHref(
      section.readerHref,
      `catalog.sections[${displayValue(section.sectionId)}].readerHref`,
      issues,
    );
    if (parsed?.fragment !== undefined) {
      addRequiredFragment(section.readerHref, "catalog-current-section");
    }
    if (parsed === undefined) return;
    for (const legacyId of section.legacySectionIds) {
      addRequiredFragment(
        `${parsed.pathname}#${legacyId}`,
        "catalog-legacy-section",
      );
    }
  });

  const translations = [...(input.fragmentTranslations ?? [])]
    .map((translation) => ({ ...translation }))
    .sort(translatedFragmentComparator);
  const translationBySource = new Map<string, PublisherFragmentTranslation>();
  translations.forEach((translation, index) => {
    const source = parseHref(
      translation.fromHref,
      `fragmentTranslations[${index}].fromHref`,
      issues,
    );
    const target = parseHref(
      translation.toHref,
      `fragmentTranslations[${index}].toHref`,
      issues,
    );
    if (
      source?.fragment === undefined ||
      source.query !== undefined ||
      target?.fragment === undefined ||
      target.query !== undefined
    ) {
      addIssue(
        issues,
        "fragment-translation-invalid",
        translation.fromHref,
        "Fragment translations require canonical source and target hrefs with fragments and without queries.",
      );
      return;
    }
    if (translationBySource.has(translation.fromHref)) {
      addIssue(
        issues,
        "fragment-translation-invalid",
        translation.fromHref,
        `Fragment translation source ${displayValue(translation.fromHref)} appears more than once.`,
      );
      return;
    }
    const targetKey = fragmentKey(target.pathname, target.fragment);
    if (targetKey === undefined || !readerAddressByKey.has(targetKey)) {
      addIssue(
        issues,
        "fragment-translation-invalid",
        translation.fromHref,
        `Fragment translation target ${displayValue(translation.toHref)} is not a rendered Reader fragment address.`,
      );
      return;
    }
    translationBySource.set(translation.fromHref, translation);
  });

  const derivedRedirectBySource = new Map(
    derivedSlashRedirects.map((redirect) => [redirect.from, redirect.to] as const),
  );
  const resolveRedirectedPath = (start: string): string => {
    let current = start;
    const visited = new Set<string>();
    while (!visited.has(current)) {
      visited.add(current);
      const explicit = redirectBySource.get(current)?.to;
      const next = explicit ?? derivedRedirectBySource.get(current);
      if (next === undefined) return current;
      current = next;
    }
    return current;
  };

  const fragmentGaps: PublisherFragmentGap[] = [];
  for (const href of uniqueSorted(requiredFragmentSources.keys())) {
    const parsed = parseHref(href, `requiredFragment:${href}`, issues);
    if (parsed?.fragment === undefined) continue;
    const directKey = fragmentKey(parsed.pathname, parsed.fragment);
    const redirectedPath = resolveRedirectedPath(parsed.pathname);
    const redirectedKey = fragmentKey(redirectedPath, parsed.fragment);
    const translation = translationBySource.get(href);
    if (
      (directKey !== undefined && readerAddressByKey.has(directKey)) ||
      (redirectedKey !== undefined && readerAddressByKey.has(redirectedKey)) ||
      translation !== undefined
    ) {
      continue;
    }
    const gap: PublisherFragmentGap = {
      fragment: parsed.fragment,
      href,
      pathname: parsed.pathname,
      sources: uniqueSorted(requiredFragmentSources.get(href) ?? []),
    };
    fragmentGaps.push(gap);
    addIssue(
      issues,
      "fragment-gap",
      href,
      `Durable fragment ${displayValue(href)} has no rendered Reader address, redirect-preserved address, or explicit translation.`,
    );
  }

  const durableHrefs = uniqueSorted(input.routeLedger.routes.map(({ href }) => href));
  const durablePathnames: string[] = [];
  let durableQueryHrefCount = 0;
  let durableFragmentEntryCount = 0;
  const durableFragmentHrefs: string[] = [];
  input.routeLedger.routes.forEach((entry, index) => {
    const parsed = parseHref(
      entry.href,
      `routeLedger.routes[${index}].href`,
      issues,
    );
    if (parsed === undefined) return;
    durablePathnames.push(parsed.pathname);
    if (parsed.query !== undefined) {
      durableQueryHrefCount += 1;
      addIssue(
        issues,
        "durable-query",
        entry.href,
        `Durable route ledger href ${displayValue(entry.href)} contains a query string.`,
      );
    }
    if (parsed.fragment !== undefined) {
      durableFragmentEntryCount += 1;
      durableFragmentHrefs.push(entry.href);
    }
  });
  const uniqueDurablePathnames = uniqueSorted(durablePathnames);

  const exactOwners = new Map<string, string[]>();
  const addExactOwner = (path: string, owner: string): void => {
    const owners = exactOwners.get(path) ?? [];
    owners.push(owner);
    exactOwners.set(path, owners);
  };
  for (const route of validActiveRoutes) {
    addExactOwner(route.path, `publisher-active:${route.kind}`);
  }
  for (const redirect of explicitRedirects) {
    if (inspectCanonicalRoutePath(redirect.from).valid) {
      addExactOwner(redirect.from, "publisher-explicit-redirect");
    }
  }
  for (const redirect of derivedSlashRedirects) {
    addExactOwner(redirect.from, "publisher-derived-slash-redirect");
  }
  for (const resource of fixedRendererResources) {
    addExactOwner(resource.path, "publisher-renderer-resource");
  }
  for (const path of fixedSyncPaths) {
    addExactOwner(path, "publisher-sync-route");
  }
  for (const path of currentExactPaths) {
    if (inspectCanonicalRoutePath(path).valid) {
      addExactOwner(path, "coherence-current-exact");
    }
  }
  for (const path of retainedExactPaths) {
    if (inspectCanonicalRoutePath(path).valid) {
      addExactOwner(path, "coherence-retained-exact");
    }
  }

  const ownersForPath = (path: string): string[] => [
    ...(exactOwners.get(path) ?? []),
    ...retainedPrefixes
      .filter((prefix) => matchesPrefix(path, prefix))
      .map((prefix) => `coherence-retained-prefix:${prefix}`),
  ];
  const concreteOwnershipPaths = uniqueSorted([
    ...exactOwners.keys(),
    ...uniqueDurablePathnames,
  ]);
  const exactPathCollisions: PublisherExactPathCollision[] = [];
  for (const path of concreteOwnershipPaths) {
    const owners = ownersForPath(path).sort(compareText);
    const allCoherence = owners.every((owner) => owner.startsWith("coherence-"));
    if (owners.length < 2 || allCoherence) continue;
    exactPathCollisions.push({ owners, path });
    addIssue(
      issues,
      "collision",
      path,
      `Path ${displayValue(path)} has incompatible owners: ${owners.join(", ")}.`,
    );
  }

  const unclassifiedDurablePathnames = uniqueDurablePathnames.filter(
    (path) => ownersForPath(path).length === 0,
  );
  unclassifiedDurablePathnames.forEach((path) => {
    addIssue(
      issues,
      "unclassified-durable-path",
      path,
      `Durable pathname ${displayValue(path)} has no Publisher or Coherence owner.`,
    );
  });

  const finalIssues = sortedIssues(issues);
  const sortedActiveRoutes = [...activeRoutes].sort((left, right) =>
    compareText(`${left.path}\u0000${left.kind}`, `${right.path}\u0000${right.kind}`),
  );
  const sortedExplicitRedirects = [...explicitRedirects].sort(redirectComparator);
  const readerAddresses = uniqueSorted(readerAddressByKey.values());
  const requiredHrefs = uniqueSorted(requiredFragmentSources.keys());
  const uniqueActivePaths = uniqueSorted(activeRoutes.map(({ path }) => path));

  return {
    counts: {
      routeLedgerEntryCount: input.routeLedger.routes.length,
      durableHrefCount: durableHrefs.length,
      durablePathnameCount: uniqueDurablePathnames.length,
      durableQueryHrefCount,
      durableFragmentEntryCount,
      durableFragmentHrefCount: uniqueSorted(durableFragmentHrefs).length,
      publisherActiveRouteCount: activeRoutes.length,
      publisherActivePathCount: uniqueActivePaths.length,
      publisherActiveWorkPathCount: uniqueSorted(workPaths).length,
      publisherActiveSectionPathCount: uniqueSorted(sectionPaths).length,
      publisherActiveOtherPathCount: uniqueSorted(otherActivePaths).length,
      publisherExplicitRedirectCount: explicitRedirects.length,
      publisherDerivedSlashRedirectCount: derivedSlashRedirects.length,
      publisherRendererResourceCount: fixedRendererResources.length,
      publisherSyncMethodPathCount: fixedSyncMethodPaths.length,
      publisherSyncPathCount: fixedSyncPaths.length,
      currentCoherenceExactPathCount: currentExactPaths.length,
      retainedCoherenceExactPathCount: retainedExactPaths.length,
      retainedCoherencePrefixCount: retainedPrefixes.length,
      catalogPartPathCount: uniquePartPaths.length,
      catalogChapterPathCount: uniqueChapterPaths.length,
      unownedPartPathCount: unownedPartPaths.length,
      unownedChapterPathCount: unownedChapterPaths.length,
      exactPathCollisionCount: exactPathCollisions.length,
      decodedRouteCollisionCount: decodedRouteCollisions.length,
      pathCollisionCount:
        exactPathCollisions.length + decodedRouteCollisions.length,
      unclassifiedDurablePathnameCount: unclassifiedDurablePathnames.length,
      readerFragmentAddressCount: readerAddresses.length,
      requiredFragmentHrefCount: requiredHrefs.length,
      fragmentTranslationCount: translations.length,
      fragmentGapCount: fragmentGaps.length,
      issueCount: finalIssues.length,
    },
    publisher: {
      activeRoutes: sortedActiveRoutes,
      workPaths: uniqueSorted(workPaths),
      sectionPaths: uniqueSorted(sectionPaths),
      otherActivePaths: uniqueSorted(otherActivePaths),
      explicitRedirects: sortedExplicitRedirects,
      derivedSlashRedirects,
      fixedRendererResources,
      fixedSyncMethodPaths,
    },
    coherence: {
      currentExactPaths,
      retainedExactPaths,
      retainedPrefixes,
    },
    aggregate: {
      partPaths: uniquePartPaths,
      chapterPaths: uniqueChapterPaths,
      unownedPartPaths,
      unownedChapterPaths,
    },
    durable: {
      hrefs: durableHrefs,
      pathnames: uniqueDurablePathnames,
      unclassifiedPathnames: unclassifiedDurablePathnames,
    },
    fragments: {
      readerAddresses,
      requiredHrefs,
      translations,
      gaps: fragmentGaps,
    },
    exactPathCollisions,
    decodedRouteCollisions,
    issues: finalIssues,
  };
}

export function formatPublisherRouteOwnershipReport(
  report: PublisherRouteOwnershipReport,
): string {
  if (report.issues.length === 0) {
    return [
      "Publisher route ownership is valid.",
      `Active Publisher paths: ${report.counts.publisherActivePathCount.toLocaleString("en-US")}`,
      `Explicit redirects: ${report.counts.publisherExplicitRedirectCount.toLocaleString("en-US")}`,
      `Derived slash redirects: ${report.counts.publisherDerivedSlashRedirectCount.toLocaleString("en-US")}`,
      `Durable Coherence pathnames: ${report.counts.durablePathnameCount.toLocaleString("en-US")}`,
      `Durable fragments: ${report.counts.requiredFragmentHrefCount.toLocaleString("en-US")}`,
    ].join("\n");
  }
  return [
    `Publisher route ownership has ${report.issues.length.toLocaleString("en-US")} issue${report.issues.length === 1 ? "" : "s"}.`,
    ...report.issues.map(
      (issue) => `  [${issue.code}] ${issue.path}: ${issue.message}`,
    ),
  ].join("\n");
}

export function validatePublisherRouteOwnership(
  input: PublisherRouteOwnershipInput,
): PublisherRouteOwnershipReport {
  const report = buildPublisherRouteOwnershipReport(input);
  if (report.issues.length > 0) {
    throw new Error(formatPublisherRouteOwnershipReport(report));
  }
  return report;
}
