import fs from "node:fs";
import path from "node:path";
import { buildCatalog, repoRoot } from "./manuscripts/shared";

const readmePath = path.join(repoRoot, "README.md");
const startMarker = "<!-- BEGIN:development-status -->";
const endMarker = "<!-- END:development-status -->";

// Only stable, source-derived facts go in the committed README (DOC-02). The
// block previously baked in the branch, short revision, working-tree dirtiness,
// a timestamp, and recent commits, which went stale after every merge and never
// matched a fresh checkout. What remains is a function of the manuscripts and
// dependencies, so it changes only when they do.
function buildStatus(): string {
  const catalog = buildCatalog();
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  ) as { version: string; dependencies?: Record<string, string> };

  return [
    startMarker,
    "",
    `- Next.js: ${packageJson.dependencies?.next ?? "unknown"}`,
    `- Manuscripts: ${catalog.stats.volumeCount} volume, ${catalog.stats.partCount} parts, ${catalog.stats.chapterCount} chapters, ${catalog.stats.sectionCount} sections`,
    `- Canonical words: ${catalog.stats.wordCount.toLocaleString()}`,
    `- Estimated full read: ${catalog.stats.readingMinutes} minutes`,
    `- Overview nodes: ${catalog.overview.nodes.length}`,
    "",
    endMarker,
  ].join("\n");
}

function main(): void {
  const readme = fs.readFileSync(readmePath, "utf8");
  const start = readme.indexOf(startMarker);
  const end = readme.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("README status markers are missing.");
  }
  const next = `${readme.slice(0, start)}${buildStatus()}${readme.slice(end + endMarker.length)}`;
  fs.writeFileSync(readmePath, next);
  console.log("Updated README development status.");
}

main();
