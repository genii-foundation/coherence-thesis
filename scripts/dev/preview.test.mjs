import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { gitIdentity } from "./preview.mjs";

const temporaryDirectories = [];

function runGit(cwd, ...args) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function createRepository() {
  const root = mkdtempSync(path.join(os.tmpdir(), "coherence-preview-"));
  temporaryDirectories.push(root);
  runGit(root, "init", "-b", "main");
  runGit(root, "config", "user.email", "preview-test@example.com");
  runGit(root, "config", "user.name", "Preview Test");
  writeFileSync(path.join(root, "tracked.txt"), "first\n");
  writeFileSync(path.join(root, "next-env.d.ts"), "generated first\n");
  runGit(root, "add", "tracked.txt", "next-env.d.ts");
  runGit(root, "commit", "-m", "initial");
  return root;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("preview candidate identity", () => {
  it("changes when tracked or untracked candidate bytes change", () => {
    const root = createRepository();
    const clean = gitIdentity(root);

    expect(clean).toMatchObject({ branch: "main", dirty: false });
    expect(clean.gitSha).toMatch(/^[a-f0-9]{40}$/);

    writeFileSync(path.join(root, "next-env.d.ts"), "generated second\n");
    expect(gitIdentity(root)).toEqual(clean);

    writeFileSync(path.join(root, "tracked.txt"), "second\n");
    const trackedChange = gitIdentity(root);
    expect(trackedChange.dirty).toBe(true);
    expect(trackedChange.candidateDigest).not.toBe(clean.candidateDigest);

    writeFileSync(path.join(root, "new.txt"), "new\n");
    const untrackedChange = gitIdentity(root);
    expect(untrackedChange.candidateDigest).not.toBe(
      trackedChange.candidateDigest,
    );
  });
});
