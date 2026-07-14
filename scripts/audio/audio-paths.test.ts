import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertCanonicalRunManifestPath,
  assertSafeAudioPathSegment,
  resolveAudioRunFile,
  resolveAudioRunRoot,
} from "./audio-paths";

describe("audio path safety", () => {
  it("accepts stable identifiers and rejects path traversal", () => {
    expect(assertSafeAudioPathSegment("release_2026.07-v1", "Version")).toBe(
      "release_2026.07-v1",
    );
    expect(() => assertSafeAudioPathSegment("../../publishing", "Version")).toThrow(
      "one safe path segment",
    );
    expect(() => assertSafeAudioPathSegment("nested/path", "Version")).toThrow(
      "one safe path segment",
    );
  });

  it("keeps run directories directly under the generated audio root", () => {
    expect(resolveAudioRunRoot("/repo/generated/audio", "run-one")).toBe(
      path.resolve("/repo/generated/audio/run-one"),
    );
    expect(() => resolveAudioRunRoot("/repo/generated/audio", "../publishing")).toThrow();
  });

  it("resolves only relative files contained by the run", () => {
    const runRoot = "/repo/generated/audio/run-one";
    expect(resolveAudioRunFile(runRoot, "voices/one/file.opus", "Audio file")).toBe(
      path.resolve(runRoot, "voices/one/file.opus"),
    );
    expect(() => resolveAudioRunFile(runRoot, "../manifest.json", "Audio file")).toThrow(
      "escapes",
    );
    expect(() => resolveAudioRunFile(runRoot, "/tmp/file.opus", "Audio file")).toThrow(
      "relative path",
    );
  });

  it("accepts only canonical manifests in direct run children", () => {
    expect(
      assertCanonicalRunManifestPath(
        "/repo/generated/audio",
        "/repo/generated/audio/run-one/manifest.json",
      ),
    ).toEqual({
      manifestPath: path.resolve("/repo/generated/audio/run-one/manifest.json"),
      runRoot: path.resolve("/repo/generated/audio/run-one"),
    });
    expect(() =>
      assertCanonicalRunManifestPath(
        "/repo/generated/audio",
        "/repo/generated/audio/nested/run-one/manifest.json",
      ),
    ).toThrow("generated audio run root");
  });

  it("rejects symlinked run roots and files that resolve outside a run", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "audio-paths-"));
    const audioRoot = path.join(root, "audio-runs");
    const outside = path.join(root, "outside");
    fs.mkdirSync(audioRoot);
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(audioRoot, "linked-run"));
    expect(() => resolveAudioRunRoot(audioRoot, "linked-run")).toThrow(
      "cannot be a symbolic link",
    );

    const runRoot = path.join(audioRoot, "safe-run");
    fs.mkdirSync(runRoot);
    fs.symlinkSync(outside, path.join(runRoot, "voices"));
    expect(() =>
      resolveAudioRunFile(runRoot, "voices/secret.opus", "Audio file"),
    ).toThrow("cannot be a symbolic link");

    fs.writeFileSync(path.join(outside, "manifest.json"), "{}");
    fs.symlinkSync(
      path.join(outside, "manifest.json"),
      path.join(runRoot, "manifest.json"),
    );
    expect(() =>
      assertCanonicalRunManifestPath(
        audioRoot,
        path.join(runRoot, "manifest.json"),
      ),
    ).toThrow("cannot be a symbolic link");
  });
});
