import path from "node:path";
import {
  buildCatalog,
  buildSearchIndex,
  buildSectionLedger,
  breadcrumbRoutesPath,
  catalogPath,
  ensureDir,
  generatedRoot,
  publicDataRoot,
  outlineDataPath,
  progressSectionsPath,
  readerSectionsPath,
  repoRoot,
  searchIndexPath,
  sectionLedgerPath,
  writeJson,
} from "./shared";
import { buildPdfDownloads, pdfManifestPath } from "./pdf";

function buildBreadcrumbRoutes(catalog: ReturnType<typeof buildCatalog>) {
  const routes = new Map<
    string,
    { href: string; crumbs: Array<{ label: string; href: string }> }
  >();
  const overview = { label: "Overview", href: "/overview/" };
  const addRoute = (href: string, crumbs: Array<{ label: string; href: string }>) => {
    routes.set(href, { href, crumbs });
  };

  addRoute("/", []);
  addRoute("/overview/", [overview]);

  for (const volume of catalog.volumes) {
    addRoute(volume.href, []);

    for (const part of volume.parts) {
      const partCrumb = { label: part.title, href: part.href };
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
          const crumbs = [
            partCrumb,
            { label: section.title, href: section.href },
          ];
          if (
            chapter.href !== part.href &&
            (chapter.sectionIds.length !== 1 || chapter.sectionIds[0] !== section.sectionId)
          ) {
            crumbs.splice(1, 0, chapterCrumb);
          }
          addRoute(section.href, crumbs);
        }
      }
    }
  }

  return [...routes.values()];
}

export async function compileManuscripts(): Promise<void> {
  const catalog = buildCatalog();
  const pdfDownloads = await buildPdfDownloads(catalog);
  const readerSections = catalog.sections.map((section) => ({
    sectionId: section.sectionId,
    title: section.title,
    href: section.href,
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
    audioVersionId: section.audioVersionId,
    paragraphs: section.paragraphs.map((paragraph) => ({
      paragraphId: paragraph.paragraphId,
      anchor: paragraph.anchor,
      contentHash: paragraph.contentHash,
    })),
  }));
  const breadcrumbRoutes = buildBreadcrumbRoutes(catalog);
  const searchIndex = buildSearchIndex(catalog);
  const sectionLedger = buildSectionLedger(catalog);
  ensureDir(generatedRoot);
  ensureDir(publicDataRoot);
  writeJson(catalogPath, catalog);
  writeJson(readerSectionsPath, readerSections);
  writeJson(progressSectionsPath, progressSections);
  writeJson(breadcrumbRoutesPath, breadcrumbRoutes);
  writeJson(searchIndexPath, searchIndex);
  writeJson(pdfManifestPath, pdfDownloads);
  writeJson(sectionLedgerPath, sectionLedger);
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
  console.log(`Breadcrumb data: ${path.relative(repoRoot, breadcrumbRoutesPath)}`);
  console.log(`Search index: ${path.relative(repoRoot, searchIndexPath)}`);
  console.log(`PDF downloads: ${path.relative(repoRoot, pdfManifestPath)}`);
}

compileManuscripts().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
