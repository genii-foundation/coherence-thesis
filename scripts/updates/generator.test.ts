import { describe, expect, it } from "vitest";
import { createUpdatesSnapshot } from "../../src/lib/updates";
import {
  fetchGitHubSnapshot,
  generateUpdatesSnapshot,
  readCompleteLocalSnapshot,
  type FetchCommand,
  type GitCommand,
} from "./generator";

const headSha = "b".repeat(40);
const olderSha = "a".repeat(40);
const headDate = "2026-07-10T17:33:35.000Z";
const olderDate = "2026-07-09T17:33:35.000Z";
const pageOneUrl = `https://api.github.com/repos/providence-collective/coherence-thesis/commits?sha=${headSha}&per_page=100`;
const pageTwoUrl = `${pageOneUrl}&page=2`;

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
        `${headSha}\u001f${headDate}\u001ffeat: add updates\u001e`,
        `${olderSha}\u001f${olderDate}\u001ffix: repair history\u001e`,
      ].join("\n");
    }
    throw new Error(`Unexpected Git command: ${args.join(" ")}`);
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
  it("reads a complete local main history", () => {
    const snapshot = readCompleteLocalSnapshot(localGit());

    expect(snapshot.headSha).toBe(headSha);
    expect(snapshot.commits.map((commit) => commit.sha)).toEqual([
      headSha,
      olderSha,
    ]);
  });

  it("rejects a shallow local history", () => {
    expect(() =>
      readCompleteLocalSnapshot(() => "true"),
    ).toThrow("Local Git history is shallow.");
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
      return jsonResponse({ message: "not found" }, { status: 404 });
    };

    const apiSnapshot = await fetchGitHubSnapshot(fetcher, "token");

    expect(apiSnapshot).toEqual(readCompleteLocalSnapshot(localGit()));
    expect(requestedUrls).toEqual([
      "https://api.github.com/repos/providence-collective/coherence-thesis/git/ref/heads/main",
      pageOneUrl,
      pageTwoUrl,
    ]);
  });

  it("discards a partial GitHub refresh and keeps a valid snapshot", async () => {
    const existingSnapshot = createUpdatesSnapshot(headSha, [
      {
        sha: headSha,
        committedAt: headDate,
        subject: "feat: add updates",
      },
      {
        sha: olderSha,
        committedAt: olderDate,
        subject: "fix: repair history",
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
