import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildCatalog,
  buildSearchIndex,
  breadcrumbsDir,
  catalogPath,
  cleanDir,
  ensureDir,
  generatedRoot,
  publicDataRoot,
  outlineDataPath,
  progressSectionsPath,
  readerSectionsPath,
  repoRoot,
  searchIndexPath,
  writeJson,
} from "./shared";
import { buildPdfDownloads, pdfManifestPath } from "./pdf";
import { validateSectionLedger } from "./validate";
import { displayPartTitle } from "../../src/lib/manuscript-labels";

function buildBreadcrumbRoutes(catalog: ReturnType<typeof buildCatalog>) {
  const routes = new Map<
    string,
    { href: string; crumbs: Array<{ label: string; href: string }> }
  >();
  const overview = { label: "Overview", href: "/overview/" };
  const addRoute = (href: string, crumbs: Array<{ label: string; href: string }>) => {
    const compactCrumbs = crumbs.filter(
      (crumb, index) => crumb.label !== crumbs[index + 1]?.label,
    );
    routes.set(href, { href, crumbs: compactCrumbs });
  };

  addRoute("/", []);
  addRoute("/overview/", [overview]);

  for (const volume of catalog.volumes) {
    addRoute(volume.href, []);

    for (const part of volume.parts) {
      const partCrumb = { label: displayPartTitle(part, volume), href: part.href };
      addRoute(part.href, [partCrumb]);

      for (const chapter of part.chapters) {
        const chapterCrumb = { label: chapter.title, href: chapter.href };
        if (chapter.href !== part.href) {
          addRoute(chapter.href, [partCrumb, chapterCrumb]);
        }

        for (const sectionId of chapter.sectionIds) {
          const section = catalog.sections.find(
            (candidate) => candidate.sectionId === sectionId,
          );
          if (!section) continue;
          const crumbs = [partCrumb, { label: section.title, href: section.readerHref }];
          if (
            chapter.href !== part.href &&
            (chapter.sectionIds.length !== 1 || chapter.sectionIds[0] !== section.sectionId)
          ) {
            crumbs.splice(1, 0, chapterCrumb);
          }
          addRoute(section.readerHref, crumbs);
          if (section.href !== section.readerHref) {
            addRoute(section.href, [partCrumb, chapterCrumb]);
          }
        }
      }
    }
  }

  return [...routes.values()];
}

export async function compileManuscripts(): Promise<void> {
  const catalog = buildCatalog();
  // Compilation is safe to run from every development and build lifecycle.
  // It must enforce the durable route contract, but it must never expand that
  // contract implicitly. New routes enter the committed ledger only through
  // the explicit, transactional manuscripts:record-routes command.
  validateSectionLedger(catalog, undefined, { checkStale: false });
  const pdfDownloads = await buildPdfDownloads(catalog);
  const readerSections = catalog.sections.map((section) => ({
    sectionId: section.sectionId,
    title: section.title,
    href: section.href,
    chapterHref: section.chapterHref,
    readerHref: section.readerHref,
    text: section.text,
    contentHash: section.contentHash,
    versionHash: section.versionHash,
    versionDate: section.versionDate,
    versionUrl: section.versionUrl,
    audioVersionId: section.audioVersionId,
    paragraphs: section.paragraphs.map((paragraph) => ({
      paragraphId: paragraph.paragraphId,
      anchor: paragraph.anchor,
      order: paragraph.order,
      contentHash: paragraph.contentHash,
    })),
  }));
  // Slim per-section manifest without the section body text (PERF-01). The
  // toolbar progress island and the audio queue need only these fields on every
  // page; the full ~1.7MB reader-sections payload is now fetched lazily (audio
  // text on first play), not on every page load.
  const progressSections = catalog.sections.map((section) => ({
    sectionId: section.sectionId,
    contentHash: section.contentHash,
    title: section.title,
    href: section.href,
    chapterHref: section.chapterHref,
    readerHref: section.readerHref,
    audioVersionId: section.audioVersionId,
    paragraphs: section.paragraphs.map((paragraph) => ({
      paragraphId: paragraph.paragraphId,
      anchor: paragraph.anchor,
      contentHash: paragraph.contentHash,
    })),
  }));
  const breadcrumbRoutes = buildBreadcrumbRoutes(catalog);
  // Shard breadcrumbs by volume so each page fetches only its volume's routes
  // (largest shard ~130KB) instead of the full ~483KB set (PERF-01). Routes not
  // under a volume (the home and overview crumbs) go in an "index" shard.
  const breadcrumbShards = new Map<string, typeof breadcrumbRoutes>();
  for (const route of breadcrumbRoutes) {
    const match = route.href.match(/^\/manuscripts\/([^/]+)\//);
    const key = match ? match[1]! : "index";
    const shard = breadcrumbShards.get(key) ?? [];
    shard.push(route);
    breadcrumbShards.set(key, shard);
  }
  const searchIndex = buildSearchIndex(catalog);
  ensureDir(generatedRoot);
  ensureDir(publicDataRoot);
  writeJson(catalogPath, catalog);
  writeJson(readerSectionsPath, readerSections);
  writeJson(progressSectionsPath, progressSections);
  cleanDir(breadcrumbsDir);
  for (const [key, shard] of breadcrumbShards) {
    writeJson(path.join(breadcrumbsDir, `${key}.json`), shard);
  }
  writeJson(searchIndexPath, searchIndex);
  writeJson(pdfManifestPath, pdfDownloads);
  // Emit the toolbar outline tree as a fetch-on-demand payload (PERF-05). The
  // dynamic import runs after catalog.json is written above, so the runtime
  // builder reads the fresh catalog; manuscript-data is not imported earlier in
  // this process, so its module-level catalog is not stale.
  const { toolbarOutline } = await import("../../src/lib/manuscript-data");
  writeJson(outlineDataPath, toolbarOutline());
  console.log(
    `Compiled ${catalog.stats.sectionCount} sections, ${catalog.stats.wordCount.toLocaleString()} words`,
  );
  console.log(`Catalog: ${path.relative(repoRoot, catalogPath)}`);
  console.log(`Reader data: ${path.relative(repoRoot, readerSectionsPath)}`);
  console.log(
    `Breadcrumb shards: ${breadcrumbShards.size} in ${path.relative(repoRoot, breadcrumbsDir)}`,
  );
  console.log(`Search index: ${path.relative(repoRoot, searchIndexPath)}`);
  console.log(`PDF downloads: ${path.relative(repoRoot, pdfManifestPath)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  compileManuscripts().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
