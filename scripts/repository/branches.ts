import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { repoRoot } from "./paths";

export type PullRequestSummary = {
  baseRefName: string;
  headRefName: string;
  headRefOid: string;
  isDraft: boolean;
  number: number;
  state: string;
  title: string;
  url: string;
};

export type LocalBranchSummary = {
  name: string;
  objectName: string;
  pullRequests: PullRequestSummary[];
  upstream?: string;
  worktree?: string;
};

export type RemoteBranchSummary = {
  name: string;
  objectName: string;
  pullRequests: PullRequestSummary[];
  remote: string;
};

export type WorktreeSummary = {
  branch?: string;
  changes?: number;
  head: string;
  path: string;
  status: "clean" | "dirty" | "missing" | "unreadable";
};

export type BranchInventory = {
  gh: {
    available: boolean;
    message: string;
  };
  localBranches: LocalBranchSummary[];
  remoteBranches: RemoteBranchSummary[];
  remoteErrors: string[];
  worktrees: WorktreeSummary[];
};

type CommandResult = {
  ok: boolean;
  stderr: string;
  stdout: string;
};

function runReadOnlyCommand(
  command: string,
  args: readonly string[],
  cwd = repoRoot,
): CommandResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    maxBuffer: 50 * 1024 * 1024,
  });
  return {
    ok: result.status === 0 && !result.error,
    stderr: result.stderr?.trim() ?? result.error?.message ?? "",
    stdout: result.stdout?.trim() ?? "",
  };
}

function requiredGit(args: readonly string[], cwd = repoRoot): string {
  const result = runReadOnlyCommand("git", args, cwd);
  if (!result.ok) {
    throw new Error(result.stderr || `Git command failed: git ${args.join(" ")}`);
  }
  return result.stdout;
}

function parseWorktrees(): WorktreeSummary[] {
  const output = requiredGit(["worktree", "list", "--porcelain"]);
  if (!output) return [];

  return output.split(/\n\n+/).map((block) => {
    const lines = block.split("\n");
    const worktreePath = lines
      .find((line) => line.startsWith("worktree "))
      ?.slice("worktree ".length);
    const head = lines
      .find((line) => line.startsWith("HEAD "))
      ?.slice("HEAD ".length);
    const branch = lines
      .find((line) => line.startsWith("branch refs/heads/"))
      ?.slice("branch refs/heads/".length);
    if (!worktreePath || !head) {
      throw new Error("Git returned an incomplete worktree record.");
    }
    if (!fs.existsSync(worktreePath)) {
      return {
        branch,
        head,
        path: worktreePath,
        status: "missing" as const,
      };
    }

    const status = runReadOnlyCommand(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=all"],
      worktreePath,
    );
    if (!status.ok) {
      return {
        branch,
        head,
        path: worktreePath,
        status: "unreadable" as const,
      };
    }
    const changes = status.stdout ? status.stdout.split("\n").length : 0;
    return {
      branch,
      changes,
      head,
      path: worktreePath,
      status: changes === 0 ? ("clean" as const) : ("dirty" as const),
    };
  });
}

function pullRequestInventory(): {
  available: boolean;
  message: string;
  pullRequests: PullRequestSummary[];
} {
  const version = runReadOnlyCommand("gh", ["--version"]);
  if (!version.ok) {
    return {
      available: false,
      message: "GitHub CLI is not available.",
      pullRequests: [],
    };
  }
  const result = runReadOnlyCommand("gh", [
    "pr",
    "list",
    "--state",
    "all",
    "--limit",
    "1000",
    "--json",
    "number,state,isDraft,baseRefName,headRefName,headRefOid,title,url",
  ]);
  if (!result.ok) {
    return {
      available: false,
      message: result.stderr || "GitHub pull request state could not be read.",
      pullRequests: [],
    };
  }

  try {
    const pullRequests = JSON.parse(result.stdout) as PullRequestSummary[];
    return {
      available: true,
      message: `${pullRequests.length.toLocaleString()} pull requests inspected.`,
      pullRequests: pullRequests.sort((left, right) => right.number - left.number),
    };
  } catch (error) {
    return {
      available: false,
      message: error instanceof Error ? error.message : String(error),
      pullRequests: [],
    };
  }
}

export function pullRequestsForBranch(
  branchName: string,
  objectName: string,
  pullRequests: readonly PullRequestSummary[],
): PullRequestSummary[] {
  return pullRequests.filter(
    (pullRequest) =>
      pullRequest.headRefName === branchName ||
      pullRequest.headRefOid === objectName ||
      pullRequest.baseRefName === branchName,
  );
}

function localBranchInventory(
  worktrees: readonly WorktreeSummary[],
  pullRequests: readonly PullRequestSummary[],
): LocalBranchSummary[] {
  const output = requiredGit([
    "for-each-ref",
    "--sort=refname",
    "--format=%(refname:short)%09%(objectname)%09%(upstream:short)",
    "refs/heads",
  ]);
  if (!output) return [];

  return output.split("\n").map((line) => {
    const [name, objectName, upstream] = line.split("\t");
    if (!name || !objectName) {
      throw new Error("Git returned an incomplete local branch record.");
    }
    return {
      name,
      objectName,
      pullRequests: pullRequestsForBranch(name, objectName, pullRequests),
      ...(upstream ? { upstream } : {}),
      ...(worktrees.find((worktree) => worktree.branch === name)?.path
        ? {
            worktree: worktrees.find((worktree) => worktree.branch === name)!
              .path,
          }
        : {}),
    };
  });
}

function remoteBranchInventory(
  pullRequests: readonly PullRequestSummary[],
): { branches: RemoteBranchSummary[]; errors: string[] } {
  const remoteOutput = requiredGit(["remote"]);
  const remotes = remoteOutput ? remoteOutput.split("\n").filter(Boolean) : [];
  const branches: RemoteBranchSummary[] = [];
  const errors: string[] = [];

  for (const remote of remotes) {
    const result = runReadOnlyCommand("git", [
      "ls-remote",
      "--heads",
      remote,
    ]);
    if (!result.ok) {
      errors.push(
        `${remote}: ${result.stderr || "remote branches could not be read"}`,
      );
      continue;
    }
    for (const line of result.stdout.split("\n").filter(Boolean)) {
      const [objectName, refName] = line.split(/\s+/);
      const prefix = "refs/heads/";
      if (!objectName || !refName?.startsWith(prefix)) continue;
      const name = refName.slice(prefix.length);
      branches.push({
        name,
        objectName,
        pullRequests: pullRequestsForBranch(name, objectName, pullRequests),
        remote,
      });
    }
  }

  return {
    branches: branches.sort((left, right) =>
      `${left.remote}/${left.name}`.localeCompare(`${right.remote}/${right.name}`),
    ),
    errors,
  };
}

export function inspectBranches(): BranchInventory {
  const worktrees = parseWorktrees();
  const gh = pullRequestInventory();
  const remotes = remoteBranchInventory(gh.pullRequests);
  return {
    gh: { available: gh.available, message: gh.message },
    localBranches: localBranchInventory(worktrees, gh.pullRequests),
    remoteBranches: remotes.branches,
    remoteErrors: remotes.errors,
    worktrees,
  };
}

function formatPullRequests(
  branchName: string,
  objectName: string,
  pullRequests: readonly PullRequestSummary[],
): string {
  if (pullRequests.length === 0) return "no associated pull request";
  return pullRequests
    .map((pullRequest) => {
      const roles = [
        pullRequest.headRefName === branchName ||
        pullRequest.headRefOid === objectName
          ? "head"
          : undefined,
        pullRequest.baseRefName === branchName ? "base" : undefined,
      ].filter(Boolean);
      return `PR ${pullRequest.number} ${pullRequest.state}${pullRequest.isDraft ? " draft" : ""} ${roles.join(" and ")}`;
    })
    .join(", ");
}

export function formatBranchInventory(inventory: BranchInventory): string {
  const lines = [
    "Branch inventory",
    "Inspection only. This command never deletes branches or worktrees.",
    `GitHub pull requests: ${inventory.gh.available ? "available" : "unavailable"}. ${inventory.gh.message}`,
    "",
    `Local branches (${inventory.localBranches.length.toLocaleString()})`,
  ];

  for (const branch of inventory.localBranches) {
    lines.push(
      `  ${branch.name} ${branch.objectName.slice(0, 12)} | ${formatPullRequests(branch.name, branch.objectName, branch.pullRequests)}`,
    );
    if (branch.upstream) lines.push(`    upstream: ${branch.upstream}`);
    if (branch.worktree) lines.push(`    worktree: ${branch.worktree}`);
  }

  lines.push(
    "",
    `Remote branches (${inventory.remoteBranches.length.toLocaleString()})`,
  );
  for (const branch of inventory.remoteBranches) {
    lines.push(
      `  ${branch.remote}/${branch.name} ${branch.objectName.slice(0, 12)} | ${formatPullRequests(branch.name, branch.objectName, branch.pullRequests)}`,
    );
  }
  for (const error of inventory.remoteErrors) {
    lines.push(`  Remote error: ${error}`);
  }

  lines.push("", `Worktrees (${inventory.worktrees.length.toLocaleString()})`);
  for (const worktree of inventory.worktrees) {
    const changes =
      worktree.changes === undefined
        ? ""
        : `, ${worktree.changes.toLocaleString()} change${worktree.changes === 1 ? "" : "s"}`;
    lines.push(
      `  ${worktree.path} | ${worktree.branch ?? "detached"} | ${worktree.status}${changes}`,
    );
  }
  return lines.join("\n");
}

function runCli(): void {
  try {
    const inventory = inspectBranches();
    if (process.argv.includes("--json")) {
      console.log(JSON.stringify(inventory, null, 2));
    } else {
      console.log(formatBranchInventory(inventory));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
