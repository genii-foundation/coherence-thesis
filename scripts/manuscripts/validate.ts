import fs from "node:fs";
import { pathToFileURL } from "node:url";
import {
  buildCatalog,
  buildSearchIndex,
  catalogPath,
  readMarkdownDocuments,
  sectionHref,
  searchIndexPath,
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
