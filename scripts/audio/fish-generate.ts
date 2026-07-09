import fs from "node:fs";
import path from "node:path";
import catalogJson from "../../src/generated/manuscripts/catalog.json";
import {
  artifactsAudioRoot,
  audioDurationSeconds,
  buildManifestFiles,
  createRunManifest,
  createSettings,
  existingFileMetadata,
  fishTtsWithTimestamps,
  generatedFileFingerprint,
  parseVoices,
  relativeToRepo,
  runIdForNow,
  selectSections,
  settingsHash,
  trimTextForAudio,
  validateVoicesForRun,
  writeRunManifest,
  type FishAudioFormat,
  type FishAudioFile,
  type FishRunMode,
} from "./fish-generator";
import { ensureDir, writeJson } from "../manuscripts/shared";
import type { CompiledCatalog } from "../manuscripts/types";
import { createAudioTimingDocument } from "../../src/lib/audio-timings";
import { textForAudio } from "../../src/lib/audio-text";

type CliOptions = {
  mode: FishRunMode;
  dryRun: boolean;
  model: string;
  format: FishAudioFormat;
  runId: string;
  voices: string | undefined;
  sectionIds: string[];
  limit: number | null;
  concurrency: number;
  speed: number;
  normalize: boolean;
  latency: "normal" | "balanced" | "low";
  chunkLength: number;
  opusBitrate: 24000 | 32000 | 48000 | 64000;
  temperature: number;
  topP: number;
  maxCharacters: number | null;
  timeoutMs: number;
};

function optionValue(args: string[], name: string): string | undefined {
  const prefix = `${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid number '${value}'.`);
  return parsed;
}

function parseChoice<T extends string>(
  value: string | undefined,
  fallback: T,
  choices: readonly T[],
  name: string,
): T {
  const chosen = (value ?? fallback) as T;
  if (!choices.includes(chosen)) {
    throw new Error(`${name} must be one of: ${choices.join(", ")}.`);
  }
  return chosen;
}

function parseCli(args: string[]): CliOptions {
  const mode = (optionValue(args, "--mode") ?? "sample") as FishRunMode;
  if (mode !== "sample" && mode !== "full") {
    throw new Error("--mode must be 'sample' or 'full'.");
  }

  const sectionIds = (optionValue(args, "--sections") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const limitValue = optionValue(args, "--limit");
  const limit = limitValue === undefined ? null : parseNumber(limitValue, 0);
  if (limit !== null && limit < 1) throw new Error("--limit must be at least 1.");

  const concurrency = Math.max(1, Math.floor(parseNumber(optionValue(args, "--concurrency"), 1)));
  const speed = parseNumber(optionValue(args, "--speed"), 1);
  if (speed < 0.5 || speed > 2) {
    throw new Error("--speed must be between 0.5 and 2.");
  }
  const maxCharactersValue = optionValue(args, "--max-chars");
  if (mode === "full" && maxCharactersValue !== undefined) {
    throw new Error("--max-chars is only allowed for sample auditions.");
  }
  const format = parseChoice(
    optionValue(args, "--format"),
    "opus",
    ["opus", "wav"] as const,
    "--format",
  );
  const latency = parseChoice(
    optionValue(args, "--latency"),
    "normal",
    ["normal", "balanced", "low"] as const,
    "--latency",
  );
  const chunkLength = Math.floor(parseNumber(optionValue(args, "--chunk-length"), 300));
  if (chunkLength < 100 || chunkLength > 300) {
    throw new Error("--chunk-length must be between 100 and 300.");
  }
  const opusBitrate = parseNumber(optionValue(args, "--opus-bitrate"), 64000);
  if (![24000, 32000, 48000, 64000].includes(opusBitrate)) {
    throw new Error("--opus-bitrate must be 24000, 32000, 48000, or 64000.");
  }
  const temperature = parseNumber(optionValue(args, "--temperature"), 0.7);
  const topP = parseNumber(optionValue(args, "--top-p"), 0.7);
  if (temperature < 0 || temperature > 1) {
    throw new Error("--temperature must be between 0 and 1.");
  }
  if (topP < 0 || topP > 1) {
    throw new Error("--top-p must be between 0 and 1.");
  }

  return {
    mode,
    dryRun: hasFlag(args, "--dry-run"),
    model: optionValue(args, "--model") ?? "s2.1-pro-free",
    format,
    runId: optionValue(args, "--run-id") ?? runIdForNow(),
    voices: optionValue(args, "--voices") ?? process.env.FISH_AUDIO_VOICES,
    sectionIds,
    limit,
    concurrency,
    speed,
    normalize: !hasFlag(args, "--no-normalize"),
    latency,
    chunkLength,
    opusBitrate: opusBitrate as CliOptions["opusBitrate"],
    maxCharacters:
      maxCharactersValue === undefined ? null : parseNumber(maxCharactersValue, 0),
    timeoutMs: Math.max(1, Math.floor(parseNumber(optionValue(args, "--timeout-ms"), 600_000))),
    temperature,
    topP,
  };
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await worker(items[currentIndex]!, currentIndex);
    }
  });
  await Promise.all(workers);
}

async function generateOne(input: {
  file: FishAudioFile;
  apiKey: string;
  voiceReferenceId?: string;
  model: string;
  format: FishAudioFormat;
  speed: number;
  normalize: boolean;
  latency: "normal" | "balanced" | "low";
  chunkLength: number;
  opusBitrate: 24000 | 32000 | 48000 | 64000;
  temperature: number;
  topP: number;
  timeoutMs: number;
  text: string;
}): Promise<void> {
  ensureDir(path.dirname(input.file.outputPath));
  if (!input.file.timingsOutputPath) {
    throw new Error(`Missing timing output path for ${input.file.sectionId}.`);
  }
  const existing = existingFileMetadata(input.file.outputPath);
  const existingTimings = existingFileMetadata(input.file.timingsOutputPath);
  if (
    existing?.byteSize &&
    existing.byteSize > 0 &&
    existingTimings?.byteSize &&
    existingTimings.byteSize > 0
  ) {
    input.file.skipped = true;
    input.file.byteSize = existing.byteSize;
    input.file.durationSeconds = existing.durationSeconds;
    input.file.timingsByteSize = existingTimings.byteSize;
    return;
  }
  if (!input.voiceReferenceId) {
    throw new Error(`Missing pinned reference_id for ${input.file.voiceId}.`);
  }
  const generated = await fishTtsWithTimestamps({
    apiKey: input.apiKey,
    model: input.model,
    text: input.text,
    referenceId: input.voiceReferenceId,
    format: input.format,
    speed: input.speed,
    normalize: input.normalize,
    latency: input.latency,
    chunkLength: input.chunkLength,
    opusBitrate: input.opusBitrate,
    temperature: input.temperature,
    topP: input.topP,
    timeoutMs: input.timeoutMs,
  });
  const timings = createAudioTimingDocument({
    sectionId: input.file.sectionId,
    audioVersionId: input.file.audioVersionId,
    voiceId: input.file.voiceId,
    text: input.text,
    chunks: generated.chunks,
  });
  fs.writeFileSync(input.file.outputPath, generated.audio);
  writeJson(input.file.timingsOutputPath, timings);
  input.file.byteSize = fs.statSync(input.file.outputPath).size;
  input.file.timingsByteSize = fs.statSync(input.file.timingsOutputPath).size;
  input.file.durationSeconds =
    audioDurationSeconds(input.file.outputPath) ?? timings.durationSeconds;
  input.file.exactWordCount = timings.exactWordCount;
  input.file.interpolatedWordCount = timings.interpolatedWordCount;
  input.file.generatedAt = new Date().toISOString();
  input.file.publicCacheKey = `${input.file.publicCacheKey}/${generatedFileFingerprint(fs.readFileSync(input.file.outputPath)).slice(0, 12)}`;
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  const catalog = catalogJson as CompiledCatalog;
  const voices = parseVoices(options.voices);
  validateVoicesForRun(voices, options.mode);
  let sections = selectSections(catalog, options.mode, options.sectionIds);
  if (options.limit !== null) sections = sections.slice(0, options.limit);

  const settings = createSettings({
    model: options.model,
    format: options.format,
    speed: options.speed,
    normalize: options.normalize,
    latency: options.latency,
    chunkLength: options.chunkLength,
    opusBitrate: options.opusBitrate,
    temperature: options.temperature,
    topP: options.topP,
  });
  const hash = settingsHash(settings);
  const runRoot = path.join(artifactsAudioRoot(), options.runId);
  const files = buildManifestFiles({
    sections,
    voices,
    model: options.model,
    runRoot,
    settingsHash: hash,
    format: options.format,
  });
  const manifest = createRunManifest({
    model: options.model,
    mode: options.mode,
    runId: options.runId,
    voices,
    files,
  });
  const trimmedTextBySection = new Map(
    sections.map((section) => [
      section.sectionId,
      trimTextForAudio(textForAudio(section), options.maxCharacters),
    ]),
  );
  for (const file of files) {
    const text = trimmedTextBySection.get(file.sectionId);
    if (!text) continue;
    file.inputBytes = Buffer.byteLength(text, "utf8");
    file.inputCharacters = text.length;
  }
  manifest.corpus.inputBytes = files.reduce((total, file) => total + file.inputBytes, 0);
  manifest.corpus.inputCharacters = files.reduce(
    (total, file) => total + file.inputCharacters,
    0,
  );
  manifest.corpus.estimatedPaidCostUsd = Number(
    ((manifest.corpus.inputBytes / 1_000_000) * 15).toFixed(2),
  );

  console.log(
    JSON.stringify(
      {
        mode: options.mode,
        dryRun: options.dryRun,
        runRoot: relativeToRepo(runRoot),
        sections: sections.length,
        voices: voices.length,
        files: files.length,
        inputBytes: manifest.corpus.inputBytes,
        estimatedPaidCostUsd: manifest.corpus.estimatedPaidCostUsd,
        model: options.model,
        settingsHash: hash,
        maxCharacters: options.maxCharacters,
        format: options.format,
        latency: options.latency,
        chunkLength: options.chunkLength,
        opusBitrate: options.opusBitrate,
        timeoutMs: options.timeoutMs,
      },
      null,
      2,
    ),
  );

  if (options.dryRun) {
    writeRunManifest(runRoot, manifest);
    return;
  }

  const apiKey = process.env.FISH_API_KEY ?? process.env.FISH_AUDIO_API_KEY;
  if (!apiKey) {
    throw new Error("Set FISH_API_KEY before running without --dry-run.");
  }

  const sectionText = trimmedTextBySection;
  const referenceIdByVoice = new Map(voices.map((voice) => [voice.id, voice.referenceId]));
  const errors: FishAudioFile[] = [];

  await runWithConcurrency(files, options.concurrency, async (file, index) => {
    const text = sectionText.get(file.sectionId);
    if (!text) throw new Error(`Missing text for ${file.sectionId}.`);
    try {
      await generateOne({
        file,
        apiKey,
        voiceReferenceId: referenceIdByVoice.get(file.voiceId),
        model: options.model,
        format: options.format,
        speed: options.speed,
        normalize: options.normalize,
        latency: options.latency,
        chunkLength: options.chunkLength,
        opusBitrate: options.opusBitrate,
        temperature: options.temperature,
        topP: options.topP,
        timeoutMs: options.timeoutMs,
        text,
      });
      console.log(
        `${index + 1}/${files.length} ${file.skipped ? "skipped" : "generated"} ${file.voiceId} ${file.sectionId}`,
      );
    } catch (error) {
      file.error = error instanceof Error ? error.message : String(error);
      errors.push(file);
      console.error(`${index + 1}/${files.length} failed ${file.voiceId} ${file.sectionId}: ${file.error}`);
    } finally {
      writeRunManifest(runRoot, manifest);
    }
  });

  writeRunManifest(runRoot, manifest);
  writeJson(path.join(runRoot, "summary.json"), {
    runId: options.runId,
    generated: files.filter((file) => file.generatedAt && !file.error).length,
    skipped: files.filter((file) => file.skipped).length,
    available: files.filter((file) => (file.generatedAt || file.skipped) && !file.error).length,
    failed: errors.length,
    manifest: relativeToRepo(path.join(runRoot, "manifest.json")),
  });

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
