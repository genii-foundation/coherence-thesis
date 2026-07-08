import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import catalogJson from "../../src/generated/manuscripts/catalog.json";
import {
  artifactsAudioRoot,
  audioDurationSeconds,
  buildManifestFiles,
  chunkTextForAudio,
  createRunManifest,
  createSettings,
  existingFileMetadata,
  fishTts,
  generatedFileFingerprint,
  parseVoices,
  relativeToRepo,
  runIdForNow,
  selectSections,
  settingsHash,
  trimTextForAudio,
  writeRunManifest,
  type FishAudioFile,
  type FishRunMode,
} from "./fish-generator";
import { ensureDir, writeJson } from "../manuscripts/shared";
import type { CompiledCatalog } from "../manuscripts/types";

type CliOptions = {
  mode: FishRunMode;
  dryRun: boolean;
  model: string;
  runId: string;
  voices: string | undefined;
  sectionIds: string[];
  limit: number | null;
  concurrency: number;
  speed: number;
  normalize: boolean;
  temperature?: number;
  topP?: number;
  maxCharacters: number | null;
  chunkCharacters: number;
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
  const maxCharactersValue = optionValue(args, "--max-chars");
  const chunkCharacters = Math.floor(parseNumber(optionValue(args, "--chunk-chars"), 1_500));

  return {
    mode,
    dryRun: hasFlag(args, "--dry-run"),
    model: optionValue(args, "--model") ?? "s2.1-pro",
    runId: optionValue(args, "--run-id") ?? runIdForNow(),
    voices: optionValue(args, "--voices") ?? process.env.FISH_AUDIO_VOICES,
    sectionIds,
    limit,
    concurrency,
    speed,
    normalize: !hasFlag(args, "--no-normalize"),
    maxCharacters:
      maxCharactersValue === undefined ? null : parseNumber(maxCharactersValue, 0),
    chunkCharacters,
    timeoutMs: Math.max(1, Math.floor(parseNumber(optionValue(args, "--timeout-ms"), 180_000))),
    temperature:
      optionValue(args, "--temperature") === undefined
        ? undefined
        : parseNumber(optionValue(args, "--temperature"), 0),
    topP:
      optionValue(args, "--top-p") === undefined
        ? undefined
        : parseNumber(optionValue(args, "--top-p"), 0),
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
  speed: number;
  normalize: boolean;
  temperature?: number;
  topP?: number;
  timeoutMs: number;
  text: string;
  chunkCharacters: number;
  chunkRoot: string;
}): Promise<void> {
  ensureDir(path.dirname(input.file.outputPath));
  const existing = existingFileMetadata(input.file.outputPath);
  if (existing?.byteSize && existing.byteSize > 0) {
    input.file.skipped = true;
    input.file.byteSize = existing.byteSize;
    input.file.durationSeconds = existing.durationSeconds;
    return;
  }

  const chunks = chunkTextForAudio(input.text, input.chunkCharacters);
  const chunkSetId = generatedFileFingerprint(
    Buffer.from(`${input.file.publicCacheKey}:${input.file.outputPath}`),
  ).slice(0, 16);
  const chunkDir = path.join(
    input.chunkRoot,
    input.file.voiceId,
    chunkSetId,
  );
  ensureDir(chunkDir);
  const chunkPaths: string[] = [];
  for (const [chunkIndex, chunk] of chunks.entries()) {
    const chunkPath = path.join(chunkDir, `${String(chunkIndex + 1).padStart(4, "0")}.mp3`);
    chunkPaths.push(chunkPath);
    if (fs.existsSync(chunkPath) && fs.statSync(chunkPath).size > 0) {
      console.log(
        `chunk ${chunkIndex + 1}/${chunks.length} skipped ${input.file.voiceId} ${input.file.sectionId}`,
      );
      continue;
    }
    const audio = await fishTts({
      apiKey: input.apiKey,
      model: input.model,
      text: chunk,
      referenceId: input.voiceReferenceId,
      speed: input.speed,
      normalize: input.normalize,
      temperature: input.temperature,
      topP: input.topP,
      timeoutMs: input.timeoutMs,
    });
    fs.writeFileSync(chunkPath, audio);
    console.log(
      `chunk ${chunkIndex + 1}/${chunks.length} generated ${input.file.voiceId} ${input.file.sectionId}`,
    );
  }
  if (chunkPaths.length === 1) {
    fs.copyFileSync(chunkPaths[0]!, input.file.outputPath);
  } else {
    const concatList = path.join(chunkDir, "concat.txt");
    fs.writeFileSync(
      concatList,
      chunkPaths.map((chunkPath) => `file '${chunkPath.replace(/'/g, "'\\''")}'`).join("\n"),
    );
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatList,
      "-c",
      "copy",
      input.file.outputPath,
    ]);
  }
  input.file.byteSize = fs.statSync(input.file.outputPath).size;
  input.file.durationSeconds = audioDurationSeconds(input.file.outputPath);
  input.file.generatedAt = new Date().toISOString();
  input.file.publicCacheKey = `${input.file.publicCacheKey}/${generatedFileFingerprint(fs.readFileSync(input.file.outputPath)).slice(0, 12)}`;
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  const catalog = catalogJson as CompiledCatalog;
  const voices = parseVoices(options.voices);
  let sections = selectSections(catalog, options.mode, options.sectionIds);
  if (options.limit !== null) sections = sections.slice(0, options.limit);

  const settings = createSettings({
    model: options.model,
    speed: options.speed,
    normalize: options.normalize,
    temperature: options.temperature,
    topP: options.topP,
  });
  const hash = settingsHash(settings);
  const runRoot = path.join(artifactsAudioRoot(), options.runId);
  const chunkRoot = path.join(runRoot, "chunks");
  const files = buildManifestFiles({
    sections,
    voices,
    model: options.model,
    runRoot,
    settingsHash: hash,
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
      trimTextForAudio(`${section.title}\n\n${section.text}`.trim(), options.maxCharacters),
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
        chunkCharacters: options.chunkCharacters,
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
        speed: options.speed,
        normalize: options.normalize,
        temperature: options.temperature,
        topP: options.topP,
        timeoutMs: options.timeoutMs,
        text,
        chunkCharacters: options.chunkCharacters,
        chunkRoot,
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
