import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  breadcrumbShardPath,
  buildPreparationFingerprint,
  preparationCacheHit,
  preparationCountsMatch,
  preparationRequiredOutputPaths,
  prepareManuscripts,
} from "./prepare";
import { publicAudioManifestPath } from "../repository/paths";

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "manuscripts-prepare-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("manuscript preparation cache", () => {
  it("allows imported structural openers to exceed the published catalog count", () => {
    expect(
      preparationCountsMatch({
        importedSections: 561,
        materializedMarkdownFiles: 561,
        publishedSections: 551,
        readerSections: 551,
        progressSections: 551,
        searchEntries: 551,
      }),
    ).toBe(true);
    expect(
      preparationCountsMatch({
        importedSections: 561,
        materializedMarkdownFiles: 560,
        publishedSections: 551,
        readerSections: 551,
        progressSections: 551,
        searchEntries: 551,
      }),
    ).toBe(false);
  });

  it("derives breadcrumb shard names from public volume routes", () => {
    expect(breadcrumbShardPath("/manuscripts/9/", "/breadcrumbs")).toBe(
      "/breadcrumbs/9.json",
    );
    expect(() => breadcrumbShardPath("/overview/", "/breadcrumbs")).toThrow(
      "Invalid manuscript volume route",
    );
  });

  it("fingerprints file names, contents, and the Git revision deterministically", () => {
    const root = temporaryRoot();
    const first = path.join(root, "first.md");
    const second = path.join(root, "second.json");
    fs.writeFileSync(first, "alpha\n");
    fs.writeFileSync(second, "beta\n");

    const initial = buildPreparationFingerprint([first, second], "revision-a");
    expect(buildPreparationFingerprint([second, first], "revision-a")).toBe(initial);
    expect(buildPreparationFingerprint([first, second], "revision-b")).not.toBe(
      initial,
    );

    fs.writeFileSync(second, "changed\n");
    expect(buildPreparationFingerprint([first, second], "revision-a")).not.toBe(
      initial,
    );
  });

  it("rejects a matching cache state when an output is missing", () => {
    const root = temporaryRoot();
    const statePath = path.join(root, "state.json");
    fs.writeFileSync(
      statePath,
      `${JSON.stringify({ version: 1, fingerprint: "same" })}\n`,
    );

    expect(preparationCacheHit(statePath, "same", () => true)).toBe(true);
    expect(preparationCacheHit(statePath, "same", () => false)).toBe(false);
    expect(preparationCacheHit(statePath, "different", () => true)).toBe(false);
  });

  it("requires the generated browser audio manifest for a cache hit", () => {
    expect(preparationRequiredOutputPaths()).toContain(publicAudioManifestPath);
  });

  it("materializes once and reuses a complete matching preparation", async () => {
    const root = temporaryRoot();
    const inputPath = path.join(root, "source.md");
    const statePath = path.join(root, "state.json");
    fs.writeFileSync(inputPath, "canonical source\n");
    let ready = false;
    const materialize = vi.fn(async () => {
      ready = true;
    });
    const options = {
      gitRevision: "revision",
      inputPaths: [inputPath],
      materialize,
      outputsReady: () => ready,
      statePath,
    };

    await expect(prepareManuscripts(options)).resolves.toBe(true);
    await expect(prepareManuscripts(options)).resolves.toBe(false);
    expect(materialize).toHaveBeenCalledTimes(1);
  });
});
