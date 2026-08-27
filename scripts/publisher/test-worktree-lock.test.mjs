import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { generatedPublisherRoot } from "../repository/paths.ts";
import { acquirePublisherRepositorySourceTestLock } from "./test-worktree-lock.mjs";

const cleanupPaths = [];

function fixtureRoot() {
  fs.mkdirSync(generatedPublisherRoot, { recursive: true });
  const root = fs.mkdtempSync(
    path.join(generatedPublisherRoot, "test-worktree-lock-test-"),
  );
  cleanupPaths.push(root);
  return root;
}

afterEach(() => {
  while (cleanupPaths.length > 0) {
    fs.rmSync(cleanupPaths.pop(), { force: true, recursive: true });
  }
});

describe("Publisher repository source test lock", () => {
  it("releases only the exact lock it owns", () => {
    const lockPath = path.join(fixtureRoot(), "source-state.lock");
    const release = acquirePublisherRepositorySourceTestLock({ lockPath });

    expect(fs.existsSync(lockPath)).toBe(true);
    release();
    release();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("fails closed on stale ownership without removing the lock", () => {
    const lockPath = path.join(fixtureRoot(), "source-state.lock");
    const stale = `${JSON.stringify({
      pid: 2_147_483_647,
      token: `2147483647-${Date.now()}-${randomUUID()}`,
    })}\n`;
    fs.writeFileSync(lockPath, stale, { mode: 0o600 });

    expect(() =>
      acquirePublisherRepositorySourceTestLock({
        lockPath,
        pollMilliseconds: 1,
        timeoutMilliseconds: 10,
      }),
    ).toThrow(/stale/u);
    expect(fs.readFileSync(lockPath, "utf8")).toBe(stale);
  });

  it("refuses ownership drift without deleting another owner's lock", () => {
    const lockPath = path.join(fixtureRoot(), "source-state.lock");
    const release = acquirePublisherRepositorySourceTestLock({ lockPath });
    const replacement = `${JSON.stringify({
      pid: process.pid,
      token: `${process.pid}-${Date.now()}-${randomUUID()}`,
    })}\n`;
    fs.writeFileSync(lockPath, replacement, "utf8");

    expect(release).toThrow(/ownership changed/u);
    expect(fs.readFileSync(lockPath, "utf8")).toBe(replacement);
  });

  it("refuses the same owner bytes on a replacement inode", () => {
    const root = fixtureRoot();
    const lockPath = path.join(root, "source-state.lock");
    const heldPath = path.join(root, "held-source-state.lock");
    const release = acquirePublisherRepositorySourceTestLock({ lockPath });
    const ownerBytes = fs.readFileSync(lockPath);
    fs.renameSync(lockPath, heldPath);
    fs.writeFileSync(lockPath, ownerBytes, { mode: 0o600 });

    expect(release).toThrow(/ownership changed/u);
    expect(fs.readFileSync(lockPath)).toEqual(ownerBytes);
    expect(fs.readFileSync(heldPath)).toEqual(ownerBytes);
  });

  it("rejects symbolic parent components before creating a lock", () => {
    const root = fixtureRoot();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "publisher-lock-outside-"));
    cleanupPaths.push(outside);
    const linkedParent = path.join(root, "linked");
    fs.symlinkSync(outside, linkedParent, "dir");
    const lockPath = path.join(linkedParent, "source-state.lock");

    expect(() =>
      acquirePublisherRepositorySourceTestLock({ lockPath }),
    ).toThrow(/parent is unsafe/u);
    expect(fs.existsSync(path.join(outside, "source-state.lock"))).toBe(false);
  });

  it("rejects a symlink parent segment before lexical normalization can escape", () => {
    const root = fixtureRoot();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "publisher-lock-outside-"));
    cleanupPaths.push(outside);
    const outsideNested = path.join(outside, "nested");
    fs.mkdirSync(outsideNested);
    const linkedParent = path.join(root, "linked");
    fs.symlinkSync(outsideNested, linkedParent, "dir");
    const lockPath = `${linkedParent}${path.sep}..${path.sep}escaped.lock`;

    expect(() =>
      acquirePublisherRepositorySourceTestLock({ lockPath }),
    ).toThrow(/canonical and absolute/u);
    expect(fs.existsSync(path.join(outside, "escaped.lock"))).toBe(false);
    expect(fs.existsSync(path.join(root, "escaped.lock"))).toBe(false);
  });

  it("does not acquire a released lock after its monotonic deadline", () => {
    const lockPath = path.join(fixtureRoot(), "source-state.lock");
    const owner = () =>
      `${JSON.stringify({
        pid: process.pid,
        token: `${process.pid}-${Date.now()}-${randomUUID()}`,
      })}\n`;
    fs.writeFileSync(lockPath, owner(), { mode: 0o600 });
    let now = 0;
    let sleeps = 0;

    expect(() =>
      acquirePublisherRepositorySourceTestLock({
        lockPath,
        nowMilliseconds: () => now,
        pollMilliseconds: 5,
        sleepMilliseconds: (milliseconds) => {
          now += milliseconds;
          sleeps += 1;
          fs.rmSync(lockPath, { force: true });
          if (sleeps === 1) fs.writeFileSync(lockPath, owner(), { mode: 0o600 });
        },
        timeoutMilliseconds: 10,
      }),
    ).toThrow(/Timed out/u);
    expect(sleeps).toBe(2);
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("cleans an exact retry inode acquired while crossing its deadline", () => {
    const lockPath = path.join(fixtureRoot(), "source-state.lock");
    const owner = `${JSON.stringify({
      pid: process.pid,
      token: `${process.pid}-${Date.now()}-${randomUUID()}`,
    })}\n`;
    fs.writeFileSync(lockPath, owner, { mode: 0o600 });
    const clockValues = [0, 0, 9, 10];
    let clockIndex = 0;
    let sleeps = 0;

    expect(() =>
      acquirePublisherRepositorySourceTestLock({
        lockPath,
        nowMilliseconds: () =>
          clockValues[Math.min(clockIndex++, clockValues.length - 1)],
        pollMilliseconds: 5,
        sleepMilliseconds: () => {
          sleeps += 1;
          fs.unlinkSync(lockPath);
        },
        timeoutMilliseconds: 10,
      }),
    ).toThrow(/Timed out/u);
    expect(sleeps).toBe(1);
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("cleans an exact retry inode when its owner write crosses the deadline", () => {
    const lockPath = path.join(fixtureRoot(), "source-state.lock");
    const owner = `${JSON.stringify({
      pid: process.pid,
      token: `${process.pid}-${Date.now()}-${randomUUID()}`,
    })}\n`;
    fs.writeFileSync(lockPath, owner, { mode: 0o600 });
    const clockValues = [0, 0, 9, 9, 10];
    let clockIndex = 0;
    let sleeps = 0;

    expect(() =>
      acquirePublisherRepositorySourceTestLock({
        lockPath,
        nowMilliseconds: () =>
          clockValues[Math.min(clockIndex++, clockValues.length - 1)],
        pollMilliseconds: 5,
        sleepMilliseconds: () => {
          sleeps += 1;
          fs.unlinkSync(lockPath);
        },
        timeoutMilliseconds: 10,
      }),
    ).toThrow(/Timed out/u);
    expect(sleeps).toBe(1);
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("bounds malformed owner bytes without removing the lock", () => {
    const lockPath = path.join(fixtureRoot(), "source-state.lock");
    const oversized = "x".repeat(513);
    fs.writeFileSync(lockPath, oversized, { mode: 0o600 });

    expect(() =>
      acquirePublisherRepositorySourceTestLock({
        lockPath,
        malformedOwnerGraceMilliseconds: 0,
        pollMilliseconds: 1,
        timeoutMilliseconds: 10,
      }),
    ).toThrow(/malformed/u);
    expect(fs.readFileSync(lockPath, "utf8")).toBe(oversized);
  });

  it("bounds an otherwise valid owner token", () => {
    const lockPath = path.join(fixtureRoot(), "source-state.lock");
    const oversizedToken = `${JSON.stringify({
      pid: process.pid,
      token: "x".repeat(129),
    })}\n`;
    fs.writeFileSync(lockPath, oversizedToken, { mode: 0o600 });

    expect(() =>
      acquirePublisherRepositorySourceTestLock({
        lockPath,
        malformedOwnerGraceMilliseconds: 0,
        pollMilliseconds: 1,
        timeoutMilliseconds: 10,
      }),
    ).toThrow(/malformed/u);
    expect(fs.readFileSync(lockPath, "utf8")).toBe(oversizedToken);
  });

  it("does not follow a symbolic lock file", () => {
    const root = fixtureRoot();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "publisher-lock-outside-"));
    cleanupPaths.push(outside);
    const target = path.join(outside, "owner.json");
    const targetBytes = `${JSON.stringify({
      pid: process.pid,
      token: `${process.pid}-${Date.now()}-${randomUUID()}`,
    })}\n`;
    fs.writeFileSync(target, targetBytes, { mode: 0o600 });
    const lockPath = path.join(root, "source-state.lock");
    fs.symlinkSync(target, lockPath);

    expect(() =>
      acquirePublisherRepositorySourceTestLock({ lockPath }),
    ).toThrow();
    expect(fs.readFileSync(target, "utf8")).toBe(targetBytes);
  });

  it("refuses a parent swap before release without touching its target", () => {
    const root = fixtureRoot();
    const parent = path.join(root, "parent");
    const originalParent = path.join(root, "original-parent");
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "publisher-lock-outside-"));
    cleanupPaths.push(outside);
    fs.mkdirSync(parent);
    const lockPath = path.join(parent, "source-state.lock");
    const release = acquirePublisherRepositorySourceTestLock({ lockPath });
    fs.renameSync(parent, originalParent);
    fs.symlinkSync(outside, parent, "dir");
    const outsideLock = path.join(outside, "source-state.lock");
    fs.writeFileSync(outsideLock, "outside", "utf8");

    expect(release).toThrow(/parent is unsafe/u);
    expect(fs.readFileSync(outsideLock, "utf8")).toBe("outside");
    expect(fs.existsSync(path.join(originalParent, "source-state.lock"))).toBe(true);
  });
});
