import { describe, expect, it } from "vitest";
import {
  pullRequestsForBranch,
  type PullRequestSummary,
} from "./branches";

const pullRequest: PullRequestSummary = {
  baseRefName: "main",
  headRefName: "edit/revise-volume",
  headRefOid: "a".repeat(40),
  isDraft: true,
  number: 112,
  state: "OPEN",
  title: "Edit one volume",
  url: "https://example.test/pull/112",
};

describe("branch inventory pull request association", () => {
  it("associates a pull request with both its head and base branches", () => {
    expect(
      pullRequestsForBranch(
        "edit/revise-volume",
        pullRequest.headRefOid,
        [pullRequest],
      ),
    ).toEqual([pullRequest]);
    expect(
      pullRequestsForBranch("main", "b".repeat(40), [pullRequest]),
    ).toEqual([pullRequest]);
  });

  it("associates a local alias by the exact pull request head revision", () => {
    expect(
      pullRequestsForBranch("local-alias", pullRequest.headRefOid, [
        pullRequest,
      ]),
    ).toEqual([pullRequest]);
  });

  it("does not associate an unrelated branch", () => {
    expect(
      pullRequestsForBranch("unrelated", "c".repeat(40), [pullRequest]),
    ).toEqual([]);
  });
});
