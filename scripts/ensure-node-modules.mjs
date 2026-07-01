#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
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

function hashValue(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hashFile(filePath) {
  return hashValue(readFileSync(filePath));
}

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
    lockfileSha256: hashFile(packageLockPath),
    nodeMajor: process.versions.node.split(".")[0],
    packageManager: "npm",
  };
}

function isCurrent(expectedState) {
  const actualState = readInstallState();

  return (
    existsSync(npmHiddenLockPath) &&
    actualState?.lockfileSha256 === expectedState.lockfileSha256 &&
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
  const npmCommand = path.join(
    path.dirname(process.execPath),
    process.platform === "win32" ? "npm.cmd" : "npm",
  );
  const result = spawnSync(npmCommand, ["ci"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      COHERENCE_BOOTSTRAPPING: "1",
    },
    stdio: "inherit",
  });

  if (result.status === null) {
    throw result.error ?? new Error("npm ci did not finish.");
  }

  return result.status;
}

function main() {
  if (process.env.COHERENCE_BOOTSTRAPPING === "1") {
    return;
  }

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
