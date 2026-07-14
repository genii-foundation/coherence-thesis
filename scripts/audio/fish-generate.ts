import fs from "node:fs";
import path from "node:path";
import {
  artifactsAudioRoot,
  audioDurationSeconds,
  buildManifestFiles,
  createRunManifest,
  createSettings,
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
import { ensureDir, sha256, writeJson } from "../manuscripts/shared";
import type { CompiledCatalog } from "../manuscripts/types";
import {
  createAudioTimingDocument,
  isAudioTimingDocument,
  type AudioTimingDocument,
} from "../../src/lib/audio-timings";
import { textForAudio } from "../../src/lib/audio-text";
import { loadAudioLocalEnv } from "./audio-local-env";
import { generatedCatalogPath } from "../repository/paths";
import { resolveAudioRunFile, resolveAudioRunRoot } from "./audio-paths";
import {
  mergeCompatibleRunManifest,
  selectRunWorkFiles,
} from "./fish-run-resume";

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

export function parseFishGenerateOptions(args: string[]): CliOptions {
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
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error("--limit must be a positive integer.");
  }

  const concurrency = Math.max(1, Math.floor(parseNumber(optionValue(args, "--concurrency"), 1)));
  const speed = parseNumber(optionValue(args, "--speed"), 1);
  if (speed < 0.5 || speed > 2) {
    throw new Error("--speed must be between 0.5 and 2.");
  }
  const maxCharactersValue = optionValue(args, "--max-chars");
  if (mode === "full" && maxCharactersValue !== undefined) {
    throw new Error("--max-chars is only allowed for sample auditions.");
  }
  const maxCharacters = maxCharactersValue === undefined
    ? null
    : parseNumber(maxCharactersValue, 0);
  if (
    maxCharacters !== null &&
    (!Number.isInteger(maxCharacters) || maxCharacters < 1)
  ) {
    throw new Error("--max-chars must be a positive integer.");
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
    maxCharacters,
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

function cacheKeyWithoutFingerprint(value: string): string {
  return value.replace(/\/[a-f0-9]{12}$/i, "");
}

function readTimingDocument(filePath: string): AudioTimingDocument | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return isAudioTimingDocument(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function reuseExistingGeneratedFile(
  file: FishAudioFile,
  text: string,
): boolean {
  if (!file.timingsOutputPath || !file.audioSha256 || !file.timingsSha256) {
    return false;
  }
  if (!fs.existsSync(file.outputPath) || !fs.existsSync(file.timingsOutputPath)) {
    return false;
  }
  const audio = fs.readFileSync(file.outputPath);
  const timingBytes = fs.readFileSync(file.timingsOutputPath);
  if (audio.byteLength === 0 || timingBytes.byteLength === 0) return false;
  const audioSha256 = generatedFileFingerprint(audio);
  const timingsSha256 = generatedFileFingerprint(timingBytes);
  if (
    audioSha256 !== file.audioSha256 ||
    timingsSha256 !== file.timingsSha256 ||
    audio.byteLength !== file.byteSize ||
    timingBytes.byteLength !== file.timingsByteSize
  ) {
    return false;
  }
  const timings = readTimingDocument(file.timingsOutputPath);
  if (
    !timings ||
    timings.sectionId !== file.sectionId ||
    timings.audioVersionId !== file.audioVersionId ||
    timings.voiceId !== file.voiceId ||
    timings.textCharacters !== text.length ||
    timings.durationSeconds <= 0 ||
    timings.exactWordCount !== file.exactWordCount ||
    timings.interpolatedWordCount !== file.interpolatedWordCount ||
    !file.durationSeconds ||
    file.durationSeconds <= 0
  ) {
    return false;
  }
  const expectedFingerprint = audioSha256.slice(0, 12);
  const recordedFingerprint = file.publicCacheKey.match(/\/([a-f0-9]{12})$/i)?.[1];
  if (recordedFingerprint && recordedFingerprint !== expectedFingerprint) {
    return false;
  }
  file.publicCacheKey = `${cacheKeyWithoutFingerprint(file.publicCacheKey)}/${expectedFingerprint}`;
  file.skipped = true;
  delete file.error;
  return true;
}

async function generateOne(input: {
  file: FishAudioFile;
  runRoot: string;
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
  input.file.outputPath = resolveAudioRunFile(
    input.runRoot,
    input.file.relativeOutputPath,
    "Audio output path",
  );
  if (!input.file.timingsRelativeOutputPath) {
    throw new Error(`Missing timing output path for ${input.file.sectionId}.`);
  }
  input.file.timingsOutputPath = resolveAudioRunFile(
    input.runRoot,
    input.file.timingsRelativeOutputPath,
    "Audio timing path",
  );
  ensureDir(path.dirname(input.file.outputPath));
  if (!input.file.timingsOutputPath) {
    throw new Error(`Missing timing output path for ${input.file.sectionId}.`);
  }
  if (reuseExistingGeneratedFile(input.file, input.text)) return;
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
  fs.writeFileSync(input.file.outputPath, generated.audio);
  writeJson(`${input.file.timingsOutputPath}.fish.json`, {
    version: 1,
    chunks: generated.chunks,
    snapshots: generated.snapshots,
  });
  const timings = createAudioTimingDocument({
    sectionId: input.file.sectionId,
    audioVersionId: input.file.audioVersionId,
    voiceId: input.file.voiceId,
    text: input.text,
    chunks: generated.chunks,
  });
  if (timings.durationSeconds <= 0) {
    throw new Error(`Fish Audio returned no positive duration for ${input.file.sectionId}.`);
  }
  writeJson(input.file.timingsOutputPath, timings);
  const audioBytes = fs.readFileSync(input.file.outputPath);
  const timingBytes = fs.readFileSync(input.file.timingsOutputPath);
  input.file.byteSize = audioBytes.byteLength;
  input.file.audioSha256 = generatedFileFingerprint(audioBytes);
  input.file.timingsByteSize = timingBytes.byteLength;
  input.file.timingsSha256 = generatedFileFingerprint(timingBytes);
  input.file.durationSeconds = audioDurationSeconds(input.file.outputPath) ?? timings.durationSeconds;
  if (input.file.durationSeconds <= 0) {
    throw new Error(`Generated audio has no positive duration for ${input.file.sectionId}.`);
  }
  input.file.exactWordCount = timings.exactWordCount;
  input.file.interpolatedWordCount = timings.interpolatedWordCount;
  input.file.generatedAt = new Date().toISOString();
  input.file.publicCacheKey = `${cacheKeyWithoutFingerprint(input.file.publicCacheKey)}/${input.file.audioSha256.slice(0, 12)}`;
  delete input.file.error;
  delete input.file.skipped;
}

async function main() {
  loadAudioLocalEnv();
  const options = parseFishGenerateOptions(process.argv.slice(2));
  const catalog = JSON.parse(
    fs.readFileSync(generatedCatalogPath, "utf8"),
  ) as CompiledCatalog;
  const voices = parseVoices(options.voices);
  validateVoicesForRun(voices, options.mode);
  const selectedSections = selectSections(catalog, options.mode, options.sectionIds);
  const inventorySections = options.mode === "full" ? catalog.sections : selectedSections;

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
  const runRoot = resolveAudioRunRoot(artifactsAudioRoot(), options.runId);
  const files = buildManifestFiles({
    sections: inventorySections,
    voices,
    model: options.model,
    runRoot,
    settingsHash: hash,
    format: options.format,
  });
  const catalogHash = sha256(JSON.stringify(
    inventorySections.map((section) => ({
      sectionId: section.sectionId,
      audioVersionId: section.audioVersionId,
    })),
  )).slice(0, 16);
  let manifest = createRunManifest({
    model: options.model,
    mode: options.mode,
    runId: options.runId,
    voices,
    files,
    settingsHash: hash,
    catalogHash,
  });
  const trimmedTextBySection = new Map(
    inventorySections.map((section) => [
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
  const manifestPath = resolveAudioRunFile(runRoot, "manifest.json", "Audio run manifest");
  if (fs.existsSync(manifestPath)) {
    const existing = JSON.parse(
      fs.readFileSync(manifestPath, "utf8"),
    ) as typeof manifest;
    manifest = mergeCompatibleRunManifest(existing, manifest);
  }
  const requestedSectionIds = options.sectionIds.length > 0
    ? options.sectionIds
    : options.mode === "sample"
      ? selectedSections.map((section) => section.sectionId)
      : [];
  const workFiles = selectRunWorkFiles(
    manifest,
    requestedSectionIds,
    options.limit,
  );
  for (const file of workFiles) {
    delete file.error;
    delete file.skipped;
  }

  console.log(
    JSON.stringify(
      {
        mode: options.mode,
        dryRun: options.dryRun,
        runRoot: relativeToRepo(runRoot),
        inventorySections: inventorySections.length,
        workSections: new Set(workFiles.map((file) => file.sectionId)).size,
        voices: voices.length,
        files: manifest.files.length,
        workFiles: workFiles.length,
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
    return;
  }

  const apiKey = process.env.FISH_AUDIO_API_KEY ?? process.env.FISH_API_KEY;
  if (!apiKey) {
    throw new Error("Set FISH_AUDIO_API_KEY before running without --dry-run.");
  }

  const sectionText = trimmedTextBySection;
  const referenceIdByVoice = new Map(voices.map((voice) => [voice.id, voice.referenceId]));
  const errors: FishAudioFile[] = [];

  await runWithConcurrency(workFiles, options.concurrency, async (file, index) => {
    const text = sectionText.get(file.sectionId);
    if (!text) throw new Error(`Missing text for ${file.sectionId}.`);
    try {
      await generateOne({
        file,
        runRoot,
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
        `${index + 1}/${workFiles.length} ${file.skipped ? "skipped" : "generated"} ${file.voiceId} ${file.sectionId}`,
      );
    } catch (error) {
      file.error = error instanceof Error ? error.message : String(error);
      errors.push(file);
      console.error(`${index + 1}/${workFiles.length} failed ${file.voiceId} ${file.sectionId}: ${file.error}`);
    } finally {
      resolveAudioRunFile(runRoot, "manifest.json", "Audio run manifest");
      writeRunManifest(runRoot, manifest);
    }
  });

  resolveAudioRunFile(runRoot, "manifest.json", "Audio run manifest");
  writeRunManifest(runRoot, manifest);
  const summaryPath = resolveAudioRunFile(runRoot, "summary.json", "Audio run summary");
  writeJson(summaryPath, {
    runId: options.runId,
    inventory: manifest.files.length,
    attempted: workFiles.length,
    generated: manifest.files.filter((file) => file.generatedAt && !file.error).length,
    skipped: manifest.files.filter((file) => file.skipped).length,
    available: manifest.files.filter((file) => (file.generatedAt || file.skipped) && !file.error).length,
    failed: errors.length,
    manifest: relativeToRepo(path.join(runRoot, "manifest.json")),
  });

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("fish-generate.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
