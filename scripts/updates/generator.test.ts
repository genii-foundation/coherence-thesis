import { describe, expect, it, vi } from "vitest";
import { createUpdatesSnapshot } from "../../src/lib/updates";
import {
  enrichUpdatesSnapshotDeployments,
  fetchGitHubSnapshot,
  generateUpdatesSnapshot,
  getRequiredUpdatesHeadSha,
  parseLocalGitLog,
  parseLocalNumstat,
  readCompleteLocalSnapshot,
  shouldRefreshUpdateDeployments,
  type FetchCommand,
  type GitCommand,
} from "./generator";

const headSha = "b".repeat(40);
const olderSha = "a".repeat(40);
const mergeSha = "d".repeat(40);
const sideSha = "c".repeat(40);
const headDate = "2026-07-10T17:33:35.000Z";
const olderDate = "2026-07-09T17:33:35.000Z";
const pageOneUrl = `https://api.github.com/repos/providence-collective/coherence-thesis/commits?sha=${headSha}&per_page=100`;
const pageTwoUrl = `${pageOneUrl}&page=2`;
const headDetailUrl = `https://api.github.com/repos/providence-collective/coherence-thesis/commits/${headSha}`;
const olderDetailUrl = `https://api.github.com/repos/providence-collective/coherence-thesis/commits/${olderSha}`;

function localGit(): GitCommand {
  return (args) => {
    if (args.join(" ") === "rev-parse --is-shallow-repository") {
      return "false";
    }
    if (args.join(" ") === "rev-parse refs/remotes/origin/main") {
      return headSha;
    }
    if (args[0] === "log" && args[1] === headSha) {
      return [
        `${headSha}\0${olderSha}\0${headDate}\0feat: add updates\0`,
        `${olderSha}\0\0${olderDate}\0fix: repair history\0`,
      ].join("");
    }
    if (args[0] === "diff" && args.at(-1) === headSha) {
      return `10\t2\tsrc/updates.ts\0-\t-\tpublic/preview.png\0`;
    }
    if (args[0] === "diff-tree" && args.at(-1) === olderSha) {
      return `3\t1\tsrc/history.ts\0`;
    }
    throw new Error(`Unexpected Git command: ${args.join(" ")}`);
  };
}

function githubCommitDetail(
  sha: string,
  additions: number,
  deletions: number,
  filenames: Array<
    string | { filename: string; previous_filename?: string }
  >,
) {
  return {
    sha,
    stats: { additions, deletions, total: additions + deletions },
    files: filenames.map((filename) =>
      typeof filename === "string" ? { filename } : filename,
    ),
  };
}

function githubCommit(sha: string, date: string, message: string) {
  return {
    sha,
    commit: {
      message,
      committer: { date },
      author: { date },
    },
  };
}

function jsonResponse(
  value: unknown,
  { status = 200, link }: { status?: number; link?: string } = {},
): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json",
      ...(link ? { link } : {}),
    },
  });
}

describe("updates snapshot generator", () => {
  it("always refreshes links for production publications", () => {
    expect(
      shouldRefreshUpdateDeployments({
        VERCEL_ENV: "production",
        UPDATES_REFRESH_DEPLOYMENTS: "false",
      }),
    ).toBe(true);
    expect(
      shouldRefreshUpdateDeployments({
        VERCEL_ENV: "preview",
        UPDATES_REFRESH_DEPLOYMENTS: "true",
      }),
    ).toBe(false);
    expect(
      shouldRefreshUpdateDeployments({
        CI: "true",
        UPDATES_REFRESH_DEPLOYMENTS: "false",
      }),
    ).toBe(false);
  });

  it("requires the deployed main head in production environments", () => {
    expect(
      getRequiredUpdatesHeadSha({
        UPDATES_REQUIRED_HEAD_SHA: headSha,
        GITHUB_REF: "refs/heads/main",
        GITHUB_SHA: olderSha,
      }),
    ).toBe(headSha);
    expect(
      getRequiredUpdatesHeadSha({
        GITHUB_REF: "refs/heads/main",
        GITHUB_SHA: headSha,
      }),
    ).toBe(headSha);
    expect(
      getRequiredUpdatesHeadSha({
        VERCEL_ENV: "production",
        VERCEL_GIT_COMMIT_REF: "main",
        VERCEL_GIT_COMMIT_SHA: headSha,
      }),
    ).toBe(headSha);
    expect(
      getRequiredUpdatesHeadSha({
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: "feat/example",
        VERCEL_GIT_COMMIT_SHA: headSha,
      }),
    ).toBeUndefined();
  });

  it("reads a complete local main history", () => {
    const snapshot = readCompleteLocalSnapshot(localGit());

    expect(snapshot.headSha).toBe(headSha);
    expect(snapshot.commits.map((commit) => commit.sha)).toEqual([
      headSha,
      olderSha,
    ]);
    expect(snapshot.commits[0]).toMatchObject({
      filesChanged: 2,
      additions: 10,
      deletions: 2,
    });
  });

  it("parses binary files, renames, and control characters safely", () => {
    const log =
      `${headSha}\0${olderSha} ${sideSha}\0${headDate}\0` +
      `feat: add \u001e updates\0`;
    const numstat = [
      `-\t-\tpublic/binary.png\0`,
      `4\t2\t\0old\nname.ts\0new\tname.ts\0`,
      `1\t0\tsrc/\u001efile.ts\0`,
    ].join("");

    expect(parseLocalGitLog(log)).toEqual([
      {
        sha: headSha,
        parentShas: [olderSha, sideSha],
        committedAt: headDate,
        subject: "feat: add \u001e updates",
      },
    ]);
    expect(parseLocalNumstat(numstat)).toEqual({
      filesChanged: 3,
      additions: 5,
      deletions: 2,
      isLiterary: false,
    });
  });

  it("marks mixed and renamed manuscript changes as literary", () => {
    const numstat = [
      `7\t2\tsrc/reader.ts\0`,
      `4\t1\t\0sources/manuscripts/one.md\0archive/one.md\0`,
      `3\t2\tcontent/manuscripts/two.json\0`,
    ].join("");

    expect(parseLocalNumstat(numstat)).toEqual({
      filesChanged: 3,
      additions: 14,
      deletions: 5,
      isLiterary: true,
    });
  });

  it("calculates merge changes against the first parent", () => {
    const commands: string[][] = [];
    const runGit: GitCommand = (args) => {
      commands.push(args);
      if (args.join(" ") === "rev-parse --is-shallow-repository") {
        return "false";
      }
      if (args.join(" ") === "rev-parse refs/remotes/origin/main") {
        return mergeSha;
      }
      if (args[0] === "log") {
        return `${mergeSha}\0${headSha} ${sideSha}\0${headDate}\0Merge release branch\0`;
      }
      if (args[0] === "diff") {
        return `8\t3\tsrc/merged.ts\0`;
      }
      throw new Error(`Unexpected Git command: ${args.join(" ")}`);
    };

    const snapshot = readCompleteLocalSnapshot(runGit);

    expect(snapshot.commits[0]).toMatchObject({
      sha: mergeSha,
      filesChanged: 1,
      additions: 8,
      deletions: 3,
    });
    expect(commands).toContainEqual([
      "diff",
      "--find-renames",
      "--numstat",
      "-z",
      headSha,
      mergeSha,
    ]);
  });

  it("rejects a shallow local history", () => {
    expect(() =>
      readCompleteLocalSnapshot(() => "true"),
    ).toThrow("Local Git history is shallow.");
  });

  it("deepens shallow history before using the GitHub API", async () => {
    let shallow = true;
    let githubRequested = false;
    const fetchCommands: string[][] = [];
    const completeGit = localGit();
    const runGit: GitCommand = (args) => {
      if (args.join(" ") === "rev-parse --is-shallow-repository") {
        return shallow ? "true" : "false";
      }
      if (args.includes("fetch")) {
        fetchCommands.push(args);
        shallow = false;
        return "";
      }
      return completeGit(args);
    };

    const result = await generateUpdatesSnapshot({
      runGit,
      fetcher: async () => {
        githubRequested = true;
        return jsonResponse({ message: "unexpected" }, { status: 500 });
      },
      requiredHeadSha: headSha,
    });

    expect(result.source).toBe("local-git");
    expect(result.snapshot.headSha).toBe(headSha);
    expect(githubRequested).toBe(false);
    expect(fetchCommands).toEqual([
      [
        "-c",
        "credential.helper=",
        "-c",
        "http.extraHeader=",
        "-c",
        "http.https://github.com/.extraheader=",
        "fetch",
        "--unshallow",
        "--no-tags",
        "--no-recurse-submodules",
        "https://github.com/providence-collective/coherence-thesis.git",
        "+refs/heads/main:refs/remotes/origin/main",
      ],
    ]);
  });

  it("pins the GitHub head before paginating and matches local output", async () => {
    const requestedUrls: string[] = [];
    const fetcher: FetchCommand = async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.endsWith("/git/ref/heads/main")) {
        return jsonResponse({ object: { sha: headSha } });
      }
      if (url === pageOneUrl) {
        return jsonResponse(
          [githubCommit(headSha, headDate, "feat: add updates\n\nBody")],
          { link: `<${pageTwoUrl}>; rel="next"` },
        );
      }
      if (url === pageTwoUrl) {
        return jsonResponse([
          githubCommit(olderSha, olderDate, "fix: repair history"),
        ]);
      }
      if (url === headDetailUrl) {
        return jsonResponse(
          githubCommitDetail(headSha, 10, 2, [
            "src/updates.ts",
            "public/preview.png",
          ]),
        );
      }
      if (url === olderDetailUrl) {
        return jsonResponse(
          githubCommitDetail(olderSha, 3, 1, ["src/history.ts"]),
        );
      }
      return jsonResponse({ message: "not found" }, { status: 404 });
    };

    const apiSnapshot = await fetchGitHubSnapshot(fetcher, "token");

    expect(apiSnapshot).toEqual(readCompleteLocalSnapshot(localGit()));
    expect(requestedUrls).toEqual([
      "https://api.github.com/repos/providence-collective/coherence-thesis/git/ref/heads/main",
      pageOneUrl,
      pageTwoUrl,
      headDetailUrl,
      olderDetailUrl,
    ]);
  });

  it("reuses immutable snapshot stats without commit detail requests", async () => {
    const requestedUrls: string[] = [];
    const fetcher: FetchCommand = async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.endsWith("/git/ref/heads/main")) {
        return jsonResponse({ object: { sha: headSha } });
      }
      if (url === pageOneUrl) {
        return jsonResponse([
          githubCommit(headSha, headDate, "feat: add updates"),
          githubCommit(olderSha, olderDate, "fix: repair history"),
        ]);
      }
      return jsonResponse({ message: "unexpected" }, { status: 500 });
    };
    const existingSnapshot = readCompleteLocalSnapshot(localGit());

    await expect(
      fetchGitHubSnapshot(fetcher, "token", existingSnapshot),
    ).resolves.toEqual(existingSnapshot);
    expect(requestedUrls).toEqual([
      "https://api.github.com/repos/providence-collective/coherence-thesis/git/ref/heads/main",
      pageOneUrl,
    ]);
  });

  it("follows every changed-file page for a new commit", async () => {
    const detailPageTwoUrl = `${headDetailUrl}?page=2`;
    const existingSnapshot = createUpdatesSnapshot(olderSha, [
      {
        sha: olderSha,
        committedAt: olderDate,
        subject: "fix: repair history",
        filesChanged: 1,
        additions: 3,
        deletions: 1,
      },
    ]);
    const fetcher: FetchCommand = async (input) => {
      const url = String(input);
      if (url.endsWith("/git/ref/heads/main")) {
        return jsonResponse({ object: { sha: headSha } });
      }
      if (url === pageOneUrl) {
        return jsonResponse([
          githubCommit(headSha, headDate, "feat: add updates"),
          githubCommit(olderSha, olderDate, "fix: repair history"),
        ]);
      }
      if (url === headDetailUrl) {
        return jsonResponse(
          githubCommitDetail(headSha, 10, 2, ["src/updates.ts"]),
          { link: `<${detailPageTwoUrl}>; rel="next"` },
        );
      }
      if (url === detailPageTwoUrl) {
        return jsonResponse(
          githubCommitDetail(headSha, 10, 2, [
            {
              filename: "archive/opening.md",
              previous_filename: "sources/manuscripts/opening.md",
            },
          ]),
        );
      }
      return jsonResponse({ message: "unexpected" }, { status: 500 });
    };

    const snapshot = await fetchGitHubSnapshot(
      fetcher,
      "token",
      existingSnapshot,
    );

    expect(snapshot.commits[0]).toMatchObject({
      filesChanged: 2,
      additions: 10,
      deletions: 2,
      isLiterary: true,
    });
  });

  it("refreshes one future main commit from a shallow deployment cache", async () => {
    const requestedUrls: string[] = [];
    const existingSnapshot = createUpdatesSnapshot(olderSha, [
      {
        sha: olderSha,
        committedAt: olderDate,
        subject: "fix: repair history",
        filesChanged: 1,
        additions: 3,
        deletions: 1,
      },
    ]);
    const fetcher: FetchCommand = async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.endsWith("/git/ref/heads/main")) {
        return jsonResponse({ object: { sha: headSha } });
      }
      if (url === pageOneUrl) {
        return jsonResponse([
          githubCommit(headSha, headDate, "feat: add updates"),
          githubCommit(olderSha, olderDate, "fix: repair history"),
        ]);
      }
      if (url === headDetailUrl) {
        return jsonResponse(
          githubCommitDetail(headSha, 10, 2, ["src/updates.ts"]),
        );
      }
      return jsonResponse({ message: "unexpected" }, { status: 500 });
    };

    const result = await generateUpdatesSnapshot({
      runGit: () => "true",
      fetcher,
      existingSnapshot,
    });

    expect(result.source).toBe("github");
    expect(result.snapshot.headSha).toBe(headSha);
    expect(requestedUrls).toEqual([
      "https://api.github.com/repos/providence-collective/coherence-thesis/git/ref/heads/main",
      pageOneUrl,
      headDetailUrl,
    ]);
  });

  it("pins a required head and rejects stale snapshot fallback", async () => {
    const existingSnapshot = createUpdatesSnapshot(olderSha, [
      {
        sha: olderSha,
        committedAt: olderDate,
        subject: "fix: repair history",
        filesChanged: 1,
        additions: 3,
        deletions: 1,
      },
    ]);
    const requestedUrls: string[] = [];
    const fetcher: FetchCommand = async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url === pageOneUrl) {
        return jsonResponse([
          githubCommit(headSha, headDate, "feat: add updates"),
          githubCommit(olderSha, olderDate, "fix: repair history"),
        ]);
      }
      if (url === headDetailUrl) {
        return jsonResponse(
          githubCommitDetail(headSha, 10, 2, ["src/updates.ts"]),
        );
      }
      return jsonResponse({ message: "unexpected" }, { status: 500 });
    };

    const result = await generateUpdatesSnapshot({
      runGit: () => "true",
      fetcher,
      existingSnapshot,
      requiredHeadSha: headSha,
    });

    expect(result.source).toBe("github");
    expect(result.snapshot.headSha).toBe(headSha);
    expect(requestedUrls).toEqual([pageOneUrl, headDetailUrl]);

    await expect(
      generateUpdatesSnapshot({
        runGit: () => "true",
        fetcher: async () =>
          jsonResponse({ message: "unavailable" }, { status: 503 }),
        existingSnapshot,
        requiredHeadSha: headSha,
      }),
    ).rejects.toThrow(
      "Unable to compile complete updates from Git, GitHub, or the snapshot.",
    );
  });

  it("trusts the current production URL and discovers exact successful deployments", async () => {
    const currentUrl =
      "https://coherence-thesis-current-aubreyfs-projects.vercel.app";
    const historicalUrl =
      "https://coherence-thesis-historical-aubreyfs-projects.vercel.app";
    const deploymentsUrl =
      `https://api.github.com/repos/providence-collective/coherence-thesis/deployments` +
      `?sha=${olderSha}&environment=Production&per_page=100`;
    const statusesUrl =
      "https://api.github.com/repos/providence-collective/coherence-thesis/deployments/17/statuses?per_page=100";
    const requests: Array<{ url: string; method: string }> = [];
    const fetcher: FetchCommand = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push({ url, method });
      if (url === deploymentsUrl) {
        return jsonResponse([
          { id: 17, sha: olderSha, environment: "Production" },
          { id: 18, sha: headSha, environment: "Production" },
        ]);
      }
      if (url === statusesUrl) {
        return jsonResponse([
          { state: "success", environment_url: historicalUrl },
        ]);
      }
      if (url === `${historicalUrl}/` && method === "HEAD") {
        return new Response(null, { status: 200 });
      }
      return jsonResponse({ message: "unexpected" }, { status: 500 });
    };
    const snapshot = createUpdatesSnapshot(headSha, [
      {
        sha: headSha,
        committedAt: headDate,
        subject: "feat: current",
        filesChanged: 1,
        additions: 2,
        deletions: 0,
      },
      {
        sha: olderSha,
        committedAt: olderDate,
        subject: "edit: historical",
        filesChanged: 1,
        additions: 3,
        deletions: 1,
        isLiterary: true,
      },
    ]);

    const enriched = await enrichUpdatesSnapshotDeployments(snapshot, {
      fetcher,
      environment: {
        VERCEL_ENV: "production",
        VERCEL_GIT_COMMIT_REF: "main",
        VERCEL_GIT_COMMIT_SHA: headSha,
        VERCEL_URL:
          "coherence-thesis-current-aubreyfs-projects.vercel.app",
      },
    });

    expect(enriched.commits).toEqual([
      expect.objectContaining({ sha: headSha, deploymentUrl: currentUrl }),
      expect.objectContaining({
        sha: olderSha,
        deploymentUrl: historicalUrl,
        isLiterary: true,
      }),
    ]);
    expect(requests).toEqual([
      { url: deploymentsUrl, method: "GET" },
      { url: statusesUrl, method: "GET" },
      { url: `${historicalUrl}/`, method: "HEAD" },
    ]);
  });

  it("removes definitively unavailable cached links but preserves transient ones", async () => {
    const unavailableUrl =
      "https://coherence-thesis-missing-aubreyfs-projects.vercel.app";
    const transientUrl =
      "https://coherence-thesis-transient-aubreyfs-projects.vercel.app";
    const deploymentsUrl =
      `https://api.github.com/repos/providence-collective/coherence-thesis/deployments` +
      `?sha=${headSha}&environment=Production&per_page=100`;
    const snapshot = createUpdatesSnapshot(headSha, [
      {
        sha: headSha,
        committedAt: headDate,
        subject: "feat: current",
        filesChanged: 1,
        additions: 2,
        deletions: 0,
      },
      {
        sha: olderSha,
        committedAt: olderDate,
        subject: "fix: historical",
        filesChanged: 1,
        additions: 3,
        deletions: 1,
      },
    ]);
    const cached = createUpdatesSnapshot(headSha, [
      {
        ...snapshot.commits[0]!,
        deploymentUrl: unavailableUrl,
      },
      {
        ...snapshot.commits[1]!,
        deploymentUrl: transientUrl,
      },
    ]);
    const fetcher: FetchCommand = async (input, init) => {
      const url = String(input);
      if (init?.method === "HEAD" && url === `${unavailableUrl}/`) {
        return new Response(null, { status: 404 });
      }
      if (init?.method === "HEAD" && url === `${transientUrl}/`) {
        return new Response(null, { status: 503 });
      }
      if (url === deploymentsUrl) return jsonResponse([]);
      return jsonResponse({ message: "unexpected" }, { status: 500 });
    };

    const enriched = await enrichUpdatesSnapshotDeployments(snapshot, {
      fetcher,
      existingSnapshot: cached,
      environment: {},
    });

    expect(enriched.commits[0]?.deploymentUrl).toBeUndefined();
    expect(enriched.commits[1]?.deploymentUrl).toBe(transientUrl);
  });

  it("revalidates every cached link before applying the discovery budget", async () => {
    const commits = Array.from({ length: 9 }, (_, index) => ({
      sha: index.toString(16).padStart(40, "0"),
      committedAt: `2026-07-${String(10 - index).padStart(2, "0")}T17:33:35.000Z`,
      subject: `fix: cached deployment ${index}`,
      filesChanged: 1,
      additions: 1,
      deletions: 0,
    }));
    const snapshot = createUpdatesSnapshot(commits[0]!.sha, commits);
    const cached = createUpdatesSnapshot(
      snapshot.headSha,
      snapshot.commits.map((commit, index) => ({
        ...commit,
        deploymentUrl: `https://coherence-thesis-cache${index}-aubreyfs-projects.vercel.app`,
      })),
    );
    const requestedUrls: string[] = [];
    const dateNow = vi.spyOn(Date, "now").mockReturnValueOnce(0);

    try {
      const enriched = await enrichUpdatesSnapshotDeployments(snapshot, {
        existingSnapshot: cached,
        fetcher: async (input, init) => {
          if (init?.method !== "HEAD") {
            return jsonResponse({ message: "unexpected" }, { status: 500 });
          }
          requestedUrls.push(String(input));
          return new Response(null, { status: 200 });
        },
      });

      expect(requestedUrls).toEqual(
        cached.commits.map((commit) => `${commit.deploymentUrl}/`),
      );
      expect(enriched.commits.every((commit) => commit.deploymentUrl)).toBe(true);
    } finally {
      dateNow.mockRestore();
    }
  });

  it("preserves cached links without network access when refresh is disabled", async () => {
    const deploymentUrl = "https://coherence-thesis-cached-aubreyfs-projects.vercel.app";
    const snapshot = createUpdatesSnapshot(headSha, [
      {
        sha: headSha,
        committedAt: headDate,
        subject: "feat: current",
        filesChanged: 1,
        additions: 2,
        deletions: 0,
      },
    ]);
    const cached = createUpdatesSnapshot(headSha, [
      {
        ...snapshot.commits[0]!,
        deploymentUrl,
      },
    ]);
    let requested = false;

    const enriched = await enrichUpdatesSnapshotDeployments(snapshot, {
      existingSnapshot: cached,
      fetcher: async () => {
        requested = true;
        return jsonResponse({ message: "unexpected" }, { status: 500 });
      },
      refreshDeployments: false,
    });

    expect(enriched.commits[0]?.deploymentUrl).toBe(deploymentUrl);
    expect(requested).toBe(false);
  });

  it("discards a partial GitHub refresh and keeps a valid snapshot", async () => {
    const existingSnapshot = createUpdatesSnapshot(headSha, [
      {
        sha: headSha,
        committedAt: headDate,
        subject: "feat: add updates",
        filesChanged: 2,
        additions: 10,
        deletions: 2,
      },
      {
        sha: olderSha,
        committedAt: olderDate,
        subject: "fix: repair history",
        filesChanged: 1,
        additions: 3,
        deletions: 1,
      },
    ]);
    const fetcher: FetchCommand = async (input) => {
      const url = String(input);
      if (url.endsWith("/git/ref/heads/main")) {
        return jsonResponse({ object: { sha: headSha } });
      }
      if (url === pageOneUrl) {
        return jsonResponse(
          [githubCommit(headSha, headDate, "feat: add updates")],
          { link: `<${pageTwoUrl}>; rel="next"` },
        );
      }
      return jsonResponse({ message: "rate limited" }, { status: 403 });
    };
    const result = await generateUpdatesSnapshot({
      runGit: () => "true",
      fetcher,
      existingSnapshot,
    });

    expect(result.source).toBe("snapshot");
    expect(result.snapshot).toEqual(existingSnapshot);
    expect(result.failures.map((failure) => failure.message)).toEqual([
      "Local Git history is shallow.",
      `GitHub updates request failed with 403: ${pageTwoUrl}`,
    ]);
  });

  it("fails loudly when no complete source or valid snapshot exists", async () => {
    const fetcher: FetchCommand = async () =>
      jsonResponse({ message: "unavailable" }, { status: 503 });

    await expect(
      generateUpdatesSnapshot({
        runGit: () => "true",
        fetcher,
        existingSnapshot: null,
      }),
    ).rejects.toThrow(
      "Unable to compile complete updates from Git, GitHub, or the snapshot.",
    );
  });
});
