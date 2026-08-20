import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveLocalNpmCliPath } from "./ensure-node-modules.mjs";
import { auditRepositoryLayout } from "./layout";
import {
  breadcrumbsDir,
  generatedCatalogPath,
  generatedRoot,
  generatedSectionsRoot,
  outlineDataPath,
  progressSectionsPath,
  publicAudioManifestPath,
  publishingRoot,
  readerSectionsPath,
  repoRelative,
  repoRoot,
  searchIndexPath,
} from "./paths";

export type DoctorStatus = "fail" | "ok" | "warn";

export type DoctorCheck = {
  area: string;
  details: string[];
  status: DoctorStatus;
  summary: string;
};

export type RepositoryDoctorReport = {
  checks: DoctorCheck[];
  inspectedAt: string;
};

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: { node?: string; npm?: string };
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

function readPackageManifest(): PackageManifest | undefined {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
    ) as PackageManifest;
  } catch {
    return undefined;
  }
}

type ParsedVersion = readonly [major: number, minor: number, patch: number];

function parseExactVersion(value: string | undefined): ParsedVersion | undefined {
  const match = value?.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function parseComparatorVersion(value: string): ParsedVersion | undefined {
  const match = value.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  if (!match) return undefined;
  return [
    Number(match[1]),
    Number(match[2] ?? "0"),
    Number(match[3] ?? "0"),
  ];
}

function compareVersions(left: ParsedVersion, right: ParsedVersion): number {
  const majorDifference = left[0] - right[0];
  if (majorDifference !== 0) return majorDifference;
  const minorDifference = left[1] - right[1];
  if (minorDifference !== 0) return minorDifference;
  return left[2] - right[2];
}

function parseNodeEngineRange(
  value: string | undefined,
):
  | { minimumInclusive: ParsedVersion; maximumExclusive: ParsedVersion }
  | undefined {
  const comparators = value?.trim().split(/\s+/) ?? [];
  if (comparators.length !== 2) return undefined;
  const minimum = comparators.find((entry) => entry.startsWith(">="));
  const maximum = comparators.find(
    (entry) => entry.startsWith("<") && !entry.startsWith("<="),
  );
  if (!minimum || !maximum) return undefined;
  const minimumInclusive = parseComparatorVersion(minimum.slice(2));
  const maximumExclusive = parseComparatorVersion(maximum.slice(1));
  if (!minimumInclusive || !maximumExclusive) return undefined;
  return { maximumExclusive, minimumInclusive };
}

export function assessNodeVersion({
  engineRequirement,
  preferredVersion,
  runtimeVersion,
}: {
  engineRequirement?: string;
  preferredVersion?: string;
  runtimeVersion: string;
}): DoctorCheck {
  const current = parseExactVersion(runtimeVersion);
  const range = parseNodeEngineRange(engineRequirement);
  const preferred = parseExactVersion(preferredVersion);
  const details = [
    `Runtime: ${runtimeVersion}`,
    `Package requirement: ${engineRequirement ?? "not declared"}`,
    `Preferred local version: ${preferredVersion ?? "not declared"}`,
  ];

  if (current === undefined || range === undefined) {
    return {
      area: "Node",
      details,
      status: "fail",
      summary: "Node support could not be verified from the runtime and package requirement.",
    };
  }
  if (
    compareVersions(current, range.minimumInclusive) < 0 ||
    compareVersions(current, range.maximumExclusive) >= 0
  ) {
    return {
      area: "Node",
      details,
      status: "fail",
      summary: `Runtime ${runtimeVersion} does not satisfy the declared Node requirement ${engineRequirement}.`,
    };
  }
  if (preferred === undefined) {
    return {
      area: "Node",
      details,
      status: "warn",
      summary: `Runtime ${runtimeVersion} satisfies the package requirement, but no exact preferred local version is declared.`,
    };
  }
  if (compareVersions(current, preferred) !== 0) {
    return {
      area: "Node",
      details,
      status: "warn",
      summary: `Runtime ${runtimeVersion} satisfies the package requirement, while the repository prefers exactly ${preferredVersion}.`,
    };
  }
  return {
    area: "Node",
    details,
    status: "ok",
    summary: `Runtime ${runtimeVersion} satisfies the repository requirement and preference.`,
  };
}

export function assessNpmVersion({
  engineRequirement,
  runtimeVersion,
}: {
  engineRequirement?: string;
  runtimeVersion?: string;
}): DoctorCheck {
  const current = parseExactVersion(runtimeVersion);
  const required = parseExactVersion(engineRequirement);
  const details = [
    `Runtime: ${runtimeVersion ?? "unavailable"}`,
    `Package requirement: ${engineRequirement ?? "not declared"}`,
  ];

  if (current === undefined || required === undefined) {
    return {
      area: "npm",
      details,
      status: "fail",
      summary: "npm support could not be verified from the local command and package requirement.",
    };
  }
  if (runtimeVersion !== engineRequirement) {
    return {
      area: "npm",
      details,
      status: "fail",
      summary: `npm ${runtimeVersion} is active, but the repository requires exactly ${engineRequirement}.`,
    };
  }
  return {
    area: "npm",
    details,
    status: "ok",
    summary: `npm ${runtimeVersion} matches the exact repository requirement.`,
  };
}

function nodeCheck(manifest: PackageManifest | undefined): DoctorCheck {
  const nvmPath = path.join(repoRoot, ".nvmrc");
  const nvmVersion = fs.existsSync(nvmPath)
    ? fs.readFileSync(nvmPath, "utf8").trim()
    : undefined;
  return assessNodeVersion({
    engineRequirement: manifest?.engines?.node,
    preferredVersion: nvmVersion,
    runtimeVersion: process.version,
  });
}

function npmCheck(manifest: PackageManifest | undefined): DoctorCheck {
  let npmCliPath: string;
  try {
    npmCliPath = resolveLocalNpmCliPath();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const assessment = assessNpmVersion({
      engineRequirement: manifest?.engines?.npm,
    });
    return {
      ...assessment,
      details: [`Command error: ${message}`, ...assessment.details],
    };
  }
  const result = runReadOnlyCommand(process.execPath, [npmCliPath, "--version"]);
  const assessment = assessNpmVersion({
    engineRequirement: manifest?.engines?.npm,
    runtimeVersion: result.ok ? result.stdout : undefined,
  });
  return {
    ...assessment,
    details: [
      `Command: ${process.execPath} ${npmCliPath}`,
      ...assessment.details,
      ...(result.ok || !result.stderr ? [] : [`Command error: ${result.stderr}`]),
    ],
  };
}

function gitCheck(): DoctorCheck {
  const version = runReadOnlyCommand("git", ["--version"]);
  const topLevel = runReadOnlyCommand("git", ["rev-parse", "--show-toplevel"]);
  const head = runReadOnlyCommand("git", ["rev-parse", "--short=12", "HEAD"]);
  const branch = runReadOnlyCommand("git", [
    "symbolic-ref",
    "--quiet",
    "--short",
    "HEAD",
  ]);
  const details = [
    `Version: ${version.stdout || version.stderr || "unavailable"}`,
    `Repository: ${topLevel.stdout || topLevel.stderr || "unavailable"}`,
    `Branch: ${branch.stdout || "detached"}`,
    `Head: ${head.stdout || head.stderr || "unavailable"}`,
  ];
  const ok = version.ok && topLevel.ok && head.ok;
  return {
    area: "Git",
    details,
    status: ok ? "ok" : "fail",
    summary: ok
      ? "Git can read the repository and current revision."
      : "Git could not read all repository metadata.",
  };
}

function dependencyCheck(manifest: PackageManifest | undefined): DoctorCheck {
  const lockPath = path.join(repoRoot, "package-lock.json");
  const modulesPath = path.join(repoRoot, "node_modules");
  const dependencyNames = Object.keys({
    ...(manifest?.dependencies ?? {}),
    ...(manifest?.devDependencies ?? {}),
  }).sort();
  const missingDependencies = dependencyNames.filter(
    (name) => !fs.existsSync(path.join(modulesPath, name, "package.json")),
  );
  const packageExists = Boolean(manifest);
  const lockExists = fs.existsSync(lockPath);
  const modulesExist = fs.existsSync(modulesPath);
  const details = [
    `package.json: ${packageExists ? "present" : "missing or invalid"}`,
    `package-lock.json: ${lockExists ? "present" : "missing"}`,
    `node_modules: ${modulesExist ? "present" : "missing"}`,
    `Declared packages: ${dependencyNames.length.toLocaleString()}`,
    `Missing top level packages: ${missingDependencies.length.toLocaleString()}`,
    ...missingDependencies.slice(0, 12).map((name) => `Missing: ${name}`),
  ];
  const ok =
    packageExists &&
    lockExists &&
    modulesExist &&
    missingDependencies.length === 0;
  return {
    area: "Dependencies",
    details,
    status: ok ? "ok" : "fail",
    summary: ok
      ? "Locked top level dependencies are present."
      : "Dependency installation is incomplete or unreadable.",
  };
}

function generatedOutputCheck(): DoctorCheck {
  const outputs = [
    generatedRoot,
    generatedSectionsRoot,
    generatedCatalogPath,
    readerSectionsPath,
    progressSectionsPath,
    breadcrumbsDir,
    searchIndexPath,
    outlineDataPath,
    publicAudioManifestPath,
  ];
  const present = outputs.filter((filePath) => fs.existsSync(filePath));
  const missing = outputs.filter((filePath) => !fs.existsSync(filePath));
  return {
    area: "Generated output",
    details: [
      `Present: ${present.length.toLocaleString()} of ${outputs.length.toLocaleString()}`,
      ...present.map((filePath) => `Present: ${repoRelative(filePath)}`),
      ...missing.map((filePath) => `Missing: ${repoRelative(filePath)}`),
    ],
    status: missing.length === 0 ? "ok" : "warn",
    summary:
      missing.length === 0
        ? "Expected local generated outputs are present."
        : "Some disposable generated outputs have not been prepared in this worktree.",
  };
}

function layoutChecks(): DoctorCheck[] {
  const audit = auditRepositoryLayout();
  const publishingPrefix = `${repoRelative(publishingRoot)}/`;
  const publishingIssues = audit.issues.filter((issue) =>
    issue.path.startsWith(publishingPrefix),
  );
  const sourceIssues = audit.issues.filter(
    (issue) => !issue.path.startsWith(publishingPrefix),
  );
  const invalidPublishingJson = audit.publishingFiles.filter((filePath) => {
    try {
      JSON.parse(fs.readFileSync(path.join(repoRoot, filePath), "utf8"));
      return false;
    } catch {
      return true;
    }
  });

  return [
    {
      area: "Source packages",
      details: [
        `Volume packages: ${audit.volumePackages.length.toLocaleString()}`,
        `Canonical source files: ${audit.sourceFiles.length.toLocaleString()}`,
        ...sourceIssues.map(
          (issue) => `${issue.path}: ${issue.message}`,
        ),
      ],
      status: sourceIssues.length === 0 ? "ok" : "fail",
      summary:
        sourceIssues.length === 0
          ? "All nine canonical volume packages are complete."
          : "Canonical editorial source layout has problems.",
    },
    {
      area: "Publishing state",
      details: [
        `Required files present: ${audit.publishingFiles.length.toLocaleString()}`,
        ...publishingIssues.map(
          (issue) => `${issue.path}: ${issue.message}`,
        ),
        ...invalidPublishingJson.map(
          (filePath) => `${filePath}: file is not valid JSON`,
        ),
      ],
      status:
        publishingIssues.length === 0 && invalidPublishingJson.length === 0
          ? "ok"
          : "fail",
      summary:
        publishingIssues.length === 0 && invalidPublishingJson.length === 0
          ? "Durable publishing records are present and parse as JSON."
          : "Durable publishing state is missing or invalid.",
    },
  ];
}

function workingTreeCheck(): DoctorCheck {
  const status = runReadOnlyCommand("git", [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  if (!status.ok) {
    return {
      area: "Working tree",
      details: [status.stderr || "git status failed"],
      status: "fail",
      summary: "Working tree state could not be read.",
    };
  }
  const changes = status.stdout ? status.stdout.split("\n") : [];
  return {
    area: "Working tree",
    details: [
      `Changes: ${changes.length.toLocaleString()}`,
      ...changes.slice(0, 25),
      ...(changes.length > 25
        ? [`Remaining changes: ${(changes.length - 25).toLocaleString()}`]
        : []),
    ],
    status: changes.length === 0 ? "ok" : "warn",
    summary:
      changes.length === 0
        ? "Working tree is clean."
        : "Working tree has local changes. They were not modified.",
  };
}

export function inspectRepositoryHealth(): RepositoryDoctorReport {
  const manifest = readPackageManifest();
  return {
    checks: [
      nodeCheck(manifest),
      npmCheck(manifest),
      gitCheck(),
      dependencyCheck(manifest),
      generatedOutputCheck(),
      ...layoutChecks(),
      workingTreeCheck(),
    ],
    inspectedAt: new Date().toISOString(),
  };
}

export function formatRepositoryDoctorReport(
  report: RepositoryDoctorReport,
): string {
  const lines = [
    "Repository doctor",
    `Inspected: ${report.inspectedAt}`,
    "The doctor inspection is read only. Its npm prehook may repair local dependencies before this report starts.",
  ];
  for (const check of report.checks) {
    lines.push(
      "",
      `[${check.status.toUpperCase()}] ${check.area}: ${check.summary}`,
      ...check.details.map((detail) => `  ${detail}`),
    );
  }
  return lines.join("\n");
}

function runCli(): void {
  try {
    const report = inspectRepositoryHealth();
    console.log(formatRepositoryDoctorReport(report));
    if (report.checks.some((check) => check.status === "fail")) {
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
