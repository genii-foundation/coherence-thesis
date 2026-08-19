import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export type PullRequestTopologySummary = {
  baseRefName: string;
  headRefName: string;
  number: number;
  state: string;
  title: string;
  url: string;
};

export type PullRequestTopologyIssue = {
  code: "dependent-pull-request" | "missing-pull-request" | "unsupported-base";
  message: string;
  pullRequest?: number;
};

type CommandResult = {
  ok: boolean;
  stderr: string;
  stdout: string;
};

function runReadOnlyCommand(command: string, args: readonly string[]): CommandResult {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    ok: result.status === 0 && !result.error,
    stderr: result.stderr?.trim() ?? result.error?.message ?? "",
    stdout: result.stdout?.trim() ?? "",
  };
}

function requiredGh(args: readonly string[]): string {
  const result = runReadOnlyCommand("gh", args);
  if (!result.ok) {
    throw new Error(result.stderr || `GitHub command failed: gh ${args.join(" ")}`);
  }
  return result.stdout;
}

export function openPullRequests(
  pullRequests: readonly PullRequestTopologySummary[],
): PullRequestTopologySummary[] {
  return pullRequests.filter((pullRequest) => pullRequest.state === "OPEN");
}

export function auditPullRequestTopology(
  pullRequests: readonly PullRequestTopologySummary[],
  defaultBranch: string,
  currentPullRequest?: number,
): PullRequestTopologyIssue[] {
  const open = openPullRequests(pullRequests);
  const issues: PullRequestTopologyIssue[] = [];

  if (
    currentPullRequest !== undefined &&
    !open.some((pullRequest) => pullRequest.number === currentPullRequest)
  ) {
    issues.push({
      code: "missing-pull-request",
      message: `Open pull request #${currentPullRequest} was not returned by GitHub. Refusing to validate incomplete topology.`,
      pullRequest: currentPullRequest,
    });
  }

  for (const pullRequest of open) {
    if (pullRequest.baseRefName === defaultBranch) continue;
    issues.push({
      code: "unsupported-base",
      message: `PR #${pullRequest.number} targets feature branch "${pullRequest.baseRefName}". Every pull request must target "${defaultBranch}". Rebase its head onto current ${defaultBranch} and retarget or recreate the pull request.`,
      pullRequest: pullRequest.number,
    });
  }

  return issues;
}

export function auditBranchDeletion(
  pullRequests: readonly PullRequestTopologySummary[],
  branchName: string,
): PullRequestTopologyIssue[] {
  return openPullRequests(pullRequests)
    .filter((pullRequest) => pullRequest.baseRefName === branchName)
    .map((pullRequest) => ({
      code: "dependent-pull-request" as const,
      message: `Branch "${branchName}" cannot be deleted because open PR #${pullRequest.number} uses it as its base. Rebase and retarget that pull request first.`,
      pullRequest: pullRequest.number,
    }));
}

function inspectOpenPullRequests(): PullRequestTopologySummary[] {
  const output = requiredGh([
    "pr",
    "list",
    "--state",
    "open",
    "--limit",
    "1000",
    "--json",
    "number,state,baseRefName,headRefName,title,url",
  ]);
  try {
    return JSON.parse(output) as PullRequestTopologySummary[];
  } catch (error) {
    throw new Error(
      `GitHub returned malformed pull request topology: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function inspectDefaultBranch(): string {
  const output = requiredGh([
    "repo",
    "view",
    "--json",
    "defaultBranchRef",
    "--jq",
    ".defaultBranchRef.name",
  ]);
  if (!output) throw new Error("GitHub did not return a default branch.");
  return output;
}

type CliOptions = {
  branch?: string;
  currentPullRequest?: number;
  defaultBranch?: string;
  json: boolean;
};

function parseArguments(args: readonly string[]): CliOptions {
  const options: CliOptions = { json: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    if (argument === "--branch") {
      options.branch = args[++index];
      if (!options.branch) throw new Error("--branch requires a branch name.");
      continue;
    }
    if (argument === "--default-branch") {
      options.defaultBranch = args[++index];
      if (!options.defaultBranch) {
        throw new Error("--default-branch requires a branch name.");
      }
      continue;
    }
    if (argument === "--pr") {
      const value = args[++index];
      const pullRequest = Number(value);
      if (!Number.isInteger(pullRequest) || pullRequest < 1) {
        throw new Error("--pr requires a positive pull request number.");
      }
      options.currentPullRequest = pullRequest;
      continue;
    }
    throw new Error(
      "Usage: pull-request-topology.ts [--pr <number>] [--default-branch <branch>] [--branch <branch>] [--json]",
    );
  }
  if (options.branch && options.currentPullRequest !== undefined) {
    throw new Error("Use --branch or --pr, not both.");
  }
  return options;
}

function runCli(): void {
  try {
    const options = parseArguments(process.argv.slice(2));
    const pullRequests = inspectOpenPullRequests();
    const defaultBranch = options.defaultBranch ?? inspectDefaultBranch();
    const issues = options.branch
      ? auditBranchDeletion(pullRequests, options.branch)
      : auditPullRequestTopology(
          pullRequests,
          defaultBranch,
          options.currentPullRequest,
        );

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            defaultBranch,
            inspected: pullRequests.length,
            issues,
            mode: options.branch ? "branch-deletion" : "pull-request-topology",
            ...(options.branch ? { branch: options.branch } : {}),
          },
          null,
          2,
        ),
      );
    } else if (issues.length === 0) {
      if (options.branch) {
        console.log(
          `Pull request topology is safe for deleting branch "${options.branch}". No open pull request uses it as a base.`,
        );
      } else {
        console.log(
          `Pull request topology is safe. ${pullRequests.length.toLocaleString()} open pull requests target "${defaultBranch}".`,
        );
      }
    } else {
      for (const issue of issues) console.error(`ERROR: ${issue.message}`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
