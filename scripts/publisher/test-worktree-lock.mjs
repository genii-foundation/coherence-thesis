import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";

import { generatedPublisherRoot, repoRoot } from "../repository/paths.ts";

const defaultPublisherRepositorySourceTestLockPath = path.join(
  generatedPublisherRoot,
  ".repository-source-test-lock",
);
const publisherRepositorySourceTestLockOwnerMaxBytes = 512;
const publisherRepositorySourceTestLockTokenMaxCodeUnits = 128;

// This lock coordinates cooperative repository-owned Vitest workers. The
// canonical path, nofollow reads, inode checks, and exact owner token reject
// unsafe or replaced state observed between operations. A hostile same-user
// process that swaps path components during a filesystem call is outside this
// test coordination boundary and requires an operating-system advisory lock.

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

function assertStrictlyInside(root, target, label) {
  const relative = path.relative(root, target);
  if (
    relative.length === 0 ||
    path.isAbsolute(relative) ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`)
  ) {
    throw new Error(`${label} must stay strictly inside its generated root.`);
  }
}

function assertAtOrInside(root, target, label) {
  const relative = path.relative(root, target);
  if (
    path.isAbsolute(relative) ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`)
  ) {
    throw new Error(`${label} escaped its generated root.`);
  }
}

function ensureSafeDirectoryChain(root, directory) {
  const rootStats = lstatSync(root);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    throw new Error("Publisher repository source test lock root is unsafe.");
  }

  const relative = path.relative(root, directory);
  if (
    path.isAbsolute(relative) ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`)
  ) {
    throw new Error("Publisher repository source test lock parent escaped the worktree.");
  }

  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      mkdirSync(current, { mode: 0o700 });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    const stats = lstatSync(current);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error("Publisher repository source test lock parent is unsafe.");
    }
  }
}

function canonicalLockPath(lockPath) {
  if (typeof lockPath !== "string" || lockPath.length === 0) {
    throw new TypeError("Publisher repository source test lock path is invalid.");
  }
  const resolved = path.resolve(lockPath);
  if (lockPath !== resolved) {
    throw new Error(
      "Publisher repository source test lock path must be canonical and absolute.",
    );
  }
  return resolved;
}

function assertSafeLockParent(lockParent) {
  ensureSafeDirectoryChain(repoRoot, lockParent);
  const canonicalGeneratedRoot = path.resolve(generatedPublisherRoot);
  const realGeneratedRoot = realpathSync(canonicalGeneratedRoot);
  const realLockParent = realpathSync(lockParent);
  if (
    realGeneratedRoot !== canonicalGeneratedRoot ||
    realLockParent !== lockParent
  ) {
    throw new Error(
      "Publisher repository source test lock parent is not canonical.",
    );
  }
  assertAtOrInside(
    realGeneratedRoot,
    realLockParent,
    "Publisher repository source test lock parent",
  );
}

function readLockOwner(lockPath) {
  let descriptor;
  try {
    descriptor = openSync(
      lockPath,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }

  try {
    const initialStats = fstatSync(descriptor);
    if (!initialStats.isFile()) {
      throw new Error(
        "Publisher repository source test lock is not a regular file.",
      );
    }
    if (initialStats.size > publisherRepositorySourceTestLockOwnerMaxBytes) {
      return null;
    }

    const bytes = Buffer.alloc(
      publisherRepositorySourceTestLockOwnerMaxBytes + 1,
    );
    let byteLength = 0;
    while (byteLength < bytes.length) {
      const readLength = readSync(
        descriptor,
        bytes,
        byteLength,
        bytes.length - byteLength,
        byteLength,
      );
      if (readLength === 0) break;
      byteLength += readLength;
    }
    const finalStats = fstatSync(descriptor);
    if (
      byteLength > publisherRepositorySourceTestLockOwnerMaxBytes ||
      finalStats.size !== byteLength ||
      finalStats.dev !== initialStats.dev ||
      finalStats.ino !== initialStats.ino ||
      realpathSync(lockPath) !== lockPath
    ) {
      return null;
    }

    const owner = JSON.parse(bytes.subarray(0, byteLength).toString("utf8"));
    if (
      !owner ||
      typeof owner !== "object" ||
      Array.isArray(owner) ||
      Object.keys(owner).sort().join("\0") !== "pid\0token" ||
      !Number.isInteger(owner?.pid) ||
      owner.pid <= 0 ||
      typeof owner?.token !== "string" ||
      owner.token.length === 0 ||
      owner.token.length > publisherRepositorySourceTestLockTokenMaxCodeUnits
    ) {
      return null;
    }
    return {
      dev: initialStats.dev,
      ino: initialStats.ino,
      pid: owner.pid,
      token: owner.token,
    };
  } catch {
    return null;
  } finally {
    closeSync(descriptor);
  }
}

function unlinkExactOwnedLock(lockPath, ownedStats) {
  const currentStats = lstatSync(lockPath);
  if (
    currentStats.isSymbolicLink() ||
    !currentStats.isFile() ||
    currentStats.dev !== ownedStats.dev ||
    currentStats.ino !== ownedStats.ino ||
    realpathSync(lockPath) !== lockPath
  ) {
    throw new Error(
      "Publisher repository source test lock path changed before release.",
    );
  }
  unlinkSync(lockPath);
}

export function acquirePublisherRepositorySourceTestLock({
  lockPath = defaultPublisherRepositorySourceTestLockPath,
  malformedOwnerGraceMilliseconds = 5_000,
  nowMilliseconds = () => performance.now(),
  pollMilliseconds = 25,
  sleepMilliseconds = sleepSync,
  timeoutMilliseconds = 240_000,
} = {}) {
  for (const [label, value] of [
    ["malformed owner grace", malformedOwnerGraceMilliseconds],
    ["poll interval", pollMilliseconds],
    ["timeout", timeoutMilliseconds],
  ]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(`Publisher repository source test lock ${label} is invalid.`);
    }
  }

  if (typeof nowMilliseconds !== "function" || typeof sleepMilliseconds !== "function") {
    throw new TypeError("Publisher repository source test lock clock is invalid.");
  }

  lockPath = canonicalLockPath(lockPath);
  assertStrictlyInside(
    generatedPublisherRoot,
    lockPath,
    "Publisher repository source test lock",
  );
  const lockParent = path.dirname(lockPath);
  assertSafeLockParent(lockParent);
  const startedAt = nowMilliseconds();
  const deadline = startedAt + timeoutMilliseconds;
  const token = `${process.pid}-${Date.now()}-${randomUUID()}`;
  let malformedOwnerSince = null;
  let firstAttempt = true;

  while (true) {
    const isRetry = !firstAttempt;
    if (isRetry && nowMilliseconds() >= deadline) {
      throw new Error(
        "Timed out waiting for Publisher repository source test lock.",
      );
    }
    firstAttempt = false;
    assertSafeLockParent(lockParent);

    let descriptor = null;
    try {
      descriptor = openSync(lockPath, "wx", 0o600);
      const ownedStats = fstatSync(descriptor);
      if (!ownedStats.isFile() || realpathSync(lockPath) !== lockPath) {
        throw new Error(
          "Publisher repository source test lock creation escaped its canonical path.",
        );
      }
      if (isRetry && nowMilliseconds() >= deadline) {
        closeSync(descriptor);
        descriptor = null;
        assertSafeLockParent(lockParent);
        unlinkExactOwnedLock(lockPath, ownedStats);
        throw new Error(
          "Timed out waiting for Publisher repository source test lock.",
        );
      }
      writeFileSync(
        descriptor,
        `${JSON.stringify({ pid: process.pid, token })}\n`,
        "utf8",
      );
      fsyncSync(descriptor);
      if (isRetry && nowMilliseconds() >= deadline) {
        closeSync(descriptor);
        descriptor = null;
        assertSafeLockParent(lockParent);
        unlinkExactOwnedLock(lockPath, ownedStats);
        throw new Error(
          "Timed out waiting for Publisher repository source test lock.",
        );
      }
      closeSync(descriptor);
      descriptor = null;

      let released = false;
      return () => {
        if (released) return;
        assertSafeLockParent(lockParent);
        const owner = readLockOwner(lockPath);
        if (
          owner?.token !== token ||
          owner.dev !== ownedStats.dev ||
          owner.ino !== ownedStats.ino
        ) {
          throw new Error(
            "Publisher repository source test lock ownership changed before release.",
          );
        }
        unlinkExactOwnedLock(lockPath, ownedStats);
        released = true;
      };
    } catch (error) {
      if (descriptor !== null) closeSync(descriptor);
      if (error?.code !== "EEXIST") throw error;
    }

    const owner = readLockOwner(lockPath);
    if (owner === undefined) {
      malformedOwnerSince = null;
      continue;
    }
    if (owner === null) {
      malformedOwnerSince ??= nowMilliseconds();
      if (
        nowMilliseconds() - malformedOwnerSince >=
        malformedOwnerGraceMilliseconds
      ) {
        throw new Error(
          "Publisher repository source test lock is malformed and requires explicit cleanup.",
        );
      }
    } else {
      malformedOwnerSince = null;
      if (!processExists(owner.pid)) {
        throw new Error(
          `Publisher repository source test lock is stale for PID ${owner.pid} and requires explicit cleanup.`,
        );
      }
    }

    const remainingMilliseconds = deadline - nowMilliseconds();
    if (remainingMilliseconds <= 0) {
      throw new Error(
        `Timed out waiting for Publisher repository source test lock owned by PID ${owner?.pid ?? "unknown"}.`,
      );
    }
    sleepMilliseconds(Math.min(pollMilliseconds, remainingMilliseconds));
  }
}
