#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const packageLockPath = path.join(repoRoot, "package-lock.json");
const nodeModulesPath = path.join(repoRoot, "node_modules");
const npmHiddenLockPath = path.join(nodeModulesPath, ".package-lock.json");
const installStatePath = path.join(
  nodeModulesPath,
  ".coherence-install-state.json",
);

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function readInstallState() {
  try {
    return readJson(installStatePath);
  } catch {
    return null;
  }
}

function buildExpectedState() {
  return {
    nodeMajor: process.versions.node.split(".")[0],
    packageManager: "npm",
  };
}

// npm writes node_modules/.package-lock.json as its record of what is actually
// on disk, and keeps it in step with the root lockfile on every install. The
// previous check hashed package-lock.json into our own state file, so a routine
// `npm install <pkg>` (which rewrites both lockfiles but not our state file) read
// as stale and forced a full `npm ci`, wiping node_modules and the package the
// developer just added (TEST-09). Comparing the two lockfiles directly is npm's
// own "is the tree in sync" signal, so `npm install` now leaves us in sync.
//
// The two files are not byte-identical even when in sync: the root lockfile also
// lists packages that are not installed on this platform (optional deps and
// os/cpu-gated native binaries), and carries manifest metadata on the root
// entry. So we compare by identity fields over the packages that matter.
function packageMatches(list, actual) {
  const values = Array.isArray(list) ? list : [list];
  const negated = values
    .filter((value) => value.startsWith("!"))
    .map((value) => value.slice(1));
  if (negated.includes(actual)) return false;
  const allowed = values.filter((value) => !value.startsWith("!"));
  return allowed.length === 0 || allowed.includes(actual);
}

// A root-lockfile package that npm is expected to place on disk here. Optional
// deps (installed or not depending on the resolved platform) and packages gated
// to another os/cpu are legitimately absent, so they do not signal drift.
function isExpectedOnThisPlatform(entry) {
  if (entry.optional || entry.devOptional) return false;
  if (entry.os && !packageMatches(entry.os, process.platform)) return false;
  if (entry.cpu && !packageMatches(entry.cpu, process.arch)) return false;
  return true;
}

function packageIdentity(entry) {
  return [
    entry.version ?? "",
    entry.resolved ?? "",
    entry.integrity ?? "",
    entry.link ?? false,
  ].join("|");
}

function nodeModulesInSyncWithLockfile() {
  if (!existsSync(npmHiddenLockPath)) return false;
  try {
    const rootPackages = readJson(packageLockPath).packages ?? {};
    const installedPackages = readJson(npmHiddenLockPath).packages ?? {};

    // Every installed package must still match the root lockfile. Catches a
    // version bump or removal pulled in from git since the last install.
    for (const [key, entry] of Object.entries(installedPackages)) {
      if (key === "") continue;
      const rootEntry = rootPackages[key];
      if (!rootEntry || packageIdentity(rootEntry) !== packageIdentity(entry)) {
        return false;
      }
    }

    // Every package the root lockfile expects on this platform must be present.
    // Catches a dependency added to the lockfile since the last install.
    for (const [key, entry] of Object.entries(rootPackages)) {
      if (key === "") continue;
      if (isExpectedOnThisPlatform(entry) && !(key in installedPackages)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

function isCurrent(expectedState) {
  const actualState = readInstallState();

  return (
    nodeModulesInSyncWithLockfile() &&
    actualState?.nodeMajor === expectedState.nodeMajor &&
    actualState?.packageManager === expectedState.packageManager
  );
}

function writeInstallState(expectedState) {
  mkdirSync(nodeModulesPath, { recursive: true });
  writeFileSync(
    installStatePath,
    `${JSON.stringify(expectedState, null, 2)}\n`,
  );
}

function runNpmCi() {
  const localNpmCommand = path.join(
    path.dirname(process.execPath),
    process.platform === "win32" ? "npm.cmd" : "npm",
  );
  const npmCommand = existsSync(localNpmCommand)
    ? localNpmCommand
    : process.platform === "win32"
      ? "npm.cmd"
      : "npm";
  // Node >= 18.20 / 20.12 refuse to spawn a .cmd/.bat shim on Windows without
  // shell: true (CVE-2024-27980), so npm.cmd throws EINVAL otherwise. With the
  // shell on, the command is joined into one string, so the path (which may
  // contain spaces, e.g. "C:\Program Files\nodejs\npm.cmd") must be quoted.
  const isWindows = process.platform === "win32";
  const result = spawnSync(isWindows ? `"${npmCommand}"` : npmCommand, ["ci"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      COHERENCE_BOOTSTRAPPING: "1",
    },
    stdio: "inherit",
    shell: isWindows,
  });

  if (result.status === null) {
    throw result.error ?? new Error("npm ci did not finish.");
  }

  return result.status;
}

const minimumNodeMajor = 20;

function assertSupportedNode() {
  const [major] = process.versions.node.split(".");
  if (Number(major) < minimumNodeMajor) {
    console.error(
      `Node ${process.versions.node} is too old. This project requires Node >= ${minimumNodeMajor}.9 (see .nvmrc and package.json engines). Run \`nvm use\` or install a supported Node before continuing.`,
    );
    process.exit(1);
  }
}

function main() {
  if (process.env.COHERENCE_BOOTSTRAPPING === "1") {
    return;
  }

  assertSupportedNode();

  if (!existsSync(packageLockPath)) {
    console.error("Missing package-lock.json. Cannot bootstrap dependencies.");
    process.exit(1);
  }

  const expectedState = buildExpectedState();

  if (isCurrent(expectedState)) {
    return;
  }

  console.log("Installing npm dependencies for this worktree...");
  const status = runNpmCi();

  if (status !== 0) {
    process.exit(status);
  }

  writeInstallState(expectedState);
  console.log("Dependency bootstrap complete.");
}

main();
