import { describe, expect, it } from "vitest";
import { normalizeNewlines, parseFrontmatter, sha256 } from "./shared";
import {
  firstCommitForCurrentHash,
  originRepoSlug,
  originRepoUrl,
  preserveVersionProvenance,
  type GitCommand,
} from "./versions";

function markdown(body: string): string {
  return `---\nsectionId: "example"\ntitle: "Example"\n---\n${body}`;
}

function bodyHash(source: string): string {
  return sha256(normalizeNewlines(parseFrontmatter(source).body)).slice(0, 16);
}

describe("manuscript version provenance", () => {
  it("normalizes GitHub remote URLs", () => {
    expect(originRepoUrl(() => "git@github.com:providence-collective/coherence-thesis.git")).toBe(
      "https://github.com/providence-collective/coherence-thesis",
    );
    expect(
      originRepoSlug(() => "git@github.com:providence-collective/coherence-thesis.git"),
    ).toBe("providence-collective/coherence-thesis");
  });

  it("finds the first commit where the current section hash appeared", () => {
    const oldSource = markdown("Old body.");
    const currentSource = markdown("Current body.");
    const section = {
      path: "content/manuscripts/example.md",
      contentHash: bodyHash(currentSource),
    };
    const runGit: GitCommand = (args) => {
      if (args[0] === "log") {
        return [
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\t2026-02-01T00:00:00Z",
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\t2026-01-01T00:00:00Z",
        ].join("\n");
      }
      if (args[0] === "show" && args[1]?.startsWith("aaaaaaaa")) return oldSource;
      if (args[0] === "show" && args[1]?.startsWith("bbbbbbbb")) return currentSource;
      throw new Error(`Unexpected git command: ${args.join(" ")}`);
    };

    expect(firstCommitForCurrentHash(section, runGit)).toEqual({
      commitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      versionDate: "2026-02-01T00:00:00Z",
    });
  });

  it("keeps the older commit when later metadata changes preserve the body hash", () => {
    const currentSource = markdown("Stable body.");
    const laterSource = currentSource.replace('title: "Example"', 'title: "Renamed"');
    const section = {
      path: "content/manuscripts/example.md",
      contentHash: bodyHash(currentSource),
    };
    const runGit: GitCommand = (args) => {
      if (args[0] === "log") {
        return [
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\t2026-02-01T00:00:00Z",
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\t2026-01-01T00:00:00Z",
        ].join("\n");
      }
      if (args[0] === "show" && args[1]?.startsWith("aaaaaaaa")) return currentSource;
      if (args[0] === "show" && args[1]?.startsWith("bbbbbbbb")) return laterSource;
      throw new Error(`Unexpected git command: ${args.join(" ")}`);
    };

    expect(firstCommitForCurrentHash(section, runGit)).toEqual({
      commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      versionDate: "2026-01-01T00:00:00Z",
    });
  });

  it("preserves immutable pull request provenance when live lookup is unavailable", () => {
    const fresh = {
      version: 1 as const,
      generatedAt: "2026-07-10T02:00:00Z",
      entries: [
        {
          contentHash: "same-content",
          versionDate: "2026-07-10T02:00:00Z",
          commitSha: "later",
          commitUrl: "https://github.com/example/repo/commit/later",
        },
      ],
    };
    const committed = {
      version: 1 as const,
      generatedAt: "2026-07-09T01:00:00Z",
      entries: [
        {
          contentHash: "same-content",
          versionDate: "2026-07-09T01:00:00Z",
          commitSha: "first",
          commitUrl: "https://github.com/example/repo/commit/first",
          pullRequestUrl: "https://github.com/example/repo/pull/12",
          pullRequestNumber: 12,
        },
      ],
    };

    expect(preserveVersionProvenance(fresh, committed).entries[0]).toEqual(
      committed.entries[0],
    );
  });
});
