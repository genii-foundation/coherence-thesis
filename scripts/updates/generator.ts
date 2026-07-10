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

const fieldSeparator = "\u001f";
const recordSeparator = "\u001e";
const githubApiRoot = `https://api.github.com/repos/${updatesRepository}`;
const githubPageSize = 100;
const githubRequestTimeoutMs = 15_000;
const maxGithubPages = 1_000;

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export function parseLocalGitLog(value: string): UpdateCommitInput[] {
  return value
    .split(recordSeparator)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, committedAt, ...subjectParts] = record.split(fieldSeparator);
      const subject = subjectParts.join(fieldSeparator);
      if (!sha || !committedAt || !subject) {
        throw new Error("Local Git returned an incomplete updates record.");
      }
      return { sha, committedAt, subject };
    });
}

export function readCompleteLocalSnapshot(
  runGit: GitCommand = git,
): UpdatesSnapshot {
  const shallow = runGit(["rev-parse", "--is-shallow-repository"]);
  if (shallow !== "false") {
    throw new Error("Local Git history is shallow.");
  }

  const mainRef = `refs/remotes/origin/${updatesBranch}`;
  const headSha = runGit(["rev-parse", mainRef]);
  const log = runGit([
    "log",
    headSha,
    `--format=%H%x1f%cI%x1f%s%x1e`,
  ]);
  return createUpdatesSnapshot(headSha, parseLocalGitLog(log));
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

function parseGitHubCommit(value: unknown): UpdateCommitInput {
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

export async function fetchGitHubSnapshot(
  fetcher: FetchCommand = fetch,
  authToken?: string,
): Promise<UpdatesSnapshot> {
  const refUrl = `${githubApiRoot}/git/ref/heads/${updatesBranch}`;
  const refResponse = await fetchGitHubJson(refUrl, fetcher, authToken);
  const headSha = (refResponse.value as GitHubRefResponse)?.object?.sha;
  if (!headSha) {
    throw new Error("GitHub did not return the main branch head SHA.");
  }

  let pageUrl: string | null = `${githubApiRoot}/commits?sha=${headSha}&per_page=${githubPageSize}`;
  const visitedUrls = new Set<string>();
  const commits: UpdateCommitInput[] = [];

  while (pageUrl) {
    if (visitedUrls.has(pageUrl) || visitedUrls.size >= maxGithubPages) {
      throw new Error("GitHub updates pagination did not terminate safely.");
    }
    visitedUrls.add(pageUrl);

    const page = await fetchGitHubJson(pageUrl, fetcher, authToken);
    if (!Array.isArray(page.value)) {
      throw new Error("GitHub returned an invalid updates page.");
    }
    commits.push(...page.value.map(parseGitHubCommit));
    pageUrl = nextGithubPage(page.link);
  }

  return createUpdatesSnapshot(headSha, commits);
}

export async function generateUpdatesSnapshot({
  runGit = git,
  fetcher = fetch,
  authToken,
  existingSnapshot,
}: {
  runGit?: GitCommand;
  fetcher?: FetchCommand;
  authToken?: string;
  existingSnapshot?: unknown;
} = {}): Promise<UpdatesGenerationResult> {
  const failures: Error[] = [];

  try {
    return {
      snapshot: readCompleteLocalSnapshot(runGit),
      source: "local-git",
      failures,
    };
  } catch (error) {
    failures.push(toError(error));
  }

  try {
    return {
      snapshot: await fetchGitHubSnapshot(fetcher, authToken),
      source: "github",
      failures,
    };
  } catch (error) {
    failures.push(toError(error));
  }

  try {
    return {
      snapshot: parseUpdatesSnapshot(existingSnapshot),
      source: "snapshot",
      failures,
    };
  } catch (error) {
    failures.push(toError(error));
  }

  throw new AggregateError(
    failures,
    "Unable to compile complete updates from Git, GitHub, or the snapshot.",
  );
}
