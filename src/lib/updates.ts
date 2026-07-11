export const updatesRepository = "providence-collective/coherence-thesis";
export const updatesRepositoryUrl = `https://github.com/${updatesRepository}`;
export const updatesBranch = "main";
export const updatesSnapshotSchemaVersion = 2;

export type UpdateCommit = {
  sha: string;
  committedAt: string;
  subject: string;
  commitUrl: string;
  filesChanged: number;
  additions: number;
  deletions: number;
};

export type UpdatesSnapshot = {
  schemaVersion: typeof updatesSnapshotSchemaVersion;
  repository: typeof updatesRepository;
  branch: typeof updatesBranch;
  headSha: string;
  commits: UpdateCommit[];
};

export type UpdateKind =
  | "feature"
  | "fix"
  | "manuscript"
  | "docs"
  | "performance"
  | "refactor"
  | "maintenance"
  | "tests"
  | "build"
  | "ci"
  | "style"
  | "revert"
  | "update";

export type UpdateEntry = UpdateCommit & {
  shortSha: string;
  title: string;
  kind: UpdateKind;
  linesChanged: number;
  changeLevel: UpdateChangeLevel;
  pullRequestNumber?: number;
  pullRequestUrl?: string;
};

export type UpdateChangeLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type UpdateDay = {
  date: string;
  entries: UpdateEntry[];
};

export type UpdateCommitInput = Pick<
  UpdateCommit,
  | "sha"
  | "committedAt"
  | "subject"
  | "filesChanged"
  | "additions"
  | "deletions"
>;

export const updateKindLabels: Record<UpdateKind, string> = {
  feature: "Feature",
  fix: "Fix",
  manuscript: "Manuscript",
  docs: "Docs",
  performance: "Performance",
  refactor: "Refactor",
  maintenance: "Maintenance",
  tests: "Tests",
  build: "Build",
  ci: "CI",
  style: "Style",
  revert: "Revert",
  update: "Update",
};

const updateKindByPrefix: Record<string, UpdateKind> = {
  feat: "feature",
  fix: "fix",
  edit: "manuscript",
  docs: "docs",
  perf: "performance",
  refactor: "refactor",
  chore: "maintenance",
  test: "tests",
  build: "build",
  ci: "ci",
  style: "style",
  revert: "revert",
};

const shaPattern = /^[a-f0-9]{40}$/;
const updateDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
  year: "numeric",
});
const updateLineCountFormatter = new Intl.NumberFormat("en-US", {
  compactDisplay: "short",
  maximumFractionDigits: 0,
  notation: "compact",
});

function normalizeCommittedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid update commit date: ${value}`);
  }
  return date.toISOString();
}

function normalizeSubject(value: string): string {
  const [subject = ""] = value.replace(/\r\n/g, "\n").split("\n", 1);
  const normalized = subject.trim();
  if (!normalized) {
    throw new Error("Update commit subjects cannot be empty.");
  }
  return normalized;
}

function normalizeChangeCount(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid update ${label}: ${value}`);
  }
  return value;
}

function normalizeDisplayText(value: string): string {
  const normalized = value
    .replace(/[—–]/g, ", ")
    .replace(/→/g, " to ")
    .replace(/-{2,}/g, ", ")
    .replace(/\s+,/g, ",")
    .replace(/\s+/g, " ")
    .trim();

  return normalized
    ? `${normalized[0]!.toUpperCase()}${normalized.slice(1)}`
    : normalized;
}

function updateKindAndTitle(subject: string): {
  kind: UpdateKind;
  title: string;
} {
  const withoutPullRequest = subject.replace(/\s+\(#\d+\)$/, "").trim();
  const conventional = withoutPullRequest.match(
    /^([a-z]+)(?:\([^)]+\))?!?:\s*(.+)$/i,
  );
  const prefix = conventional?.[1]?.toLowerCase();
  const kind = prefix ? updateKindByPrefix[prefix] : undefined;

  return {
    kind: kind ?? "update",
    title: normalizeDisplayText(kind ? conventional?.[2] ?? "" : withoutPullRequest),
  };
}

export function createUpdatesSnapshot(
  headSha: string,
  commits: readonly UpdateCommitInput[],
): UpdatesSnapshot {
  if (!shaPattern.test(headSha)) {
    throw new Error(`Invalid updates head SHA: ${headSha}`);
  }

  const commitsBySha = new Map<string, UpdateCommit>();
  for (const commit of commits) {
    if (!shaPattern.test(commit.sha)) {
      throw new Error(`Invalid update commit SHA: ${commit.sha}`);
    }

    const normalized: UpdateCommit = {
      sha: commit.sha,
      committedAt: normalizeCommittedAt(commit.committedAt),
      subject: normalizeSubject(commit.subject),
      commitUrl: `${updatesRepositoryUrl}/commit/${commit.sha}`,
      filesChanged: normalizeChangeCount(
        commit.filesChanged,
        "changed file count",
      ),
      additions: normalizeChangeCount(commit.additions, "addition count"),
      deletions: normalizeChangeCount(commit.deletions, "deletion count"),
    };
    const existing = commitsBySha.get(commit.sha);
    if (!existing || JSON.stringify(normalized) < JSON.stringify(existing)) {
      commitsBySha.set(commit.sha, normalized);
    }
  }

  if (!commitsBySha.has(headSha)) {
    throw new Error("The updates snapshot does not contain its main branch head.");
  }

  const normalizedCommits = [...commitsBySha.values()].sort(
    (left, right) =>
      right.committedAt.localeCompare(left.committedAt) ||
      left.sha.localeCompare(right.sha),
  );

  return {
    schemaVersion: updatesSnapshotSchemaVersion,
    repository: updatesRepository,
    branch: updatesBranch,
    headSha,
    commits: normalizedCommits,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseUpdatesSnapshot(value: unknown): UpdatesSnapshot {
  if (!isRecord(value)) {
    throw new Error("The updates snapshot must be an object.");
  }
  if (value.schemaVersion !== updatesSnapshotSchemaVersion) {
    throw new Error("The updates snapshot schema version is not supported.");
  }
  if (value.repository !== updatesRepository || value.branch !== updatesBranch) {
    throw new Error("The updates snapshot points at the wrong repository or branch.");
  }
  if (typeof value.headSha !== "string" || !Array.isArray(value.commits)) {
    throw new Error("The updates snapshot is missing its head or commit list.");
  }

  const inputs = value.commits.map((candidate) => {
    if (
      !isRecord(candidate) ||
      typeof candidate.sha !== "string" ||
      typeof candidate.committedAt !== "string" ||
      typeof candidate.subject !== "string" ||
      typeof candidate.commitUrl !== "string" ||
      typeof candidate.filesChanged !== "number" ||
      typeof candidate.additions !== "number" ||
      typeof candidate.deletions !== "number"
    ) {
      throw new Error("The updates snapshot contains an invalid commit.");
    }
    const expectedUrl = `${updatesRepositoryUrl}/commit/${candidate.sha}`;
    if (candidate.commitUrl !== expectedUrl) {
      throw new Error(`Invalid update commit URL for ${candidate.sha}.`);
    }
    return {
      sha: candidate.sha,
      committedAt: candidate.committedAt,
      subject: candidate.subject,
      filesChanged: candidate.filesChanged,
      additions: candidate.additions,
      deletions: candidate.deletions,
    };
  });
  const normalized = createUpdatesSnapshot(value.headSha, inputs);

  if (normalized.commits.length !== value.commits.length) {
    throw new Error("The updates snapshot contains duplicate commits.");
  }
  for (const [index, commit] of normalized.commits.entries()) {
    const candidate = value.commits[index];
    if (
      !isRecord(candidate) ||
      candidate.sha !== commit.sha ||
      candidate.committedAt !== commit.committedAt ||
      candidate.subject !== commit.subject ||
      candidate.commitUrl !== commit.commitUrl ||
      candidate.filesChanged !== commit.filesChanged ||
      candidate.additions !== commit.additions ||
      candidate.deletions !== commit.deletions
    ) {
      throw new Error("The updates snapshot is not normalized and sorted.");
    }
  }

  return normalized;
}

export function getUpdateChangeLevel({
  filesChanged,
  additions,
  deletions,
}: Pick<
  UpdateCommit,
  "filesChanged" | "additions" | "deletions"
>): UpdateChangeLevel {
  const linesChanged = additions + deletions;
  const levelFor = (count: number): UpdateChangeLevel => {
    if (count === 0) return 0;
    if (count < 10) return 1;
    if (count < 100) return 2;
    if (count < 1_000) return 3;
    if (count < 10_000) return 4;
    return 5;
  };
  return Math.max(
    levelFor(linesChanged),
    levelFor(filesChanged),
  ) as UpdateChangeLevel;
}

export function buildUpdateDays(snapshot: UpdatesSnapshot): UpdateDay[] {
  const days = new Map<string, UpdateEntry[]>();

  for (const commit of snapshot.commits) {
    const pullRequestMatch = commit.subject.match(/\s+\(#(\d+)\)$/);
    const pullRequestNumber = pullRequestMatch
      ? Number(pullRequestMatch[1])
      : undefined;
    const { kind, title } = updateKindAndTitle(commit.subject);
    const linesChanged = commit.additions + commit.deletions;
    const entry: UpdateEntry = {
      ...commit,
      shortSha: commit.sha.slice(0, 7),
      title,
      kind,
      linesChanged,
      changeLevel: getUpdateChangeLevel(commit),
      ...(pullRequestNumber
        ? {
            pullRequestNumber,
            pullRequestUrl: `${updatesRepositoryUrl}/pull/${pullRequestNumber}`,
          }
        : {}),
    };
    const date = commit.committedAt.slice(0, 10);
    const entries = days.get(date) ?? [];
    entries.push(entry);
    days.set(date, entries);
  }

  return [...days.entries()].map(([date, entries]) => ({ date, entries }));
}

export function formatUpdateDay(value: string): string {
  return updateDateFormatter.format(new Date(`${value}T00:00:00.000Z`));
}

export function formatUpdateLineCount(value: number): string {
  return updateLineCountFormatter.format(
    normalizeChangeCount(value, "changed line count"),
  );
}
