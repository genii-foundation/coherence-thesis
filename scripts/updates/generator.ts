import {
  createUpdatesSnapshot,
  parseUpdatesSnapshot,
  updatesBranch,
  updatesRepository,
  type UpdateCommitInput,
  type UpdatesSnapshot,
} from "../../src/lib/updates";
import { git } from "../manuscripts/shared";

export type GitCommand = (args: string[]) => string;
export type FetchCommand = typeof fetch;
export type UpdatesSnapshotSource = "local-git" | "github" | "snapshot";

export type UpdatesGenerationResult = {
  snapshot: UpdatesSnapshot;
  source: UpdatesSnapshotSource;
  failures: Error[];
};

const githubApiRoot = `https://api.github.com/repos/${updatesRepository}`;
const githubPageSize = 100;
const githubRequestTimeoutMs = 15_000;
const maxGithubPages = 1_000;
const maxGithubCommitFiles = 3_000;

export function getRequiredUpdatesHeadSha(
  environment: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const explicit = environment.UPDATES_REQUIRED_HEAD_SHA?.trim();
  if (explicit) return explicit;

  if (environment.GITHUB_REF === `refs/heads/${updatesBranch}`) {
    return environment.GITHUB_SHA?.trim() || undefined;
  }

  if (
    environment.VERCEL_ENV === "production" &&
    environment.VERCEL_GIT_COMMIT_REF === updatesBranch
  ) {
    return environment.VERCEL_GIT_COMMIT_SHA?.trim() || undefined;
  }

  return undefined;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function parseNumstatCount(value: string, label: string): number {
  if (value === "-") return 0;
  if (!/^\d+$/.test(value)) {
    throw new Error(`Local Git returned an invalid ${label}: ${value}`);
  }
  const count = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(count)) {
    throw new Error(`Local Git returned an unsafe ${label}: ${value}`);
  }
  return count;
}

type LocalGitCommitMetadata = Pick<
  UpdateCommitInput,
  "sha" | "committedAt" | "subject"
> & {
  parentShas: string[];
};

export function parseLocalGitLog(value: string): LocalGitCommitMetadata[] {
  const fields = value.split("\0");
  if (fields.at(-1) === "") fields.pop();
  if (fields.length % 4 !== 0) {
    throw new Error("Local Git returned an incomplete updates record.");
  }

  const commits: LocalGitCommitMetadata[] = [];
  for (let index = 0; index < fields.length; index += 4) {
    const sha = fields[index] ?? "";
    const parentShas = (fields[index + 1] ?? "")
      .split(" ")
      .filter(Boolean);
    const committedAt = fields[index + 2] ?? "";
    const subject = fields[index + 3] ?? "";
    if (!sha || !committedAt || !subject) {
      throw new Error("Local Git returned an incomplete updates record.");
    }
    commits.push({ sha, parentShas, committedAt, subject });
  }
  return commits;
}

export function parseLocalNumstat(
  value: string,
): Pick<UpdateCommitInput, "filesChanged" | "additions" | "deletions"> {
  const rows = value.split("\0");
  let filesChanged = 0;
  let additions = 0;
  let deletions = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] ?? "";
    if (!row) continue;
    const match = row.match(/^(-|\d+)\t(-|\d+)\t([\s\S]*)$/);
    if (!match) {
      throw new Error("Local Git returned an invalid updates numstat row.");
    }
    const [, added = "", deleted = "", pathValue = ""] = match;
    filesChanged += 1;
    additions += parseNumstatCount(added, "addition count");
    deletions += parseNumstatCount(deleted, "deletion count");
    if (!pathValue) {
      if (!rows[index + 1] || !rows[index + 2]) {
        throw new Error("Local Git returned an incomplete rename row.");
      }
      index += 2;
    }
  }

  return { filesChanged, additions, deletions };
}

export function readCompleteLocalSnapshot(
  runGit: GitCommand = git,
  requiredHeadSha?: string,
): UpdatesSnapshot {
  const shallow = runGit(["rev-parse", "--is-shallow-repository"]);
  if (shallow !== "false") {
    throw new Error("Local Git history is shallow.");
  }

  const mainRef = `refs/remotes/origin/${updatesBranch}`;
  const headSha = requiredHeadSha ?? runGit(["rev-parse", mainRef]);
  const log = runGit([
    "log",
    headSha,
    "-z",
    "--format=%H%x00%P%x00%cI%x00%s",
  ]);
  const commits = parseLocalGitLog(log).map((commit) => {
    const firstParent = commit.parentShas[0];
    const numstat = firstParent
      ? runGit([
          "diff",
          "--find-renames",
          "--numstat",
          "-z",
          firstParent,
          commit.sha,
        ])
      : runGit([
          "diff-tree",
          "--root",
          "--no-commit-id",
          "--find-renames",
          "--numstat",
          "-z",
          commit.sha,
        ]);
    return {
      sha: commit.sha,
      committedAt: commit.committedAt,
      subject: commit.subject,
      ...parseLocalNumstat(numstat),
    };
  });
  return createUpdatesSnapshot(headSha, commits);
}

function completeShallowLocalHistory(runGit: GitCommand): void {
  const shallow = runGit(["rev-parse", "--is-shallow-repository"]);
  if (shallow !== "true") return;

  runGit([
    "-c",
    "credential.helper=",
    "-c",
    "http.extraHeader=",
    "fetch",
    "--unshallow",
    "--no-tags",
    "--no-recurse-submodules",
    "origin",
    `+refs/heads/${updatesBranch}:refs/remotes/origin/${updatesBranch}`,
  ]);
}

type GitHubRefResponse = {
  object?: {
    sha?: string;
  };
};

type GitHubCommitResponse = {
  sha?: string;
  commit?: {
    message?: string;
    committer?: { date?: string | null } | null;
    author?: { date?: string | null } | null;
  };
};

type GitHubCommitDetailResponse = {
  sha?: string;
  stats?: {
    additions?: number;
    deletions?: number;
  } | null;
  files?: Array<{
    filename?: string;
  }>;
};

type GitHubCommitMetadata = Pick<
  UpdateCommitInput,
  "sha" | "committedAt" | "subject"
>;

function githubHeaders(authToken?: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "coherence-thesis-updates",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
}

async function fetchGitHubJson(
  url: string,
  fetcher: FetchCommand,
  authToken?: string,
): Promise<{ value: unknown; link: string | null }> {
  const response = await fetcher(url, {
    headers: githubHeaders(authToken),
    signal: AbortSignal.timeout(githubRequestTimeoutMs),
  });
  if (!response.ok) {
    throw new Error(`GitHub updates request failed with ${response.status}: ${url}`);
  }
  return {
    value: await response.json(),
    link: response.headers.get("link"),
  };
}

function nextGithubPage(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    const match = part.trim().match(/^<([^>]+)>;\s*rel="([^"]+)"$/);
    if (match?.[2] === "next") return match[1] ?? null;
  }
  return null;
}

function parseGitHubCommit(value: unknown): GitHubCommitMetadata {
  const commit = value as GitHubCommitResponse;
  const sha = commit?.sha;
  const committedAt =
    commit?.commit?.committer?.date ?? commit?.commit?.author?.date;
  const message = commit?.commit?.message;
  if (!sha || !committedAt || !message) {
    throw new Error("GitHub returned an incomplete updates commit.");
  }
  const [subject = ""] = message.replace(/\r\n/g, "\n").split("\n", 1);
  return { sha, committedAt, subject };
}

function parseGitHubChangeCount(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`GitHub returned an invalid ${label}.`);
  }
  return value as number;
}

async function fetchGitHubCommitStats(
  sha: string,
  fetcher: FetchCommand,
  authToken?: string,
): Promise<Pick<UpdateCommitInput, "filesChanged" | "additions" | "deletions">> {
  let pageUrl: string | null = `${githubApiRoot}/commits/${sha}`;
  const visitedUrls = new Set<string>();
  const filenames = new Set<string>();
  let additions: number | undefined;
  let deletions: number | undefined;

  while (pageUrl) {
    if (visitedUrls.has(pageUrl) || visitedUrls.size >= maxGithubPages) {
      throw new Error("GitHub commit file pagination did not terminate safely.");
    }
    visitedUrls.add(pageUrl);

    const page = await fetchGitHubJson(pageUrl, fetcher, authToken);
    const detail = page.value as GitHubCommitDetailResponse;
    if (detail?.sha !== sha || !detail.stats || !Array.isArray(detail.files)) {
      throw new Error(`GitHub returned incomplete change stats for ${sha}.`);
    }

    const pageAdditions = parseGitHubChangeCount(
      detail.stats.additions,
      `addition count for ${sha}`,
    );
    const pageDeletions = parseGitHubChangeCount(
      detail.stats.deletions,
      `deletion count for ${sha}`,
    );
    if (
      (additions !== undefined && additions !== pageAdditions) ||
      (deletions !== undefined && deletions !== pageDeletions)
    ) {
      throw new Error(`GitHub returned inconsistent change stats for ${sha}.`);
    }
    additions = pageAdditions;
    deletions = pageDeletions;

    for (const file of detail.files) {
      if (!file?.filename) {
        throw new Error(`GitHub returned an invalid changed file for ${sha}.`);
      }
      filenames.add(file.filename);
    }
    pageUrl = nextGithubPage(page.link);
  }

  if (additions === undefined || deletions === undefined) {
    throw new Error(`GitHub did not return change stats for ${sha}.`);
  }
  if (filenames.size >= maxGithubCommitFiles) {
    throw new Error(`GitHub may have truncated changed files for ${sha}.`);
  }

  return {
    filesChanged: filenames.size,
    additions,
    deletions,
  };
}

export async function fetchGitHubSnapshot(
  fetcher: FetchCommand = fetch,
  authToken?: string,
  existingSnapshot?: unknown,
  requiredHeadSha?: string,
): Promise<UpdatesSnapshot> {
  let headSha = requiredHeadSha;
  if (!headSha) {
    const refUrl = `${githubApiRoot}/git/ref/heads/${updatesBranch}`;
    const refResponse = await fetchGitHubJson(refUrl, fetcher, authToken);
    headSha = (refResponse.value as GitHubRefResponse)?.object?.sha;
  }
  if (!headSha) {
    throw new Error("GitHub did not return the main branch head SHA.");
  }

  let pageUrl: string | null = `${githubApiRoot}/commits?sha=${headSha}&per_page=${githubPageSize}`;
  const visitedUrls = new Set<string>();
  const commitMetadata: GitHubCommitMetadata[] = [];

  while (pageUrl) {
    if (visitedUrls.has(pageUrl) || visitedUrls.size >= maxGithubPages) {
      throw new Error("GitHub updates pagination did not terminate safely.");
    }
    visitedUrls.add(pageUrl);

    const page = await fetchGitHubJson(pageUrl, fetcher, authToken);
    if (!Array.isArray(page.value)) {
      throw new Error("GitHub returned an invalid updates page.");
    }
    commitMetadata.push(...page.value.map(parseGitHubCommit));
    pageUrl = nextGithubPage(page.link);
  }

  let reusableSnapshot: UpdatesSnapshot | undefined;
  try {
    reusableSnapshot = parseUpdatesSnapshot(existingSnapshot);
  } catch {
    reusableSnapshot = undefined;
  }
  const reusableCommits = new Map(
    reusableSnapshot?.commits.map((commit) => [commit.sha, commit]),
  );
  const commits: UpdateCommitInput[] = [];
  for (const commit of commitMetadata) {
    const reusable = reusableCommits.get(commit.sha);
    const stats = reusable
      ? {
          filesChanged: reusable.filesChanged,
          additions: reusable.additions,
          deletions: reusable.deletions,
        }
      : await fetchGitHubCommitStats(commit.sha, fetcher, authToken);
    commits.push({ ...commit, ...stats });
  }

  return createUpdatesSnapshot(headSha, commits);
}

export async function generateUpdatesSnapshot({
  runGit = git,
  fetcher = fetch,
  authToken,
  existingSnapshot,
  requiredHeadSha,
}: {
  runGit?: GitCommand;
  fetcher?: FetchCommand;
  authToken?: string;
  existingSnapshot?: unknown;
  requiredHeadSha?: string;
} = {}): Promise<UpdatesGenerationResult> {
  const failures: Error[] = [];

  const acceptRequiredHead = (
    snapshot: UpdatesSnapshot,
    source: UpdatesSnapshotSource,
  ): UpdatesSnapshot => {
    if (requiredHeadSha && snapshot.headSha !== requiredHeadSha) {
      throw new Error(
        `The ${source} updates head ${snapshot.headSha} does not match required main head ${requiredHeadSha}.`,
      );
    }
    return snapshot;
  };

  try {
    completeShallowLocalHistory(runGit);
    return {
      snapshot: acceptRequiredHead(
        readCompleteLocalSnapshot(runGit, requiredHeadSha),
        "local-git",
      ),
      source: "local-git",
      failures,
    };
  } catch (error) {
    failures.push(toError(error));
  }

  try {
    return {
      snapshot: acceptRequiredHead(
        await fetchGitHubSnapshot(
          fetcher,
          authToken,
          existingSnapshot,
          requiredHeadSha,
        ),
        "github",
      ),
      source: "github",
      failures,
    };
  } catch (error) {
    failures.push(toError(error));
  }

  if (!requiredHeadSha) {
    try {
      return {
        snapshot: parseUpdatesSnapshot(existingSnapshot),
        source: "snapshot",
        failures,
      };
    } catch (error) {
      failures.push(toError(error));
    }
  } else {
    failures.push(
      new Error(
        `A fresh Updates snapshot is required for main head ${requiredHeadSha}; checked snapshot fallback is disabled.`,
      ),
    );
  }

  throw new AggregateError(
    failures,
    "Unable to compile complete updates from Git, GitHub, or the snapshot.",
  );
}
