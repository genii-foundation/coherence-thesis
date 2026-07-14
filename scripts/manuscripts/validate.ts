import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { applyRecordedAudioDurations } from "./audio-durations";
import {
  audioInputHash,
  audioVersionId,
  buildCatalog,
  buildSearchIndex,
  buildSectionLedger,
  buildRouteLedger,
  catalogPath,
  readMarkdownDocuments,
  readSectionLedger,
  readSectionLineage,
  readRouteLedger,
  readVersionProvenance,
  routeVolumesForDocuments,
  sectionHref,
  searchIndexPath,
  sectionLedgerPath,
  routeLedgerPath,
  resolvePublishedRoute,
  validateSectionLineageConfig,
  versionProvenancePath,
} from "./shared";
import type { CompiledCatalog, RouteLedger, SectionLedger } from "./shared";
import { applyRecordedAudioDurations } from "./audio-durations";

function collectOverviewRefs(
  nodes: Array<{ references?: Array<{ sectionId: string }>; children?: unknown[] }>,
): string[] {
  const refs: string[] = [];
  for (const node of nodes) {
    refs.push(...(node.references ?? []).map((ref) => ref.sectionId));
    refs.push(
      ...collectOverviewRefs(
        (node.children ?? []) as Array<{
          references?: Array<{ sectionId: string }>;
          children?: unknown[];
        }>,
      ),
    );
  }
  return refs;
}

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function isIsoDate(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && /^\d{4}-\d{2}-\d{2}T/.test(value);
}

function isGitHubPullRequestUrl(value: string): boolean {
  return /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(value);
}

function isGitHubCommitUrl(value: string): boolean {
  return /^https:\/\/github\.com\/[^/]+\/[^/]+\/commit\/[0-9a-f]{40}$/.test(value);
}

export function catalogForStaleCheck(catalog: CompiledCatalog): CompiledCatalog {
  return {
    ...catalog,
    gitRevision: "ignored-for-stale-check",
  };
}

function catalogJsonForStaleCheck(value: string): string {
  return `${JSON.stringify(catalogForStaleCheck(JSON.parse(value) as CompiledCatalog), null, 2)}\n`;
}

// Compatibility gate for the original section route ledger. The lineage-aware
// route ledger below verifies that a historical path still serves related
// content, not merely that some route now occupies the same string.
export function validateSectionLedger(
  catalog: CompiledCatalog,
  committed: SectionLedger = readSectionLedger(),
  { checkStale = fs.existsSync(sectionLedgerPath) }: { checkStale?: boolean } = {},
): void {
  if (checkStale) {
    const next = buildSectionLedger(catalog, committed);
    assert(
      JSON.stringify(committed) === JSON.stringify(next),
      "Section ledger is stale. Review link preservation, then run npm run manuscripts:record-routes.",
    );
  }

  const currentSectionIds = new Set(
    catalog.sections.map((section) => section.sectionId),
  );
  const aliasTargetsResolve = catalog.aliases.every((alias) =>
    currentSectionIds.has(alias.targetSectionId),
  );
  assert(
    aliasTargetsResolve,
    "An alias points at a section that no longer exists.",
  );

  for (const entry of committed.routes) {
    const resolved = resolvePublishedRoute(catalog, entry.href);
    if (
      resolved &&
      ["section", "section-alias", "reader"].includes(resolved.kind)
    ) {
      continue;
    }
    assert(
      false,
      `Published route '${entry.href}' (section '${entry.sectionId}') no longer resolves. ` +
        "This is a link-preservation event: run npm run manuscripts:preserve-links, " +
        "review the successor, then run npm run manuscripts:record-routes.",
    );
  }
}

export function validateRouteLedger(
  catalog: CompiledCatalog,
  committed: RouteLedger = readRouteLedger(),
  { checkStale = fs.existsSync(routeLedgerPath) }: { checkStale?: boolean } = {},
): void {
  assert(committed.version === 2, "Route ledger must use version 2.");
  assert(committed.routes.length > 0, "Route ledger must not be empty.");
  const knownKinds = new Set([
    "volume",
    "part",
    "chapter",
    "section",
    "section-alias",
    "route-alias",
    "reader",
  ]);
  const ledgerKeys = new Set<string>();
  for (const entry of committed.routes) {
    assert(knownKinds.has(entry.kind), `Unknown route ledger kind '${entry.kind}'.`);
    assert(
      entry.targetContinuityIds.length > 0 &&
        entry.targetContinuityIds.every((id) => typeof id === "string" && id),
      `Route ledger entry '${entry.href}' has no continuity owner.`,
    );
    assert(
      new Set(entry.targetContinuityIds).size === entry.targetContinuityIds.length,
      `Route ledger entry '${entry.href}' repeats a continuity owner.`,
    );
    const key = JSON.stringify([
      entry.href,
      entry.kind,
      [...entry.targetContinuityIds].sort(),
    ]);
    assert(!ledgerKeys.has(key), `Duplicate route ledger entry '${entry.href}'.`);
    ledgerKeys.add(key);
  }
  if (checkStale) {
    const next = buildRouteLedger(catalog, committed);
    assert(
      JSON.stringify(committed) === JSON.stringify(next),
      "Route ledger is stale. Review link preservation, then run npm run manuscripts:record-routes.",
    );
  }

  for (const entry of committed.routes) {
    const resolved = resolvePublishedRoute(catalog, entry.href);
    assert(
      resolved,
      `Published ${entry.kind} route '${entry.href}' no longer resolves. ` +
        "Run npm run manuscripts:preserve-links before compiling.",
    );
    if (!resolved) continue;
    const currentIds = new Set(resolved.targetContinuityIds);
    const overlap = entry.targetContinuityIds.filter((id) => currentIds.has(id));
    const membershipMayEvolve = [
      "volume",
      "part",
      "chapter",
      "route-alias",
    ].includes(entry.kind);
    const preservesLineage = membershipMayEvolve
      ? overlap.length > 0
      : overlap.length === entry.targetContinuityIds.length;
    assert(
      preservesLineage,
      `Published ${entry.kind} route '${entry.href}' now resolves to unrelated lineage. ` +
        "Change the new canonical route or add a reviewed structural alias.",
    );
  }
}

export function validateManuscripts(): void {
  const docs = readMarkdownDocuments();
  assert(docs.length > 0, "No manuscript Markdown files were found.");

  const seenSectionIds = new Set<string>();
  const seenPaths = new Set<string>();
  const volumeIds = new Set<string>();
  const routeContexts = routeVolumesForDocuments(docs);
  const chapterSectionCounts = docs.reduce((counts, doc) => {
    const key = `${doc.frontmatter.volumeId}:${doc.frontmatter.partId}:${doc.frontmatter.chapterId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const partChapters = docs.reduce((chapters, doc) => {
    const key = `${doc.frontmatter.volumeId}:${doc.frontmatter.partId}`;
    const partChapters = chapters.get(key) ?? new Set<string>();
    partChapters.add(doc.frontmatter.chapterId);
    chapters.set(key, partChapters);
    return chapters;
  }, new Map<string, Set<string>>());
  for (const doc of docs) {
    const id = doc.frontmatter.sectionId;
    assert(!seenSectionIds.has(id), `Duplicate sectionId '${id}'.`);
    seenSectionIds.add(id);
    volumeIds.add(doc.frontmatter.volumeId);
    const chapterKey = `${doc.frontmatter.volumeId}:${doc.frontmatter.partId}:${doc.frontmatter.chapterId}`;
    const partKey = `${doc.frontmatter.volumeId}:${doc.frontmatter.partId}`;
    const href = sectionHref(
      doc.frontmatter,
      routeContexts.get(doc.frontmatter.volumeId),
      {
        chapterSectionCount: chapterSectionCounts.get(chapterKey) ?? 1,
        partChapterCount: partChapters.get(partKey)?.size ?? 1,
      },
    );
    assert(!seenPaths.has(href), `Duplicate section route '${href}'.`);
    seenPaths.add(href);
    assert(doc.body.trim().length > 0, `Empty manuscript body in ${doc.relativePath}.`);
  }

  const catalog = buildCatalog();
  applyRecordedAudioDurations(catalog);
  validateSectionLineageConfig(catalog, readSectionLineage());
  validateRouteLedger(catalog);
  const publishedPaths = new Set<string>(
    catalog.sections.map((section) => section.href),
  );
  for (const volume of catalog.volumes) {
    publishedPaths.add(volume.href);
    for (const part of volume.parts) {
      publishedPaths.add(part.href);
      for (const chapter of part.chapters) publishedPaths.add(chapter.href);
    }
  }
  const provenance = readVersionProvenance();
  assert(
    fs.existsSync(versionProvenancePath),
    "Version provenance is missing. Run npm run manuscripts:versions.",
  );
  assert(provenance.version === 1, "Version provenance must use version 1.");
  assert(isIsoDate(provenance.generatedAt), "Version provenance generatedAt must be an ISO date.");
  const provenanceByHash = new Map<string, (typeof provenance.entries)[number]>();
  for (const entry of provenance.entries) {
    assert(
      /^[0-9a-f]{16}$/.test(entry.contentHash),
      `Version provenance hash '${entry.contentHash}' must be 16 lowercase hex characters.`,
    );
    assert(
      !provenanceByHash.has(entry.contentHash),
      `Duplicate version provenance hash '${entry.contentHash}'.`,
    );
    provenanceByHash.set(entry.contentHash, entry);
    assert(
      isIsoDate(entry.versionDate),
      `Version provenance date for '${entry.contentHash}' must be an ISO date.`,
    );
    assert(
      /^[0-9a-f]{40}$/.test(entry.commitSha),
      `Version provenance commit for '${entry.contentHash}' must be a full SHA.`,
    );
    assert(
      isGitHubCommitUrl(entry.commitUrl),
      `Version provenance commitUrl for '${entry.contentHash}' must be a GitHub commit URL.`,
    );
    if (entry.pullRequestUrl) {
      assert(
        isGitHubPullRequestUrl(entry.pullRequestUrl),
        `Version provenance pullRequestUrl for '${entry.contentHash}' must be a GitHub PR URL.`,
      );
      assert(
        typeof entry.pullRequestNumber === "number" &&
          Number.isInteger(entry.pullRequestNumber),
        `Version provenance pullRequestNumber for '${entry.contentHash}' must be an integer.`,
      );
    }
  }

  for (const section of catalog.sections) {
    const entry = provenanceByHash.get(section.contentHash);
    assert(
      entry,
      `Missing version provenance for section '${section.sectionId}' hash '${section.contentHash}'. Run npm run manuscripts:versions.`,
    );
    assert(
      section.versionHash === section.contentHash,
      `Section '${section.sectionId}' versionHash must match contentHash.`,
    );
    assert(
      section.versionDate === entry?.versionDate,
      `Section '${section.sectionId}' versionDate does not match provenance.`,
    );
    assert(
      section.versionUrl === (entry?.pullRequestUrl ?? entry?.commitUrl),
      `Section '${section.sectionId}' versionUrl does not match provenance.`,
    );
    assert(
      section.audioVersionId ===
        audioVersionId(
          section.sectionId,
          audioInputHash(section.title, section.text),
        ),
      `Section '${section.sectionId}' audioVersionId must match its spoken title and body.`,
    );
  }

  const overviewRefs = collectOverviewRefs(catalog.overview.nodes);
  for (const sectionId of overviewRefs) {
    assert(seenSectionIds.has(sectionId), `Overview references missing section '${sectionId}'.`);
  }
  const aliasSources = new Set<string>();
  for (const alias of catalog.aliases) {
    assert(
      alias.sourceHref.startsWith("/manuscripts/") &&
        alias.sourceHref.endsWith("/") &&
        !alias.sourceHref.includes("?") &&
        !alias.sourceHref.includes("#"),
      `Alias sourceHref '${alias.sourceHref}' must be a normalized manuscript route.`,
    );
    assert(
      !publishedPaths.has(alias.sourceHref),
      `Alias sourceHref '${alias.sourceHref}' conflicts with a canonical section route.`,
    );
    assert(
      !aliasSources.has(alias.sourceHref),
      `Duplicate alias sourceHref '${alias.sourceHref}'.`,
    );
    aliasSources.add(alias.sourceHref);
    assert(
      seenSectionIds.has(alias.targetSectionId),
      `Alias target section '${alias.targetSectionId}' is missing.`,
    );
  }
  for (const volume of catalog.volumes) {
    assert(volumeIds.has(volume.volumeId), `Configured volume '${volume.volumeId}' has no sections.`);
    assert(volume.coverImage.length > 0, `Volume '${volume.volumeId}' is missing coverImage.`);
  }

  if (fs.existsSync(catalogPath)) {
    const current = fs.readFileSync(catalogPath, "utf8");
    const next = `${JSON.stringify(catalogForStaleCheck(catalog), null, 2)}\n`;
    assert(
      catalogJsonForStaleCheck(current) === next,
      "Generated manuscript catalog is stale. Run npm run manuscripts:compile.",
    );
  }

  if (fs.existsSync(searchIndexPath)) {
    const current = fs.readFileSync(searchIndexPath, "utf8");
    const next = `${JSON.stringify(buildSearchIndex(catalog), null, 2)}\n`;
    assert(
      current === next,
      "Generated search index is stale. Run npm run manuscripts:compile.",
    );
  }

  validateSectionLedger(catalog);

  console.log(
    `Validated ${docs.length} manuscript files and ${overviewRefs.length} overview references`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateManuscripts();
}
