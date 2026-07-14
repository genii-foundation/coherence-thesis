#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(scriptPath), "../..");

export const minimumNodeMajor = 22;

function pathsForRoot(root) {
  const nodeModulesPath = path.join(root, "node_modules");
  return {
    installStatePath: path.join(
      nodeModulesPath,
      ".coherence-install-state.json",
    ),
    nodeModulesPath,
    npmHiddenLockPath: path.join(nodeModulesPath, ".package-lock.json"),
    packageLockPath: path.join(root, "package-lock.json"),
  };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function nodeMajor(version) {
  const match = String(version).match(/^v?(\d+)/);
  return match ? Number(match[1]) : undefined;
}

export function isSupportedNodeVersion(
  version,
  minimumMajor = minimumNodeMajor,
) {
  const major = nodeMajor(version);
  return major !== undefined && major >= minimumMajor;
}

export function assertSupportedNode(
  version = process.versions.node,
  minimumMajor = minimumNodeMajor,
) {
  if (isSupportedNodeVersion(version, minimumMajor)) return;
  throw new Error(
    `Node ${version} is not supported. This project requires Node >= ${minimumMajor} (see .nvmrc and package.json engines). Run \`nvm use\` or install a supported Node before continuing.`,
  );
}

export function buildExpectedState(
  nodeVersion = process.versions.node,
  platform = process.platform,
  architecture = process.arch,
) {
  const major = nodeMajor(nodeVersion);
  if (major === undefined) {
    throw new Error(`Could not determine the Node major version from ${nodeVersion}.`);
  }
  return {
    architecture,
    nodeMajor: String(major),
    packageManager: "npm",
    platform,
  };
}

function readInstallState(installStatePath) {
  try {
    return readJson(installStatePath);
  } catch {
    return null;
  }
}

function packageMatches(list, actual) {
  const values = Array.isArray(list) ? list : [list];
  const negated = values
    .filter((value) => value.startsWith("!"))
    .map((value) => value.slice(1));
  if (negated.includes(actual)) return false;
  const allowed = values.filter((value) => !value.startsWith("!"));
  return allowed.length === 0 || allowed.includes(actual);
}

function isExpectedOnThisPlatform(entry, platform, architecture) {
  if (entry.optional || entry.devOptional) return false;
  if (entry.os && !packageMatches(entry.os, platform)) return false;
  if (entry.cpu && !packageMatches(entry.cpu, architecture)) return false;
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

export function nodeModulesInSyncWithLockfile({
  architecture = process.arch,
  npmHiddenLockPath,
  packageLockPath,
  platform = process.platform,
}) {
  if (!existsSync(npmHiddenLockPath)) return false;
  try {
    const rootPackages = readJson(packageLockPath).packages ?? {};
    const installedPackages = readJson(npmHiddenLockPath).packages ?? {};

    for (const [key, entry] of Object.entries(installedPackages)) {
      if (key === "") continue;
      const rootEntry = rootPackages[key];
      if (!rootEntry || packageIdentity(rootEntry) !== packageIdentity(entry)) {
        return false;
      }
      if (!existsSync(path.join(path.dirname(packageLockPath), key))) return false;
    }

    for (const [key, entry] of Object.entries(rootPackages)) {
      if (key === "") continue;
      if (!isExpectedOnThisPlatform(entry, platform, architecture)) continue;
      if (!(key in installedPackages)) return false;
      if (!existsSync(path.join(path.dirname(packageLockPath), key))) return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function isCurrentInstall({
  architecture = process.arch,
  expectedState,
  installStatePath,
  npmHiddenLockPath,
  packageLockPath,
  platform = process.platform,
}) {
  const actualState = readInstallState(installStatePath);
  return (
    nodeModulesInSyncWithLockfile({
      architecture,
      npmHiddenLockPath,
      packageLockPath,
      platform,
    }) &&
    actualState?.nodeMajor === expectedState.nodeMajor &&
    actualState?.packageManager === expectedState.packageManager &&
    actualState?.platform === expectedState.platform &&
    actualState?.architecture === expectedState.architecture
  );
}

export function writeInstallStateAtomic(installStatePath, expectedState) {
  mkdirSync(path.dirname(installStatePath), { recursive: true });
  const temporaryPath = `${installStatePath}.${process.pid}.tmp`;
  try {
    writeFileSync(
      temporaryPath,
      `${JSON.stringify(expectedState, null, 2)}\n`,
    );
    renameSync(temporaryPath, installStatePath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

export function runNpmCi({
  environment = process.env,
  root = defaultRepoRoot,
} = {}) {
  const localNpmCommand = path.join(
    path.dirname(process.execPath),
    process.platform === "win32" ? "npm.cmd" : "npm",
  );
  const npmCommand = existsSync(localNpmCommand)
    ? localNpmCommand
    : process.platform === "win32"
      ? "npm.cmd"
      : "npm";
  const isWindows = process.platform === "win32";
  const result = spawnSync(isWindows ? `"${npmCommand}"` : npmCommand, ["ci"], {
    cwd: root,
    env: {
      ...environment,
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

export function ensureDependencies({
  architecture = process.arch,
  environment = process.env,
  log = console.log,
  nodeVersion = process.versions.node,
  platform = process.platform,
  root = defaultRepoRoot,
  runInstall = runNpmCi,
} = {}) {
  if (environment.COHERENCE_BOOTSTRAPPING === "1") {
    return { exitCode: 0, status: "skipped" };
  }

  assertSupportedNode(nodeVersion);
  const paths = pathsForRoot(root);
  if (!existsSync(paths.packageLockPath)) {
    throw new Error("Missing package-lock.json. Cannot bootstrap dependencies.");
  }

  const expectedState = buildExpectedState(
    nodeVersion,
    platform,
    architecture,
  );
  if (
    isCurrentInstall({
      architecture,
      expectedState,
      installStatePath: paths.installStatePath,
      npmHiddenLockPath: paths.npmHiddenLockPath,
      packageLockPath: paths.packageLockPath,
      platform,
    })
  ) {
    return { exitCode: 0, status: "current" };
  }

  rmSync(paths.installStatePath, { force: true });
  rmSync(paths.nodeModulesPath, { force: true, recursive: true });
  log("Installing npm dependencies for this worktree...");
  const exitCode = runInstall({ environment, root });
  if (exitCode !== 0) {
    rmSync(paths.installStatePath, { force: true });
    return { exitCode, status: "failed" };
  }

  if (
    !nodeModulesInSyncWithLockfile({
      architecture,
      npmHiddenLockPath: paths.npmHiddenLockPath,
      packageLockPath: paths.packageLockPath,
      platform,
    })
  ) {
    rmSync(paths.installStatePath, { force: true });
    throw new Error(
      "npm ci completed without a synchronized node_modules lockfile. Dependency bootstrap is incomplete.",
    );
  }

  writeInstallStateAtomic(paths.installStatePath, expectedState);
  log("Dependency bootstrap complete.");
  return { exitCode: 0, status: "installed" };
}

function main() {
  try {
    const result = ensureDependencies();
    if (result.exitCode !== 0) process.exitCode = result.exitCode;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main();
}
