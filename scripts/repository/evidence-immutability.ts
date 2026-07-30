#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import process from "node:process";

import { editorialReviewPrefix, repoRoot } from "./paths";

export type EvidenceBatchState = {
  batch: string;
  changedInCommits: boolean;
  changedInWorktree: boolean;
  existedAtBase: boolean;
  existsAtHead: boolean;
  touchingCommits: number;
};

export type EvidenceImmutabilityViolation = {
  batch: string;
  reason:
    | "changed-after-base"
    | "changed-after-commit"
    | "changed-in-multiple-commits";
};

export function reviewBatchFromPath(file: string): string | null {
  const normalized = file.replaceAll("\\", "/").replace(/^\.\/+/, "");
  const volume = normalized.match(
    /^editorial\/evidence\/reviews\/volumes\/[^/]+\/[^/]+(?:\/|$)/,
  );
  if (volume) return volume[0].replace(/\/$/, "");

  const corpus = normalized.match(
    /^editorial\/evidence\/reviews\/corpus\/[^/]+(?:\/|$)/,
  );
  return corpus ? corpus[0].replace(/\/$/, "") : null;
}

export function findEvidenceImmutabilityViolations(
  states: readonly EvidenceBatchState[],
): EvidenceImmutabilityViolation[] {
  const violations: EvidenceImmutabilityViolation[] = [];

  for (const state of states) {
    if (state.existedAtBase && state.changedInCommits) {
      violations.push({
        batch: state.batch,
        reason: "changed-after-base",
      });
    }
    if (state.existsAtHead && state.changedInWorktree) {
      violations.push({
        batch: state.batch,
        reason: "changed-after-commit",
      });
    }
    if (
      !state.existedAtBase &&
      state.changedInCommits &&
      state.touchingCommits > 1
    ) {
      violations.push({
        batch: state.batch,
        reason: "changed-in-multiple-commits",
      });
    }
  }

  return violations;
}

function git(args: string[], allowFailure = false): string {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", allowFailure ? "ignore" : "pipe"],
    });
  } catch (error) {
    if (allowFailure) return "";
    throw error;
  }
}

function gitPathExists(revision: string, file: string): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", `${revision}:${file}`], {
      cwd: repoRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function nulPaths(output: string): string[] {
  return output.split("\0").filter(Boolean);
}

function batchSet(paths: readonly string[]): Set<string> {
  return new Set(
    paths
      .map(reviewBatchFromPath)
      .filter((batch): batch is string => batch !== null),
  );
}

function resolveBase(): string {
  const configured = process.env.EDITORIAL_EVIDENCE_BASE?.trim();
  if (configured) return configured;

  // Grandfather the repository state that adopted this gate. Review batches
  // assembled earlier on a long-running branch may span several historical
  // commits, but once the gate exists that state becomes the immutable floor.
  const adoptionCommit = git(
    [
      "log",
      "--diff-filter=A",
      "--format=%H",
      "--",
      "scripts/repository/evidence-immutability.ts",
    ],
    true,
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .at(-1);
  if (adoptionCommit) return adoptionCommit;

  const originMain = git(["merge-base", "origin/main", "HEAD"], true).trim();
  if (originMain) return originMain;

  const localMain = git(["merge-base", "main", "HEAD"], true).trim();
  if (localMain) return localMain;

  throw new Error(
    "Cannot resolve an immutable evidence base. Fetch origin/main or set EDITORIAL_EVIDENCE_BASE.",
  );
}

function main(): void {
  const base = resolveBase();
  const committedBatches = batchSet(
    nulPaths(
      git([
        "diff",
        "--name-only",
        "-z",
        `${base}..HEAD`,
        "--",
        editorialReviewPrefix,
      ]),
    ),
  );
  const worktreeBatches = batchSet([
    ...nulPaths(
      git([
        "diff",
        "--name-only",
        "-z",
        "HEAD",
        "--",
        editorialReviewPrefix,
      ]),
    ),
    ...nulPaths(
      git([
        "ls-files",
        "--others",
        "--exclude-standard",
        "-z",
        "--",
        editorialReviewPrefix,
      ]),
    ),
  ]);
  const batches = [...new Set([...committedBatches, ...worktreeBatches])].sort();

  const states = batches.map((batch): EvidenceBatchState => {
    const touchingCommits = nulPaths(
      git([
        "log",
        "-z",
        "--format=%H",
        `${base}..HEAD`,
        "--",
        batch,
      ]),
    ).length;
    return {
      batch,
      changedInCommits: committedBatches.has(batch),
      changedInWorktree: worktreeBatches.has(batch),
      existedAtBase: gitPathExists(base, batch),
      existsAtHead: gitPathExists("HEAD", batch),
      touchingCommits,
    };
  });
  const violations = findEvidenceImmutabilityViolations(states);

  if (violations.length === 0) {
    process.stdout.write(
      `Evidence immutability validated for ${batches.length.toLocaleString()} changed batch(es).\n`,
    );
    return;
  }

  process.stderr.write(
    `Evidence immutability failed with ${violations.length.toLocaleString()} violation(s).\n\n`,
  );
  for (const violation of violations) {
    const explanation =
      violation.reason === "changed-after-base"
        ? "already existed at the branch base"
        : violation.reason === "changed-after-commit"
          ? "has worktree changes after it was committed"
          : "was changed by more than one branch commit";
    process.stderr.write(`  ${violation.batch}: ${explanation}\n`);
  }
  process.exit(1);
}

if (import.meta.filename === process.argv[1]) main();
