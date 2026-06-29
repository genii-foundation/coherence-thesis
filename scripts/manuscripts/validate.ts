import fs from "node:fs";
import { pathToFileURL } from "node:url";
import {
  buildCatalog,
  buildSearchIndex,
  catalogPath,
  readMarkdownDocuments,
  readVersionProvenance,
  sectionHref,
  searchIndexPath,
  versionProvenancePath,
} from "./shared";
import type { CompiledCatalog } from "./shared";

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

export function validateManuscripts(): void {
  const docs = readMarkdownDocuments();
  assert(docs.length > 0, "No manuscript Markdown files were found.");

  const seenSectionIds = new Set<string>();
  const seenPaths = new Set<string>();
  const volumeIds = new Set<string>();
  for (const doc of docs) {
    const id = doc.frontmatter.sectionId;
    assert(!seenSectionIds.has(id), `Duplicate sectionId '${id}'.`);
    seenSectionIds.add(id);
    volumeIds.add(doc.frontmatter.volumeId);
    const href = sectionHref(doc.frontmatter);
    assert(!seenPaths.has(href), `Duplicate section route '${href}'.`);
    seenPaths.add(href);
    assert(doc.body.trim().length > 0, `Empty manuscript body in ${doc.relativePath}.`);
  }

  const catalog = buildCatalog();
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
      section.audioVersionId === `${section.sectionId}-${section.contentHash}`,
      `Section '${section.sectionId}' audioVersionId must include sectionId and contentHash.`,
    );
  }

  const overviewRefs = collectOverviewRefs(catalog.overview.nodes);
  for (const sectionId of overviewRefs) {
    assert(seenSectionIds.has(sectionId), `Overview references missing section '${sectionId}'.`);
  }
  const aliasSources = new Set<string>();
  for (const alias of catalog.aliases) {
    assert(
      !seenPaths.has(alias.sourceHref),
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

  console.log(
    `Validated ${docs.length} manuscript files and ${overviewRefs.length} overview references`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateManuscripts();
}
