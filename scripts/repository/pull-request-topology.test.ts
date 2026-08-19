import { describe, expect, it } from "vitest";
import {
  auditBranchDeletion,
  auditPullRequestTopology,
  openPullRequests,
  type PullRequestTopologySummary,
} from "./pull-request-topology";

function pullRequest(
  number: number,
  baseRefName = "main",
  headRefName = `feature-${number}`,
  state = "OPEN",
): PullRequestTopologySummary {
  return {
    baseRefName,
    headRefName,
    number,
    state,
    title: `Pull request ${number}`,
    url: `https://example.test/pull/${number}`,
  };
}

describe("pull request topology", () => {
  it("accepts open pull requests that all target the default branch", () => {
    expect(
      auditPullRequestTopology(
        [pullRequest(40), pullRequest(41)],
        "main",
        41,
      ),
    ).toEqual([]);
  });

  it("rejects a pull request based on another feature branch", () => {
    expect(
      auditPullRequestTopology(
        [
          pullRequest(40),
          pullRequest(41, "feature-40", "feature-41"),
        ],
        "main",
      ),
    ).toEqual([
      expect.objectContaining({
        code: "unsupported-base",
        pullRequest: 41,
      }),
    ]);
  });

  it("fails closed when the requested pull request is absent", () => {
    expect(auditPullRequestTopology([pullRequest(40)], "main", 41)).toEqual([
      expect.objectContaining({
        code: "missing-pull-request",
        pullRequest: 41,
      }),
    ]);
  });

  it("blocks branch deletion while an open pull request depends on it", () => {
    expect(
      auditBranchDeletion(
        [pullRequest(41, "feature-40", "feature-41")],
        "feature-40",
      ),
    ).toEqual([
      expect.objectContaining({
        code: "dependent-pull-request",
        pullRequest: 41,
      }),
    ]);
  });

  it("ignores closed pull requests when validating current topology", () => {
    const closed = pullRequest(41, "feature-40", "feature-41", "CLOSED");
    expect(openPullRequests([closed])).toEqual([]);
    expect(auditPullRequestTopology([closed], "main")).toEqual([]);
    expect(auditBranchDeletion([closed], "feature-40")).toEqual([]);
  });
});
