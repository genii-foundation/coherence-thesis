import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCatalog } from "../manuscripts/shared";
import {
  audioCacheKey,
  buildManifestFiles,
  chunkTextForAudio,
  createRunManifest,
  estimatePaidCostUsd,
  parseVoices,
  sampleSectionIds,
  selectSections,
  settingsHash,
  textForAudio,
  trimTextForAudio,
} from "./fish-generator";

let cachedCurrentCatalog: ReturnType<typeof buildCatalog> | undefined;

function currentCatalog(): ReturnType<typeof buildCatalog> {
  cachedCurrentCatalog ??= buildCatalog();
  return cachedCurrentCatalog;
}

describe("Fish audio generator", () => {
  it("parses default and reference voices", () => {
    expect(parseVoices(undefined)).toEqual([
      { id: "default", label: "Fish default" },
    ]);
    expect(parseVoices("narrator:abc123:Narrator, warm voice:def456:Warm Voice")).toEqual([
      { id: "narrator", referenceId: "abc123", label: "Narrator" },
      { id: "warm-voice", referenceId: "def456", label: "Warm Voice" },
    ]);
  });

  it("selects the sample sections from the current catalog", () => {
    const catalog = currentCatalog();
    const sections = selectSections(catalog, "sample", []);

    expect(sections.map((section) => section.sectionId)).toEqual(sampleSectionIds);
  }, 20_000);

  it("builds stable cache keys and output paths", () => {
    const catalog = currentCatalog();
    const sections = selectSections(catalog, "sample", ["v02-relational-coherence"]);
    const settings = settingsHash({ model: "s2.1-pro", speed: 1 });
    const files = buildManifestFiles({
      sections,
      voices: [{ id: "default", label: "Fish default" }],
      model: "s2.1-pro",
      runRoot: "/tmp/audio-run",
      settingsHash: settings,
    });

    expect(files).toHaveLength(1);
    expect(files[0]!.publicCacheKey).toBe(
      audioCacheKey({
        provider: "fish-audio",
        model: "s2.1-pro",
        voiceId: "default",
        sectionId: "v02-relational-coherence",
        contentHash: sections[0]!.contentHash,
        settingsHash: settings,
        format: "mp3",
      }),
    );
    expect(files[0]!.outputPath).toBe(
      path.join(
        "/tmp/audio-run",
        "voices/default",
        `${sections[0]!.audioVersionId}-${settings}.mp3`,
      ),
    );
  });

  it("estimates paid Fish cost from UTF-8 bytes", () => {
    expect(estimatePaidCostUsd(1_000_000)).toBe(15);
    expect(Number(estimatePaidCostUsd(1_270_488).toFixed(2))).toBe(19.06);
  });

  it("trims sample text at a useful sentence boundary", () => {
    const text = "Title\n\nFirst sentence. Second sentence. Third sentence.";

    expect(trimTextForAudio(text, null)).toBe(text);
    expect(trimTextForAudio(text, 32)).toBe("Title\n\nFirst sentence.");
  });

  it("chunks text without exceeding the request target", () => {
    const text = [
      "Title",
      "First paragraph has one sentence. ".repeat(12),
      "Second paragraph has enough words to force another chunk. ".repeat(12),
    ].join("\n\n");
    const chunks = chunkTextForAudio(text, 500);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 500)).toBe(true);
  });

  it("creates a manifest summary for selected files", () => {
    const catalog = currentCatalog();
    const sections = selectSections(catalog, "sample", ["v05-purposeful"]);
    const files = buildManifestFiles({
      sections,
      voices: [{ id: "default", label: "Fish default" }],
      model: "s2.1-pro",
      runRoot: "/tmp/audio-run",
      settingsHash: "abc",
    });
    const manifest = createRunManifest({
      model: "s2.1-pro",
      mode: "sample",
      runId: "test-run",
      voices: [{ id: "default", label: "Fish default" }],
      files,
    });

    expect(manifest.corpus.sections).toBe(1);
    expect(manifest.corpus.voices).toBe(1);
    expect(manifest.corpus.inputBytes).toBe(
      Buffer.byteLength(textForAudio(sections[0]!), "utf8"),
    );
  });
});
