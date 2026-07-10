import { describe, expect, it } from "vitest";
import {
  buildUpdateDays,
  createUpdatesSnapshot,
  formatUpdateDay,
  parseUpdatesSnapshot,
} from "./updates";

const headSha = "b".repeat(40);
const olderSha = "a".repeat(40);

describe("updates data", () => {
  it("sorts and deduplicates commits deterministically", () => {
    const snapshot = createUpdatesSnapshot(headSha, [
      {
        sha: olderSha,
        committedAt: "2026-07-09T10:00:00-07:00",
        subject: "fix: repair history",
      },
      {
        sha: headSha,
        committedAt: "2026-07-10T10:00:00-07:00",
        subject: "feat: add updates",
      },
      {
        sha: olderSha,
        committedAt: "2026-07-09T10:00:00-07:00",
        subject: "fix: repair history",
      },
    ]);

    expect(snapshot.commits.map((commit) => commit.sha)).toEqual([
      headSha,
      olderSha,
    ]);
    expect(snapshot.commits[0]?.committedAt).toBe("2026-07-10T17:00:00.000Z");
  });

  it("groups every commit by UTC day and prepares readable labels", () => {
    const snapshot = createUpdatesSnapshot(headSha, [
      {
        sha: olderSha,
        committedAt: "2026-07-09T23:00:00.000Z",
        subject: "chore: polish pass — dead code -- stable",
      },
      {
        sha: headSha,
        committedAt: "2026-07-10T17:00:00.000Z",
        subject: "feat(reader)!: add public updates (#12)",
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
    });
    expect(days[1]?.entries[0]).toMatchObject({
      kind: "maintenance",
      title: "Polish pass, dead code, stable",
    });
  });

  it("validates normalized snapshots and formats fixed UTC dates", () => {
    const snapshot = createUpdatesSnapshot(headSha, [
      {
        sha: headSha,
        committedAt: "2026-07-10T17:00:00.000Z",
        subject: "feat: add updates",
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
  });
});
