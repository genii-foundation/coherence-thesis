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
  try {
    const source = runGit(["show", `${commitSha}:${section.path}`]);
    const { body } = parseFrontmatter(source);
    return sha256(normalizeNewlines(body)).slice(0, 16);
  } catch {
    return null;
  }
}

export function firstCommitForCurrentHash(
  section: Pick<CompiledSection, "path" | "contentHash">,
  runGit: GitCommand = git,
): { commitSha: string; versionDate: string } {
  const log = runGit(["log", "--format=%H%x09%cI", "--", section.path]);
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
    const [commitSha = "", versionDate = ""] = runGit([
      "show",
      "-s",
      "--format=%H%x09%cI",
      "HEAD",
    ]).split("\t");
    return {
      commitSha,
      versionDate,
    };
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

export function buildVersionProvenanceManifest({
  now = new Date().toISOString(),
  sections = buildCatalog().sections,
  existing = readVersionProvenance(),
  runGit = git,
  resolvePullRequest = (commitSha: string) =>
    resolvePullRequestForCommit(commitSha, runGit),
}: {
  now?: string;
  sections?: Array<Pick<CompiledSection, "path" | "contentHash">>;
  existing?: VersionProvenanceManifest;
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
    const existingEntry = existingEntriesByHash.get(section.contentHash);
    if (existingEntry) {
      entriesByHash.set(section.contentHash, existingEntry);
      continue;
    }
    const firstCommit = firstCommitForCurrentHash(section, runGit);
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
  const manifest = buildVersionProvenanceManifest();
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
