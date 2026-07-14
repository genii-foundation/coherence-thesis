import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildCatalog, type CompiledCatalog } from "../manuscripts/shared";
import { repoRoot } from "./paths";

export const readmeStatusStartMarker = "<!-- BEGIN:development-status -->";
export const readmeStatusEndMarker = "<!-- END:development-status -->";
const integerFormat = new Intl.NumberFormat("en-US");

type PackageManifest = {
  dependencies?: Record<string, string>;
  version: string;
};

export function buildReadmeStatus(
  catalog: CompiledCatalog = buildCatalog(),
  packageJson: PackageManifest = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  ) as PackageManifest,
): string {
  return [
    readmeStatusStartMarker,
    "",
    `- Next.js: ${packageJson.dependencies?.next ?? "unknown"}`,
    `- Manuscripts: ${catalog.stats.volumeCount} ${catalog.stats.volumeCount === 1 ? "volume" : "volumes"}, ${catalog.stats.partCount} parts, ${catalog.stats.chapterCount} chapters, ${catalog.stats.sectionCount} sections`,
    `- Canonical words: ${integerFormat.format(catalog.stats.wordCount)}`,
    `- Estimated full read: ${catalog.stats.readingMinutes} minutes`,
    `- Overview nodes: ${catalog.overview.nodes.length}`,
    "",
    readmeStatusEndMarker,
  ].join("\n");
}

export function replaceReadmeStatus(readme: string, status: string): string {
  const start = readme.indexOf(readmeStatusStartMarker);
  const end = readme.indexOf(readmeStatusEndMarker);
  const duplicateStart = readme.indexOf(
    readmeStatusStartMarker,
    start + readmeStatusStartMarker.length,
  );
  const duplicateEnd = readme.indexOf(
    readmeStatusEndMarker,
    end + readmeStatusEndMarker.length,
  );
  if (
    start === -1 ||
    end === -1 ||
    end < start ||
    duplicateStart !== -1 ||
    duplicateEnd !== -1
  ) {
    throw new Error(
      "README status markers are missing, duplicated, or out of order.",
    );
  }
  return `${readme.slice(0, start)}${status}${readme.slice(end + readmeStatusEndMarker.length)}`;
}

export type ReadmeStatusResult = "current" | "stale" | "updated";

export function updateReadmeStatus({
  check = false,
  readmePath = path.join(repoRoot, "README.md"),
  status = buildReadmeStatus(),
}: {
  check?: boolean;
  readmePath?: string;
  status?: string;
} = {}): ReadmeStatusResult {
  const readme = fs.readFileSync(readmePath, "utf8");
  const next = replaceReadmeStatus(readme, status);
  if (next === readme) return "current";
  if (check) return "stale";
  fs.writeFileSync(readmePath, next);
  return "updated";
}

function runCli(args = process.argv.slice(2)): void {
  if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) {
    throw new Error("Usage: update-readme-status.ts [--check]");
  }

  const check = args[0] === "--check";
  const result = updateReadmeStatus({ check });
  if (result === "stale") {
    console.error("README development status is stale. Run npm run readme:update.");
    process.exitCode = 1;
    return;
  }
  console.log(
    result === "updated"
      ? "Updated README development status."
      : "README development status is current.",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
