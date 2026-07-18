import { describe, expect, it, vi } from "vitest";
import { normalizeNewlines, parseFrontmatter, sha256 } from "./shared";
import {
  buildVersionProvenanceManifest,
  firstCommitForCurrentHash,
  originRepoSlug,
  originRepoUrl,
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
    expect(originRepoUrl(() => "git@github.com:genii-foundation/coherence-thesis.git")).toBe(
      "https://github.com/genii-foundation/coherence-thesis",
    );
    expect(
      originRepoSlug(() => "git@github.com:genii-foundation/coherence-thesis.git"),
    ).toBe("genii-foundation/coherence-thesis");
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

  it("uses the HEAD commit when generated-file history does not contain the current hash", () => {
    const section = {
      path: "content/manuscripts/example.md",
      contentHash: bodyHash(markdown("New untracked body.")),
    };
    const runGit: GitCommand = (args) => {
      if (args[0] === "log") return "";
      if (args.join(" ") === "show -s --format=%H%x09%cI HEAD") {
        return "cccccccccccccccccccccccccccccccccccccccc\t2026-03-01T12:34:56Z";
      }
      throw new Error(`Unexpected git command: ${args.join(" ")}`);
    };

    expect(firstCommitForCurrentHash(section, runGit)).toEqual({
      commitSha: "cccccccccccccccccccccccccccccccccccccccc",
      versionDate: "2026-03-01T12:34:56Z",
    });
  });

  it("keeps the fallback date stable when the wall clock changes", () => {
    const section = {
      path: "content/manuscripts/example.md",
      contentHash: bodyHash(markdown("New untracked body.")),
    };
    const runGit: GitCommand = (args) => {
      if (args[0] === "log") return "";
      if (args.join(" ") === "show -s --format=%H%x09%cI HEAD") {
        return "cccccccccccccccccccccccccccccccccccccccc\t2026-03-01T12:34:56Z";
      }
      throw new Error(`Unexpected git command: ${args.join(" ")}`);
    };

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2027-01-01T00:00:00Z"));
      const first = firstCommitForCurrentHash(section, runGit);
      vi.setSystemTime(new Date("2028-01-01T00:00:00Z"));
      expect(firstCommitForCurrentHash(section, runGit)).toEqual(first);
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves existing entries and pull request attribution for current hashes", () => {
    const existingEntry = {
      contentHash: "1234567890abcdef",
      versionDate: "2026-01-15T00:00:00Z",
      commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      commitUrl:
        "https://github.com/providence-collective/coherence-thesis/commit/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      pullRequestUrl:
        "https://github.com/providence-collective/coherence-thesis/pull/42",
      pullRequestNumber: 42,
    };
    const manifest = buildVersionProvenanceManifest({
      now: "2026-03-02T00:00:00Z",
      sections: [
        {
          path: "content/manuscripts/example.md",
          contentHash: existingEntry.contentHash,
        },
      ],
      existing: {
        version: 1,
        generatedAt: "2026-01-15T00:00:00Z",
        entries: [existingEntry],
      },
      runGit: (args) => {
        if (args.join(" ") === "remote get-url origin") {
          return "git@github.com:providence-collective/coherence-thesis.git";
        }
        throw new Error(`Unexpected git command: ${args.join(" ")}`);
      },
      resolvePullRequest: () => {
        throw new Error("Existing provenance must not be resolved again.");
      },
    });

    expect(manifest.entries).toEqual([existingEntry]);
  });
});
