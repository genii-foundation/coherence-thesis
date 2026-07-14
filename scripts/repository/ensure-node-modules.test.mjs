import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureDependencies,
  isSupportedNodeVersion,
  nodeModulesInSyncWithLockfile,
} from "./ensure-node-modules.mjs";

const temporaryRoots = [];

function temporaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coherence-bootstrap-"));
  temporaryRoots.push(root);
  return root;
}

function lockfile() {
  return {
    lockfileVersion: 3,
    packages: {
      "": { name: "fixture", version: "1.0.0" },
      "node_modules/example": { version: "1.0.0" },
    },
  };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeRootLock(root) {
  writeJson(path.join(root, "package-lock.json"), lockfile());
}

function writeInstalledLock(root) {
  writeJson(path.join(root, "node_modules/.package-lock.json"), lockfile());
  fs.mkdirSync(path.join(root, "node_modules/example"), { recursive: true });
}

function writeState(
  root,
  nodeMajor,
  { architecture = process.arch, platform = process.platform } = {},
) {
  writeJson(path.join(root, "node_modules/.coherence-install-state.json"), {
    architecture,
    nodeMajor,
    packageManager: "npm",
    platform,
  });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

describe("dependency bootstrap", () => {
  it("rejects Node 20 and accepts Node 22", () => {
    expect(isSupportedNodeVersion("20.19.4")).toBe(false);
    expect(isSupportedNodeVersion("v22.12.0")).toBe(true);
  });

  it("rejects Node 20 before changing dependency files", () => {
    const root = temporaryRoot();
    writeRootLock(root);
    fs.mkdirSync(path.join(root, "node_modules"));
    fs.writeFileSync(path.join(root, "node_modules/sentinel"), "keep\n");
    const runInstall = vi.fn();

    expect(() =>
      ensureDependencies({ nodeVersion: "20.19.4", root, runInstall }),
    ).toThrow("requires Node >= 22");
    expect(runInstall).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(root, "node_modules/sentinel"))).toBe(true);
  });

  it("skips recursive bootstrap invocations without touching the filesystem", () => {
    const root = temporaryRoot();
    const runInstall = vi.fn();

    expect(
      ensureDependencies({
        environment: { COHERENCE_BOOTSTRAPPING: "1" },
        root,
        runInstall,
      }),
    ).toEqual({ exitCode: 0, status: "skipped" });
    expect(runInstall).not.toHaveBeenCalled();
  });

  it("does nothing when the installed tree and state are current", () => {
    const root = temporaryRoot();
    writeRootLock(root);
    writeInstalledLock(root);
    writeState(root, "22");
    fs.writeFileSync(path.join(root, "node_modules/sentinel"), "keep\n");
    const runInstall = vi.fn();

    expect(
      ensureDependencies({
        log: vi.fn(),
        nodeVersion: "22.12.0",
        root,
        runInstall,
      }),
    ).toEqual({ exitCode: 0, status: "current" });
    expect(runInstall).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(root, "node_modules/sentinel"))).toBe(true);
  });

  it("removes an interrupted partial tree before reinstalling", () => {
    const root = temporaryRoot();
    writeRootLock(root);
    writeState(root, "20");
    fs.writeFileSync(path.join(root, "node_modules/partial"), "stale\n");
    const runInstall = vi.fn(() => {
      expect(fs.existsSync(path.join(root, "node_modules"))).toBe(false);
      writeInstalledLock(root);
      return 0;
    });

    expect(
      ensureDependencies({
        log: vi.fn(),
        nodeVersion: "22.12.0",
        root,
        runInstall,
      }),
    ).toEqual({ exitCode: 0, status: "installed" });
    expect(runInstall).toHaveBeenCalledOnce();
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(root, "node_modules/.coherence-install-state.json"),
          "utf8",
        ),
      ),
    ).toEqual({
      architecture: process.arch,
      nodeMajor: "22",
      packageManager: "npm",
      platform: process.platform,
    });
    expect(
      fs
        .readdirSync(path.join(root, "node_modules"))
        .some((name) => name.endsWith(".tmp")),
    ).toBe(false);
  });

  it("reinstalls when a stale hidden lock names a missing package directory", () => {
    const root = temporaryRoot();
    writeRootLock(root);
    writeInstalledLock(root);
    writeState(root, "22");
    fs.rmSync(path.join(root, "node_modules/example"), { recursive: true });
    const runInstall = vi.fn(() => {
      expect(fs.existsSync(path.join(root, "node_modules"))).toBe(false);
      writeInstalledLock(root);
      return 0;
    });

    expect(
      ensureDependencies({
        log: vi.fn(),
        nodeVersion: "22.12.0",
        root,
        runInstall,
      }),
    ).toEqual({ exitCode: 0, status: "installed" });
    expect(runInstall).toHaveBeenCalledOnce();
    expect(fs.existsSync(path.join(root, "node_modules/example"))).toBe(true);
  });

  it("leaves no success marker after a failed install", () => {
    const root = temporaryRoot();
    writeRootLock(root);
    writeState(root, "20");
    fs.writeFileSync(path.join(root, "node_modules/partial"), "stale\n");
    const runInstall = vi.fn(() => {
      fs.mkdirSync(path.join(root, "node_modules"), { recursive: true });
      fs.writeFileSync(path.join(root, "node_modules/new-partial"), "partial\n");
      return 17;
    });

    expect(
      ensureDependencies({
        log: vi.fn(),
        nodeVersion: "22.12.0",
        root,
        runInstall,
      }),
    ).toEqual({ exitCode: 17, status: "failed" });
    expect(
      fs.existsSync(
        path.join(root, "node_modules/.coherence-install-state.json"),
      ),
    ).toBe(false);
  });

  it("rejects a nominal success without a synchronized hidden lock", () => {
    const root = temporaryRoot();
    writeRootLock(root);

    expect(() =>
      ensureDependencies({
        log: vi.fn(),
        nodeVersion: "22.12.0",
        root,
        runInstall: () => 0,
      }),
    ).toThrow("synchronized node_modules lockfile");
    expect(
      fs.existsSync(
        path.join(root, "node_modules/.coherence-install-state.json"),
      ),
    ).toBe(false);
  });

  it("allows optional and incompatible platform packages to be absent", () => {
    const root = temporaryRoot();
    const packageLockPath = path.join(root, "package-lock.json");
    const npmHiddenLockPath = path.join(root, "node_modules/.package-lock.json");
    writeJson(packageLockPath, {
      packages: {
        "": { name: "fixture" },
        "node_modules/example": { version: "1.0.0" },
        "node_modules/optional": { optional: true, version: "1.0.0" },
        "node_modules/macos-only": { os: ["darwin"], version: "1.0.0" },
      },
    });
    writeJson(npmHiddenLockPath, {
      packages: {
        "node_modules/example": { version: "1.0.0" },
      },
    });
    fs.mkdirSync(path.join(root, "node_modules/example"), { recursive: true });

    expect(
      nodeModulesInSyncWithLockfile({
        architecture: "x64",
        npmHiddenLockPath,
        packageLockPath,
        platform: "linux",
      }),
    ).toBe(true);
  });

  it("rejects an installed optional package whose directory is missing", () => {
    const root = temporaryRoot();
    const packageLockPath = path.join(root, "package-lock.json");
    const npmHiddenLockPath = path.join(root, "node_modules/.package-lock.json");
    const optionalEntry = { optional: true, version: "1.0.0" };
    writeJson(packageLockPath, {
      packages: {
        "": { name: "fixture" },
        "node_modules/optional": optionalEntry,
      },
    });
    writeJson(npmHiddenLockPath, {
      packages: { "node_modules/optional": optionalEntry },
    });

    expect(
      nodeModulesInSyncWithLockfile({
        architecture: "arm64",
        npmHiddenLockPath,
        packageLockPath,
        platform: "darwin",
      }),
    ).toBe(false);
  });

  it("reinstalls when the recorded architecture changes", () => {
    const root = temporaryRoot();
    writeRootLock(root);
    writeInstalledLock(root);
    writeState(root, "22", { architecture: "x64", platform: "darwin" });
    const runInstall = vi.fn(() => {
      expect(fs.existsSync(path.join(root, "node_modules"))).toBe(false);
      writeInstalledLock(root);
      return 0;
    });

    expect(
      ensureDependencies({
        architecture: "arm64",
        log: vi.fn(),
        nodeVersion: "22.12.0",
        platform: "darwin",
        root,
        runInstall,
      }),
    ).toEqual({ exitCode: 0, status: "installed" });
    expect(runInstall).toHaveBeenCalledOnce();
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(root, "node_modules/.coherence-install-state.json"),
          "utf8",
        ),
      ),
    ).toEqual({
      architecture: "arm64",
      nodeMajor: "22",
      packageManager: "npm",
      platform: "darwin",
    });
  });

  it("accepts a present package link recorded by both lockfiles", () => {
    const root = temporaryRoot();
    const packageLockPath = path.join(root, "package-lock.json");
    const npmHiddenLockPath = path.join(root, "node_modules/.package-lock.json");
    const linkedEntry = {
      link: true,
      resolved: "packages/example",
    };
    writeJson(packageLockPath, {
      packages: {
        "": { name: "fixture" },
        "node_modules/example": linkedEntry,
      },
    });
    writeJson(npmHiddenLockPath, {
      packages: { "node_modules/example": linkedEntry },
    });
    fs.mkdirSync(path.join(root, "packages/example"), { recursive: true });
    fs.symlinkSync(
      path.join(root, "packages/example"),
      path.join(root, "node_modules/example"),
      "dir",
    );

    expect(
      nodeModulesInSyncWithLockfile({
        architecture: "x64",
        npmHiddenLockPath,
        packageLockPath,
        platform: "linux",
      }),
    ).toBe(true);
  });
});
