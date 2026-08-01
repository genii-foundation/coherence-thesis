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

  it("refuses to invent provenance when no commit contains the current hash", () => {
    const section = {
      path: "content/manuscripts/example.md",
      contentHash: bodyHash(markdown("New untracked body.")),
    };
    const runGit: GitCommand = (args) => {
      if (args[0] === "log") return "";
      throw new Error(`Unexpected git command: ${args.join(" ")}`);
    };

    // The old behaviour returned HEAD here, which fabricated a well formed entry
    // naming a commit that does not contain the content. Ninety percent of the
    // provenance record was written that way before anyone noticed. (CTD-0112)
    expect(() => firstCommitForCurrentHash(section, runGit)).toThrow(
      /No commit contains the current content of 'content\/manuscripts\/example\.md'/,
    );
  });

  it("re-derives every entry and reuses only the pull request when the commit matches", () => {
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
    // Existing entries used to be trusted whole by hash, which meant a wrong entry,
    // once written, survived every regeneration. Commits now come from the canonical
    // index every run; the existing entry contributes only its pull request link, and
    // only when the re-derived commit matches the one it recorded. (CTD-0112)
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
      canonicalIndex: new Map([
        [
          existingEntry.contentHash,
          {
            commitSha: existingEntry.commitSha,
            versionDate: existingEntry.versionDate,
          },
        ],
      ]),
      runGit: (args) => {
        if (args.join(" ") === "remote get-url origin") {
          return "git@github.com:providence-collective/coherence-thesis.git";
        }
        throw new Error(`Unexpected git command: ${args.join(" ")}`);
      },
      resolvePullRequest: () => {
        throw new Error("A matching commit must reuse the stored pull request.");
      },
    });

    expect(manifest.entries).toEqual([existingEntry]);
  });
});
