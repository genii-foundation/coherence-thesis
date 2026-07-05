import fs from "node:fs";
import path from "node:path";
import { buildCatalog, git as runGit, repoRoot } from "./manuscripts/shared";

const readmePath = path.join(repoRoot, "README.md");
const startMarker = "<!-- BEGIN:development-status -->";
const endMarker = "<!-- END:development-status -->";

function git(args: string[]): string {
  try {
    return runGit(args);
  } catch {
    return "";
  }
}

function buildStatus(): string {
  const catalog = buildCatalog();
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  ) as { version: string; dependencies?: Record<string, string> };
  const branch = git(["branch", "--show-current"]) || "main";
  const revision = git(["rev-parse", "--short", "HEAD"]) || "uncommitted";
  const status = git(["status", "--short"]);
  const recentCommits =
    git(["log", "--oneline", "-5"]) || "No commits yet. Initial baseline is in progress.";

  return [
    startMarker,
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `- Branch: ${branch}`,
    `- Revision: ${revision}`,
    `- Working tree: ${status ? "local changes present" : "clean"}`,
    `- Next.js: ${packageJson.dependencies?.next ?? "unknown"}`,
    `- Manuscripts: ${catalog.stats.volumeCount} volume, ${catalog.stats.partCount} parts, ${catalog.stats.chapterCount} chapters, ${catalog.stats.sectionCount} sections`,
    `- Canonical words: ${catalog.stats.wordCount.toLocaleString()}`,
    `- Estimated full read: ${catalog.stats.readingMinutes} minutes`,
    `- Overview nodes: ${catalog.overview.nodes.length}`,
    "",
    "Recent commits:",
    "",
    "```text",
    recentCommits,
    "```",
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
