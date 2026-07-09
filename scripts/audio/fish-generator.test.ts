import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  audioCacheKey,
  buildManifestFiles,
  createRunManifest,
  estimatePaidCostUsd,
  parseFishTimestampSseEvents,
  parseVoices,
  sampleSectionIds,
  selectSections,
  settingsHash,
  trimTextForAudio,
  validateVoicesForRun,
} from "./fish-generator";
import { buildCatalog } from "../manuscripts/shared";
import { textForAudio } from "../../src/lib/audio-text";

describe("Fish audio generator", () => {
  it("parses only explicitly selected reference voices", () => {
    expect(parseVoices(undefined)).toEqual([]);
    expect(parseVoices("narrator:abc123:Narrator, warm voice:def456:Warm Voice")).toEqual([
      { id: "narrator", referenceId: "abc123", label: "Narrator" },
      { id: "warm-voice", referenceId: "def456", label: "Warm Voice" },
    ]);
  });

  it("requires one pinned narrator for full corpus generation", () => {
    expect(() => validateVoicesForRun([], "full")).toThrow("Select a pinned Fish voice");
    expect(() =>
      validateVoicesForRun([{ id: "default", label: "Default" }], "full"),
    ).toThrow("reference_id");
    expect(() =>
      validateVoicesForRun(
        [
          { id: "one", label: "One", referenceId: "ref-one" },
          { id: "two", label: "Two", referenceId: "ref-two" },
        ],
        "full",
      ),
    ).toThrow("exactly one");
    expect(() =>
      validateVoicesForRun(
        [{ id: "narrator", label: "Narrator", referenceId: "ref-one" }],
        "full",
      ),
    ).not.toThrow();
  });

  it("selects the sample sections from the current catalog", () => {
    const catalog = buildCatalog();
    const sections = selectSections(catalog, "sample", []);

    expect(sections.map((section) => section.sectionId)).toEqual(sampleSectionIds);
  });

  it("builds stable cache keys and output paths", () => {
    const catalog = buildCatalog();
    const sections = selectSections(catalog, "sample", ["v02-relational-coherence"]);
    const settings = settingsHash({ model: "s2.1-pro", speed: 1 });
    const files = buildManifestFiles({
      sections,
      voices: [{ id: "default", label: "Fish default" }],
      model: "s2.1-pro",
      runRoot: "/tmp/audio-run",
      settingsHash: settings,
      format: "opus",
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
        format: "opus",
      }),
    );
    expect(files[0]!.outputPath).toBe(
      path.join(
        "/tmp/audio-run",
        "voices/default",
        `${sections[0]!.audioVersionId}-${settings}.opus`,
      ),
    );
    expect(files[0]!.timingsOutputPath).toBe(
      path.join(
        "/tmp/audio-run",
        "voices/default",
        `${sections[0]!.audioVersionId}-${settings}.timings.json`,
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

  it("parses audio and cumulative alignment events from Fish SSE", () => {
    const events = parseFishTimestampSseEvents([
      `data: ${JSON.stringify({
        audio_base64: Buffer.from("one").toString("base64"),
        content: "Hello world",
        alignment: null,
        chunk_seq: 0,
        chunk_audio_offset_sec: 0,
      })}`,
      `data: ${JSON.stringify({
        audio_base64: Buffer.from("two").toString("base64"),
        content: "Hello world",
        alignment: {
          audio_duration: 1,
          segments: [{ text: "Hello", start: 0, end: 0.5 }],
        },
        chunk_seq: 0,
        chunk_audio_offset_sec: 0,
      })}`,
      "",
    ].join("\n\n"));

    expect(events).toHaveLength(2);
    expect(events[1]!.alignment?.segments[0]?.text).toBe("Hello");
  });

  it("creates a manifest summary for selected files", () => {
    const catalog = buildCatalog();
    const sections = selectSections(catalog, "sample", ["v05-purposeful"]);
    const files = buildManifestFiles({
      sections,
      voices: [{ id: "default", label: "Fish default" }],
      model: "s2.1-pro",
      runRoot: "/tmp/audio-run",
      settingsHash: "abc",
      format: "opus",
    });
    const manifest = createRunManifest({
      model: "s2.1-pro",
      mode: "sample",
      runId: "test-run",
      voices: [{ id: "default", label: "Fish default" }],
      files,
    });

    expect(manifest.corpus.sections).toBe(1);
    expect(manifest.endpoint).toBe("stream-with-timestamp");
    expect(manifest.corpus.voices).toBe(1);
    expect(manifest.corpus.inputBytes).toBe(
      Buffer.byteLength(textForAudio(sections[0]!), "utf8"),
    );
  });
});
