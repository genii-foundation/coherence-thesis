import { describe, expect, it } from "vitest";
import {
  buildUpdateDays,
  createUpdatesSnapshot,
  formatUpdateDay,
  formatUpdateLineCount,
  getUpdateChangeLevel,
  parseUpdatesSnapshot,
} from "./updates";

const headSha = "b".repeat(40);
const olderSha = "a".repeat(40);

function stats(filesChanged: number, additions: number, deletions: number) {
  return { filesChanged, additions, deletions };
}

describe("updates data", () => {
  it("sorts and deduplicates commits deterministically", () => {
    const snapshot = createUpdatesSnapshot(headSha, [
      {
        sha: olderSha,
        committedAt: "2026-07-09T10:00:00-07:00",
        subject: "fix: repair history",
        ...stats(2, 12, 3),
      },
      {
        sha: headSha,
        committedAt: "2026-07-10T10:00:00-07:00",
        subject: "feat: add updates",
        ...stats(3, 20, 4),
      },
      {
        sha: olderSha,
        committedAt: "2026-07-09T10:00:00-07:00",
        subject: "fix: repair history",
        ...stats(2, 12, 3),
      },
    ]);

    expect(snapshot.commits.map((commit) => commit.sha)).toEqual([
      headSha,
      olderSha,
    ]);
    expect(snapshot.commits[0]?.committedAt).toBe("2026-07-10T17:00:00.000Z");
    expect(snapshot.commits[0]).toMatchObject(stats(3, 20, 4));
  });

  it("groups every commit by UTC day and prepares readable labels", () => {
    const snapshot = createUpdatesSnapshot(headSha, [
      {
        sha: olderSha,
        committedAt: "2026-07-09T23:00:00.000Z",
        subject: "chore: polish pass — dead code -- stable",
        ...stats(2, 5, 4),
      },
      {
        sha: headSha,
        committedAt: "2026-07-10T17:00:00.000Z",
        subject: "feat(reader)!: add public updates (#12)",
        ...stats(4, 80, 20),
      },
    ]);
    const days = buildUpdateDays(snapshot);

    expect(days).toHaveLength(2);
    expect(days[0]?.entries[0]).toMatchObject({
      kind: "feature",
      title: "Add public updates",
      pullRequestNumber: 12,
      pullRequestUrl:
        "https://github.com/providence-collective/coherence-thesis/pull/12",
      linesChanged: 100,
      changeLevel: 3,
    });
    expect(days[1]?.entries[0]).toMatchObject({
      kind: "maintenance",
      title: "Polish pass, dead code, stable",
      linesChanged: 9,
      changeLevel: 1,
    });
  });

  it("validates normalized snapshots and formats fixed UTC dates", () => {
    const snapshot = createUpdatesSnapshot(headSha, [
      {
        sha: headSha,
        committedAt: "2026-07-10T17:00:00.000Z",
        subject: "feat: add updates",
        ...stats(1, 7, 2),
      },
    ]);

    expect(parseUpdatesSnapshot(snapshot)).toEqual(snapshot);
    expect(formatUpdateDay("2026-07-10")).toBe("July 10, 2026");
    expect(() =>
      parseUpdatesSnapshot({
        ...snapshot,
        commits: [
          {
            ...snapshot.commits[0],
            commitUrl: "https://example.com/wrong",
          },
        ],
      }),
    ).toThrow("Invalid update commit URL");
    expect(() =>
      parseUpdatesSnapshot({
        ...snapshot,
        commits: [
          {
            ...snapshot.commits[0],
            additions: -1,
          },
        ],
      }),
    ).toThrow("Invalid update addition count");
  });

  it("preserves literary and reachable deployment metadata", () => {
    const deploymentUrl =
      "https://coherence-thesis-example-aubreyfs-projects.vercel.app";
    const snapshot = createUpdatesSnapshot(headSha, [
      {
        sha: headSha,
        committedAt: "2026-07-10T17:00:00.000Z",
        subject: "edit: refine the opening",
        ...stats(2, 12, 4),
        isLiterary: true,
        deploymentUrl: `${deploymentUrl}/`,
      },
    ]);

    expect(snapshot.commits[0]).toMatchObject({
      isLiterary: true,
      deploymentUrl,
      filesChanged: 2,
      additions: 12,
      deletions: 4,
    });
    expect(parseUpdatesSnapshot(snapshot)).toEqual(snapshot);
    expect(() =>
      createUpdatesSnapshot(headSha, [
        {
          sha: headSha,
          committedAt: "2026-07-10T17:00:00.000Z",
          subject: "edit: refine the opening",
          ...stats(2, 12, 4),
          deploymentUrl: "https://unrelated.vercel.app",
        },
      ]),
    ).toThrow("Invalid update deployment URL");
  });

  it("uses logarithmic change levels with a binary-file fallback", () => {
    const level = (lines: number, filesChanged = 1) =>
      getUpdateChangeLevel({
        filesChanged,
        additions: lines,
        deletions: 0,
      });

    expect(level(0, 0)).toBe(0);
    expect(level(0, 2)).toBe(1);
    expect(level(0, 10)).toBe(2);
    expect(level(0, 1_000)).toBe(4);
    expect(level(1)).toBe(1);
    expect(level(9)).toBe(1);
    expect(level(10)).toBe(2);
    expect(level(99)).toBe(2);
    expect(level(100)).toBe(3);
    expect(level(999)).toBe(3);
    expect(level(1_000)).toBe(4);
    expect(level(9_999)).toBe(4);
    expect(level(10_000)).toBe(5);
  });

  it("formats visible line totals with compact rounded units", () => {
    expect(formatUpdateLineCount(0)).toBe("0");
    expect(formatUpdateLineCount(999)).toBe("999");
    expect(formatUpdateLineCount(1_000)).toBe("1K");
    expect(formatUpdateLineCount(68_394)).toBe("68K");
    expect(formatUpdateLineCount(1_249_000)).toBe("1M");
    expect(formatUpdateLineCount(12_500_000)).toBe("13M");
    expect(() => formatUpdateLineCount(-1)).toThrow(
      "Invalid update changed line count",
    );
  });
});
