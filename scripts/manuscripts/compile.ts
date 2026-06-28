import path from "node:path";
import {
  buildCatalog,
  buildSearchIndex,
  breadcrumbRoutesPath,
  catalogPath,
  ensureDir,
  generatedRoot,
  publicDataRoot,
  readerSectionsPath,
  repoRoot,
  searchIndexPath,
  writeJson,
} from "./shared";

function buildBreadcrumbRoutes(catalog: ReturnType<typeof buildCatalog>) {
  const routes = new Map<
    string,
    { href: string; crumbs: Array<{ label: string; href: string }> }
  >();
  const overview = { label: "Overview", href: "/overview/" };
  const manuscripts = { label: "Manuscripts", href: "/manuscripts/" };
  const addRoute = (href: string, crumbs: Array<{ label: string; href: string }>) => {
    routes.set(href, { href, crumbs });
  };

  addRoute("/", []);
  addRoute("/overview/", [overview]);
  addRoute("/manuscripts/", [manuscripts]);

  for (const volume of catalog.volumes) {
    const volumeCrumb = { label: volume.title, href: volume.href };
    addRoute(volume.href, [manuscripts, volumeCrumb]);

    for (const part of volume.parts) {
      const partCrumb = { label: part.title, href: part.href };
      addRoute(part.href, [manuscripts, volumeCrumb, partCrumb]);

      for (const chapter of part.chapters) {
        const chapterCrumb = { label: chapter.title, href: chapter.href };
        addRoute(chapter.href, [manuscripts, volumeCrumb, partCrumb, chapterCrumb]);

        for (const sectionId of chapter.sectionIds) {
          const section = catalog.sections.find(
            (candidate) => candidate.sectionId === sectionId,
          );
          if (!section) continue;
          addRoute(section.href, [
            manuscripts,
            volumeCrumb,
            partCrumb,
            chapterCrumb,
            { label: section.title, href: section.href },
          ]);
        }
      }
    }
  }

  return [...routes.values()];
}

export function compileManuscripts(): void {
  const catalog = buildCatalog();
  const readerSections = catalog.sections.map((section) => ({
    sectionId: section.sectionId,
    title: section.title,
    href: section.href,
    text: section.text,
    contentHash: section.contentHash,
    paragraphs: section.paragraphs.map((paragraph) => ({
      paragraphId: paragraph.paragraphId,
      anchor: paragraph.anchor,
      order: paragraph.order,
      contentHash: paragraph.contentHash,
    })),
  }));
  const breadcrumbRoutes = buildBreadcrumbRoutes(catalog);
  const searchIndex = buildSearchIndex(catalog);
  ensureDir(generatedRoot);
  ensureDir(publicDataRoot);
  writeJson(catalogPath, catalog);
  writeJson(readerSectionsPath, readerSections);
  writeJson(breadcrumbRoutesPath, breadcrumbRoutes);
  writeJson(searchIndexPath, searchIndex);
  console.log(
    `Compiled ${catalog.stats.sectionCount} sections, ${catalog.stats.wordCount.toLocaleString()} words`,
  );
  console.log(`Catalog: ${path.relative(repoRoot, catalogPath)}`);
  console.log(`Reader data: ${path.relative(repoRoot, readerSectionsPath)}`);
  console.log(`Breadcrumb data: ${path.relative(repoRoot, breadcrumbRoutesPath)}`);
  console.log(`Search index: ${path.relative(repoRoot, searchIndexPath)}`);
}

compileManuscripts();
