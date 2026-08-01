import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  buildCatalog,
  normalizeNewlines,
  parseFrontmatter,
  readVersionProvenance,
  repoRoot,
  sha256,
  versionProvenancePath,
  writeJson,
  type CompiledSection,
  type VersionProvenanceEntry,
  type VersionProvenanceManifest,
} from "./shared";
import { generatedSectionPathCandidates } from "../repository/paths";
import { buildSectionsFromSource } from "./import-markdown";
import { readVolumeConfigs } from "./shared";

export type GitCommand = (args: string[]) => string;
export type PullRequestResolver = (commitSha: string) => PullRequestMatch | null;

export type PullRequestMatch = {
  url: string;
  number: number;
};

export function git(args: string[], cwd = repoRoot): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

export function originRepoUrl(runGit: GitCommand = git): string {
  const remote = runGit(["remote", "get-url", "origin"]);
  const ssh = remote.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (ssh) return `https://github.com/${ssh[1]}/${ssh[2]}`;
  return remote.replace(/\.git$/, "");
}

export function originRepoSlug(runGit: GitCommand = git): string | null {
  const repoUrl = originRepoUrl(runGit);
  const match = repoUrl.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)$/);
  return match?.[1] ?? null;
}

function currentSectionHashAtCommit(
  section: Pick<CompiledSection, "path">,
  commitSha: string,
  runGit: GitCommand,
): string | null {
  for (const candidate of generatedSectionPathCandidates(section.path)) {
    try {
      const source = runGit(["show", `${commitSha}:${candidate}`]);
      const { body } = parseFrontmatter(source);
      return sha256(normalizeNewlines(body)).slice(0, 16);
    } catch {
      continue;
    }
  }
  return null;
}

export function firstCommitForCurrentHash(
  section: Pick<CompiledSection, "path" | "contentHash">,
  runGit: GitCommand = git,
): { commitSha: string; versionDate: string } {
  const log = runGit([
    "log",
    "--format=%H%x09%cI",
    "--",
    ...generatedSectionPathCandidates(section.path),
  ]);
  const commits = log
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [commitSha = "", versionDate = ""] = line.split("\t");
      return { commitSha, versionDate };
    })
    .reverse();

  const match = commits.find(
    (commit) =>
      currentSectionHashAtCommit(section, commit.commitSha, runGit) ===
      section.contentHash,
  );

  if (!match) {
    // Failing here is the point. The old behaviour returned HEAD, which wrote a well
    // formed entry naming a commit that does not contain the content. Ninety percent of
    // the record was fabricated that way before anyone noticed, because a false entry is
    // indistinguishable from a true one and the validate gate only checks that a row
    // exists. Uncommitted content has no provenance yet; say so and stop. (CTD-0112)
    throw new Error(
      `No commit contains the current content of '${section.path}' ` +
        `(hash ${section.contentHash}). Commit the manuscript work first: provenance ` +
        `derives from committed content, in the order commit, then versions, then validate.`,
    );
  }

  return match;
}

export function resolvePullRequestForCommit(
  commitSha: string,
  runGit: GitCommand = git,
): PullRequestMatch | null {
  const slug = originRepoSlug(runGit);
  if (!slug) return null;
  try {
    const response = execFileSync(
      "gh",
      [
        "api",
        `repos/${slug}/commits/${commitSha}/pulls`,
        "-H",
        "Accept: application/vnd.github+json",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    const pulls = JSON.parse(response) as Array<{
      html_url?: string;
      number?: number;
      merged_at?: string | null;
      state?: string;
    }>;
    const pull =
      pulls.find((candidate) => candidate.merged_at) ??
      pulls.find((candidate) => candidate.state === "open") ??
      pulls[0];
    if (!pull?.html_url || typeof pull.number !== "number") return null;
    return { url: pull.html_url, number: pull.number };
  } catch {
    return null;
  }
}

/**
 * True provenance comes from the canonical manuscripts, not from generated files.
 *
 * Generated sections stopped being committed, so for any section whose prose changed
 * after that point no commit contains its generated body, and the old walker's HEAD
 * fallback fabricated an answer. Ninety percent of the record was wrong that way.
 * The canonical volume manuscripts ARE committed on every edit, and the importer's
 * section split is deterministic, so replaying it at each historical commit yields the
 * exact body hash each section had there. The oldest commit producing a section's
 * current hash is, by construction, the commit that introduced the content.
 */
export function buildCanonicalFirstCommitIndex({
  runGit = git,
  configs = readVolumeConfigs(),
}: {
  runGit?: GitCommand;
  configs?: ReturnType<typeof readVolumeConfigs>;
} = {}): Map<string, { commitSha: string; versionDate: string }> {
  const index = new Map<string, { commitSha: string; versionDate: string }>();
  for (const config of configs) {
    const candidates = [config.sourcePath, ...(config.historicalSourcePaths ?? [])];
    let log = "";
    try {
      log = runGit(["log", "--reverse", "--format=%H%x09%cI", "--", ...candidates]);
    } catch {
      continue;
    }
    for (const line of log.split("\n")) {
      const [commitSha = "", versionDate = ""] = line.trim().split("\t");
      if (!commitSha) continue;
      let source: string | null = null;
      for (const candidate of candidates) {
        try {
          source = runGit(["show", `${commitSha}:${candidate}`]);
          break;
        } catch {
          continue;
        }
      }
      if (source === null) continue;
      let sections;
      try {
        sections = buildSectionsFromSource(config, source, config.sourcePath, commitSha);
      } catch {
        // A historical revision that no longer parses cannot claim any hash.
        continue;
      }
      for (const section of sections) {
        const first = section.body.findIndex((bodyLine) => bodyLine.trim());
        const last = section.body.findLastIndex((bodyLine) => bodyLine.trim());
        const hash = sha256(
          normalizeNewlines(section.body.slice(first, last + 1).join("\n")),
        ).slice(0, 16);
        // --reverse walks oldest first, so the first claim is the introducing commit.
        if (!index.has(hash)) index.set(hash, { commitSha, versionDate });
      }
    }
  }
  return index;
}

export function buildVersionProvenanceManifest({
  now = new Date().toISOString(),
  sections = buildCatalog().sections,
  existing = readVersionProvenance(),
  canonicalIndex = null as Map<string, { commitSha: string; versionDate: string }> | null,
  runGit = git,
  resolvePullRequest = (commitSha: string) =>
    resolvePullRequestForCommit(commitSha, runGit),
}: {
  now?: string;
  sections?: Array<Pick<CompiledSection, "path" | "contentHash">>;
  existing?: VersionProvenanceManifest;
  canonicalIndex?: Map<string, { commitSha: string; versionDate: string }> | null;
  runGit?: GitCommand;
  resolvePullRequest?: PullRequestResolver;
} = {}): VersionProvenanceManifest {
  const repoUrl = originRepoUrl(runGit);
  const entriesByHash = new Map<string, VersionProvenanceEntry>();
  const existingEntriesByHash = new Map(
    existing.entries.map((entry) => [entry.contentHash, entry]),
  );
  const pullRequestsByCommit = new Map<string, PullRequestMatch | null>();

  for (const section of sections) {
    if (entriesByHash.has(section.contentHash)) continue;
    // Existing entries are no longer trusted for their commit. Reusing them by hash is
    // what preserved four hundred and sixty one fabricated rows across every
    // regeneration: a wrong entry, once written, could never be corrected by rerunning
    // the tool. Entries are re-derived every time; existing data is reused below only
    // to avoid refetching a pull request for a commit we resolve to again.
    const firstCommit =
      canonicalIndex?.get(section.contentHash) ??
      firstCommitForCurrentHash(section, runGit);
    const existingEntry = existingEntriesByHash.get(section.contentHash);
    if (
      existingEntry &&
      existingEntry.commitSha === firstCommit.commitSha &&
      existingEntry.pullRequestUrl &&
      !pullRequestsByCommit.has(firstCommit.commitSha)
    ) {
      pullRequestsByCommit.set(firstCommit.commitSha, {
        url: existingEntry.pullRequestUrl,
        number: existingEntry.pullRequestNumber as number,
      });
    }
    if (!pullRequestsByCommit.has(firstCommit.commitSha)) {
      pullRequestsByCommit.set(
        firstCommit.commitSha,
        resolvePullRequest(firstCommit.commitSha),
      );
    }
    const pullRequest = pullRequestsByCommit.get(firstCommit.commitSha);
    entriesByHash.set(section.contentHash, {
      contentHash: section.contentHash,
      versionDate: firstCommit.versionDate,
      commitSha: firstCommit.commitSha,
      commitUrl: `${repoUrl}/commit/${firstCommit.commitSha}`,
      ...(pullRequest
        ? {
            pullRequestUrl: pullRequest.url,
            pullRequestNumber: pullRequest.number,
          }
        : {}),
    });
  }

  return {
    version: 1,
    generatedAt: now,
    entries: [...entriesByHash.values()].sort((left, right) =>
      left.contentHash.localeCompare(right.contentHash),
    ),
  };
}

export function refreshVersionProvenance(): void {
  const manifest = buildVersionProvenanceManifest({
    canonicalIndex: buildCanonicalFirstCommitIndex(),
  });
  const existing = readVersionProvenance();
  if (JSON.stringify(existing.entries) === JSON.stringify(manifest.entries)) {
    manifest.generatedAt = existing.generatedAt;
  }
  writeJson(versionProvenancePath, manifest);
  console.log(
    `Wrote ${manifest.entries.length.toLocaleString()} section versions to ${versionProvenancePath}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  refreshVersionProvenance();
}
