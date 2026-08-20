#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(scriptPath), "../..");

export const minimumNodeVersion = "22.12.0";
export const maximumNodeMajorExclusive = 23;
export const requiredNpmVersion = "10.9.0";

function pathsForRoot(root) {
  const nodeModulesPath = path.join(root, "node_modules");
  const runtimePath = path.join(root, ".coherence-runtime");
  return {
    installStatePath: path.join(
      nodeModulesPath,
      ".coherence-install-state.json",
    ),
    nodeModulesPath,
    npmHiddenLockPath: path.join(nodeModulesPath, ".package-lock.json"),
    packageLockPath: path.join(root, "package-lock.json"),
    installLockPath: path.join(runtimePath, "dependency-install.lock"),
    runtimePath,
  };
}

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function readLockOwner(lockPath) {
  try {
    return readJson(path.join(lockPath, "owner.json"));
  } catch {
    return null;
  }
}

function lockIsStale(lockPath, owner, graceMilliseconds) {
  if (processExists(owner?.pid)) return false;
  try {
    return Date.now() - statSync(lockPath).mtimeMs >= graceMilliseconds;
  } catch {
    return true;
  }
}

export function acquireInstallLock({
  graceMilliseconds = 5_000,
  lockPath,
  log = console.log,
  pollMilliseconds = 100,
  timeoutMilliseconds = 300_000,
} = {}) {
  if (!lockPath) throw new Error("Dependency install lock path is required.");
  mkdirSync(path.dirname(lockPath), { recursive: true });
  const startedAt = Date.now();
  const token = `${process.pid}-${startedAt}-${Math.random().toString(16).slice(2)}`;

  while (true) {
    try {
      mkdirSync(lockPath);
      writeFileSync(
        path.join(lockPath, "owner.json"),
        `${JSON.stringify({ createdAt: new Date().toISOString(), pid: process.pid, token }, null, 2)}\n`,
      );
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const owner = readLockOwner(lockPath);
        if (owner?.token === token) {
          rmSync(lockPath, { force: true, recursive: true });
        }
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }

    const owner = readLockOwner(lockPath);
    if (lockIsStale(lockPath, owner, graceMilliseconds)) {
      log("Recovering a stale dependency install lock...");
      rmSync(lockPath, {
        force: true,
        maxRetries: 5,
        recursive: true,
        retryDelay: 100,
      });
      continue;
    }

    if (Date.now() - startedAt >= timeoutMilliseconds) {
      throw new Error(
        `Timed out waiting for dependency bootstrap owned by PID ${owner?.pid ?? "unknown"}.`,
      );
    }
    sleepSync(pollMilliseconds);
  }
}

function isRootNodeModulesSymlink(nodeModulesPath) {
  try {
    return lstatSync(nodeModulesPath).isSymbolicLink();
  } catch {
    return false;
  }
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function versionParts(version) {
  const match = String(version).match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  return match
    ? [Number(match[1]), Number(match[2]), Number(match[3])]
    : undefined;
}

function compareVersions(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    const difference = left[index] - right[index];
    if (difference !== 0) return difference;
  }
  return 0;
}

export function isSupportedNodeVersion(
  version,
  minimumVersion = minimumNodeVersion,
  maximumMajor = maximumNodeMajorExclusive,
) {
  const actual = versionParts(version);
  const minimum = versionParts(minimumVersion);
  return Boolean(
    actual &&
      minimum &&
      actual[0] < maximumMajor &&
      compareVersions(actual, minimum) >= 0,
  );
}

export function assertSupportedNode(
  version = process.versions.node,
  minimumVersion = minimumNodeVersion,
  maximumMajor = maximumNodeMajorExclusive,
) {
  if (isSupportedNodeVersion(version, minimumVersion, maximumMajor)) return;
  throw new Error(
    `Node ${version} is not supported. This project requires Node >=${minimumVersion} <${maximumMajor} (see .nvmrc and package.json engines). Run \`nvm use\` or install a supported Node before continuing.`,
  );
}

export function resolveLocalNpmCliPath({
  exists = existsSync,
  nodeExecutable = process.execPath,
  platform = process.platform,
} = {}) {
  const executableDirectory = path.dirname(nodeExecutable);
  const candidates =
    platform === "win32"
      ? [
          path.join(executableDirectory, "node_modules/npm/bin/npm-cli.js"),
          path.resolve(
            executableDirectory,
            "../lib/node_modules/npm/bin/npm-cli.js",
          ),
        ]
      : [
          path.resolve(
            executableDirectory,
            "../lib/node_modules/npm/bin/npm-cli.js",
          ),
          path.join(executableDirectory, "node_modules/npm/bin/npm-cli.js"),
        ];
  const npmCliPath = candidates.find((candidate) => exists(candidate));
  if (!npmCliPath) {
    throw new Error(
      `Unable to locate the npm CLI installed with Node at ${nodeExecutable}.`,
    );
  }
  return npmCliPath;
}

export function readLocalNpmVersion({
  exists = existsSync,
  nodeExecutable = process.execPath,
  platform = process.platform,
  run = spawnSync,
} = {}) {
  const npmCliPath = resolveLocalNpmCliPath({
    exists,
    nodeExecutable,
    platform,
  });
  const result = run(nodeExecutable, [npmCliPath, "--version"], {
    encoding: "utf8",
  });
  const version = result.stdout?.trim();
  if (result.status !== 0 || !version) {
    throw (
      result.error ??
      new Error("Unable to determine the npm version bundled with Node.")
    );
  }
  return version;
}

export function assertSupportedNpm(
  version,
  requiredVersion = requiredNpmVersion,
) {
  if (version === requiredVersion) return;
  throw new Error(
    `npm ${version} is not supported. This project requires npm ${requiredVersion} (see package.json packageManager and engines). Run \`nvm use\` before continuing.`,
  );
}

export function buildExpectedState(
  nodeVersion = process.versions.node,
  platform = process.platform,
  architecture = process.arch,
  npmVersion = readLocalNpmVersion(),
) {
  if (!versionParts(nodeVersion)) {
    throw new Error(`Could not determine the Node version from ${nodeVersion}.`);
  }
  return {
    architecture,
    nodeVersion: String(nodeVersion).replace(/^v/, ""),
    packageManager: "npm",
    npmVersion,
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
    actualState?.nodeVersion === expectedState.nodeVersion &&
    actualState?.packageManager === expectedState.packageManager &&
    actualState?.npmVersion === expectedState.npmVersion &&
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
  exists = existsSync,
  nodeExecutable = process.execPath,
  platform = process.platform,
  root = defaultRepoRoot,
  run = spawnSync,
} = {}) {
  const npmCliPath = resolveLocalNpmCliPath({
    exists,
    nodeExecutable,
    platform,
  });
  const result = run(nodeExecutable, [npmCliPath, "ci"], {
    cwd: root,
    env: {
      ...environment,
      COHERENCE_BOOTSTRAPPING: "1",
    },
    stdio: "inherit",
  });

  if (result.status === null) {
    throw result.error ?? new Error("npm ci did not finish.");
  }
  return result.status;
}

export function ensureDependencies({
  acquireLock = acquireInstallLock,
  architecture = process.arch,
  environment = process.env,
  log = console.log,
  nodeVersion = process.versions.node,
  npmVersion,
  platform = process.platform,
  readNpmVersion = readLocalNpmVersion,
  root = defaultRepoRoot,
  runInstall = runNpmCi,
} = {}) {
  if (environment.COHERENCE_BOOTSTRAPPING === "1") {
    return { exitCode: 0, status: "skipped" };
  }

  assertSupportedNode(nodeVersion);
  const resolvedNpmVersion = npmVersion ?? readNpmVersion();
  assertSupportedNpm(resolvedNpmVersion);
  const paths = pathsForRoot(root);
  if (!existsSync(paths.packageLockPath)) {
    throw new Error("Missing package-lock.json. Cannot bootstrap dependencies.");
  }

  const expectedState = buildExpectedState(
    nodeVersion,
    platform,
    architecture,
    resolvedNpmVersion,
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

  const releaseLock = acquireLock({ lockPath: paths.installLockPath, log });
  try {
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

    if (isRootNodeModulesSymlink(paths.nodeModulesPath)) {
      log("Replacing the worktree node_modules symlink with a local dependency tree...");
    }
    rmSync(paths.installStatePath, { force: true });
    rmSync(paths.nodeModulesPath, {
      force: true,
      maxRetries: 5,
      recursive: true,
      retryDelay: 100,
    });
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
  } finally {
    releaseLock();
  }
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
