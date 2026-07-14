import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ensureDir, repoRoot, sha256, writeJson } from "../manuscripts/shared";
import type { CompiledCatalog, CompiledSection } from "../manuscripts/types";
import { generatedAudioReportsRoot } from "../repository/paths";
import {
  type FishTimestampChunk,
  type FishTimestampSegment,
} from "../../src/lib/audio-timings";
import { textForAudio } from "../../src/lib/audio-text";

export type FishVoice = {
  id: string;
  label: string;
  referenceId?: string;
};

export type FishRunMode = "sample" | "full";
export type FishAudioFormat = "opus" | "wav";
export type AudioTimingSource = "fish" | "fallback" | "local";

export type FishAudioFile = {
  sectionId: string;
  title: string;
  contentHash: string;
  audioVersionId: string;
  volumeId: string;
  voiceId: string;
  voiceLabel: string;
  provider: "fish-audio";
  model: string;
  format: FishAudioFormat | "mp3";
  inputBytes: number;
  inputCharacters: number;
  outputPath: string;
  relativeOutputPath: string;
  timingsOutputPath?: string;
  timingsRelativeOutputPath?: string;
  publicCacheKey: string;
  generatedAt?: string;
  durationSeconds?: number;
  byteSize?: number;
  audioSha256?: string;
  timingsByteSize?: number;
  timingsSha256?: string;
  exactWordCount?: number;
  interpolatedWordCount?: number;
  timingSource?: "fish" | "mlx-whisper";
  providerTimingError?: string;
  skipped?: boolean;
  error?: string;
};

export type FishRunManifest = {
  schemaVersion?: 2;
  provider: "fish-audio";
  endpoint?: "stream-with-timestamp";
  model: string;
  settingsHash?: string;
  catalogHash?: string;
  mode: FishRunMode;
  runId: string;
  generatedAt: string;
  corpus: {
    sections: number;
    voices: number;
    inputBytes: number;
    inputCharacters: number;
    estimatedPaidCostUsd: number;
  };
  voices: FishVoice[];
  files: FishAudioFile[];
};

export const fishPaidUsdPerMillionBytes = 15;

export const sampleSectionIds = [
  "v02-relational-coherence",
  "v05-purposeful",
  "v09-closing",
  "v08-prologue-two-scenes",
];

export function normalizeVoiceId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseVoices(value: string | undefined): FishVoice[] {
  if (!value?.trim()) return [];
  const parsed = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [rawId, rawReferenceId, rawLabel] = entry.split(":");
      const id = normalizeVoiceId(rawId ?? "");
      if (!id) throw new Error(`Invalid Fish voice entry '${entry}'.`);
      return {
        id,
        referenceId: rawReferenceId?.trim() || undefined,
        label: rawLabel?.trim() || id,
      };
    });
  return parsed;
}

export function validateVoicesForRun(voices: FishVoice[], mode: FishRunMode): void {
  if (voices.length === 0) {
    throw new Error(
      "Select a pinned Fish voice with --voices <voice-id>:<reference-id>:<label>.",
    );
  }
  const unpinned = voices.filter((voice) => !voice.referenceId);
  if (unpinned.length > 0) {
    throw new Error(
      `Every Fish voice must include a reference_id. Missing: ${unpinned.map((voice) => voice.id).join(", ")}.`,
    );
  }
  if (mode === "full" && voices.length !== 1) {
    throw new Error("Full corpus generation requires exactly one pinned narrator voice.");
  }
}

export function selectSections(
  catalog: Pick<CompiledCatalog, "sections">,
  mode: FishRunMode,
  explicitIds: string[],
): CompiledSection[] {
  const ids = explicitIds.length > 0 ? explicitIds : mode === "sample" ? sampleSectionIds : [];
  if (ids.length === 0) return catalog.sections;

  const sectionsById = new Map(catalog.sections.map((section) => [section.sectionId, section]));
  return ids.map((sectionId) => {
    const section = sectionsById.get(sectionId);
    if (!section) throw new Error(`Unknown sectionId '${sectionId}'.`);
    return section;
  });
}

export function trimTextForAudio(text: string, maxCharacters: number | null): string {
  if (maxCharacters === null || text.length <= maxCharacters) return text;
  const clipped = text.slice(0, maxCharacters);
  const sentenceBoundary = Math.max(
    clipped.lastIndexOf(". "),
    clipped.lastIndexOf("? "),
    clipped.lastIndexOf("! "),
    clipped.lastIndexOf("\n\n"),
  );
  const endIndex = sentenceBoundary > 20 ? sentenceBoundary + 1 : maxCharacters;
  return text.slice(0, endIndex).trim();
}

export function estimatePaidCostUsd(inputBytes: number): number {
  return (inputBytes / 1_000_000) * fishPaidUsdPerMillionBytes;
}

export function settingsHash(settings: unknown): string {
  return sha256(JSON.stringify(settings)).slice(0, 12);
}

export function audioCacheKey(input: {
  sectionId: string;
  contentHash: string;
  provider: string;
  model: string;
  voiceId: string;
  settingsHash: string;
  format: string;
}): string {
  return [
    input.provider,
    input.model,
    input.voiceId,
    input.sectionId,
    input.contentHash,
    input.settingsHash,
    input.format,
  ].join("/");
}

export function runIdForNow(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function buildManifestFiles(input: {
  sections: CompiledSection[];
  voices: FishVoice[];
  model: string;
  runRoot: string;
  settingsHash: string;
  format: FishAudioFormat;
}): FishAudioFile[] {
  return input.voices.flatMap((voice) =>
    input.sections.map((section) => {
      const text = textForAudio(section);
      const publicCacheKey = audioCacheKey({
        sectionId: section.sectionId,
        contentHash: section.contentHash,
        provider: "fish-audio",
        model: input.model,
        voiceId: voice.id,
        settingsHash: input.settingsHash,
        format: input.format,
      });
      const extension = input.format;
      const relativeOutputPath = path.join(
        "voices",
        voice.id,
        `${section.audioVersionId}-${input.settingsHash}.${extension}`,
      );
      const timingsRelativeOutputPath = path.join(
        "voices",
        voice.id,
        `${section.audioVersionId}-${input.settingsHash}.timings.json`,
      );
      const outputPath = path.join(input.runRoot, relativeOutputPath);
      const timingsOutputPath = path.join(input.runRoot, timingsRelativeOutputPath);
      return {
        sectionId: section.sectionId,
        title: section.title,
        contentHash: section.contentHash,
        audioVersionId: section.audioVersionId,
        volumeId: section.volumeId,
        voiceId: voice.id,
        voiceLabel: voice.label,
        provider: "fish-audio" as const,
        model: input.model,
        format: input.format,
        inputBytes: Buffer.byteLength(text, "utf8"),
        inputCharacters: text.length,
        outputPath,
        relativeOutputPath,
        timingsOutputPath,
        timingsRelativeOutputPath,
        publicCacheKey,
      };
    }),
  );
}

export function createRunManifest(input: {
  model: string;
  settingsHash?: string;
  catalogHash?: string;
  mode: FishRunMode;
  runId: string;
  voices: FishVoice[];
  files: FishAudioFile[];
}): FishRunManifest {
  const inputBytes = input.files.reduce((total, file) => total + file.inputBytes, 0);
  const inputCharacters = input.files.reduce(
    (total, file) => total + file.inputCharacters,
    0,
  );
  return {
    schemaVersion: 2,
    provider: "fish-audio",
    endpoint: "stream-with-timestamp",
    model: input.model,
    settingsHash: input.settingsHash,
    catalogHash: input.catalogHash,
    mode: input.mode,
    runId: input.runId,
    generatedAt: new Date().toISOString(),
    corpus: {
      sections: new Set(input.files.map((file) => file.sectionId)).size,
      voices: input.voices.length,
      inputBytes,
      inputCharacters,
      estimatedPaidCostUsd: Number(estimatePaidCostUsd(inputBytes).toFixed(2)),
    },
    voices: input.voices,
    files: input.files,
  };
}

type FishTimestampStreamEvent = {
  audio_base64: string;
  content: string;
  alignment: {
    segments: FishTimestampSegment[];
    audio_duration: number;
  } | null;
  chunk_seq: number;
  chunk_audio_offset_sec: number;
};

export type FishTimestampedAudio = {
  audio: Buffer;
  chunks: FishTimestampChunk[];
  snapshots: FishTimestampChunk[];
};

export function concatenateFishAudioChunks(chunks: Buffer[]): Buffer {
  const audio = Buffer.concat(chunks);
  if (audio.byteLength === 0) {
    throw new Error("Fish Audio timestamped TTS returned no audio chunks.");
  }
  return audio;
}

export function selectLatestFishTimestampChunks(
  snapshots: FishTimestampChunk[],
): FishTimestampChunk[] {
  const selectedByChunk = new Map<number, FishTimestampChunk>();
  for (const snapshot of snapshots) {
    selectedByChunk.set(snapshot.chunkSeq, snapshot);
  }
  return [...selectedByChunk.values()].sort(
    (left, right) => left.chunkSeq - right.chunkSeq,
  );
}

function parseTimestampEvent(value: string): FishTimestampStreamEvent | null {
  if (!value || value === "[DONE]") return null;
  const event = JSON.parse(value) as Partial<FishTimestampStreamEvent>;
  if (
    typeof event.audio_base64 !== "string" ||
    typeof event.content !== "string" ||
    typeof event.chunk_seq !== "number" ||
    typeof event.chunk_audio_offset_sec !== "number" ||
    !(event.alignment === null || typeof event.alignment === "object")
  ) {
    throw new Error("Fish Audio returned an invalid timestamp stream event.");
  }
  return event as FishTimestampStreamEvent;
}

export function parseFishTimestampSseEvents(value: string): FishTimestampStreamEvent[] {
  return value
    .replace(/\r\n/g, "\n")
    .split("\n\n")
    .map((eventText) =>
      eventText
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n"),
    )
    .map(parseTimestampEvent)
    .filter((event): event is FishTimestampStreamEvent => event !== null);
}

export type FishTtsWithTimestampsInput = {
  apiKey: string;
  model: string;
  text: string;
  referenceId: string;
  format: FishAudioFormat;
  speed: number;
  normalize: boolean;
  latency: "normal" | "balanced" | "low";
  chunkLength: number;
  opusBitrate: 24000 | 32000 | 48000 | 64000;
  temperature?: number;
  topP?: number;
  timeoutMs: number;
};

async function fishTtsWithTimestampsAttempt(
  input: FishTtsWithTimestampsInput,
): Promise<FishTimestampedAudio> {
  const body: Record<string, unknown> = {
    text: input.text,
    format: input.format,
    normalize: input.normalize,
    prosody: { speed: input.speed, volume: 0, normalize_loudness: true },
    reference_id: input.referenceId,
    latency: input.latency,
    chunk_length: input.chunkLength,
    condition_on_previous_chunks: true,
    max_new_tokens: 1024,
    repetition_penalty: 1.2,
    min_chunk_length: 50,
    early_stop_threshold: 1,
  };
  if (input.format === "opus") {
    body.sample_rate = 48000;
    body.opus_bitrate = input.opusBitrate;
  }
  if (input.temperature !== undefined) body.temperature = input.temperature;
  if (input.topP !== undefined) body.top_p = input.topP;

  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const resetTimeout = () => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  };
  resetTimeout();
  let response: Response;
  try {
    response = await fetch("https://api.fish.audio/v1/tts/stream/with-timestamp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
        model: input.model,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Fish Audio timestamped TTS failed with ${response.status}: ${errorText || response.statusText}`,
      );
    }
    if (!response.body) {
      throw new Error("Fish Audio timestamped TTS returned an empty stream.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const audioChunks: Buffer[] = [];
    const alignmentSnapshots: FishTimestampChunk[] = [];
    let buffer = "";

    const processEventText = (eventText: string) => {
      for (const event of parseFishTimestampSseEvents(`${eventText}\n\n`)) {
        audioChunks.push(Buffer.from(event.audio_base64, "base64"));
        if (event.alignment) {
          alignmentSnapshots.push({
            chunkSeq: event.chunk_seq,
            content: event.content,
            offsetSeconds: event.chunk_audio_offset_sec,
            audioDurationSeconds: event.alignment.audio_duration,
            segments: event.alignment.segments,
          });
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetTimeout();
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      const eventTexts = buffer.split("\n\n");
      buffer = eventTexts.pop() ?? "";
      for (const eventText of eventTexts) processEventText(eventText);
    }
    buffer += decoder.decode();
    if (buffer.trim()) processEventText(buffer);
    const audio = concatenateFishAudioChunks(audioChunks);
    if (alignmentSnapshots.length === 0) {
      throw new Error("Fish Audio timestamped TTS returned no alignment snapshots.");
    }
    return {
      audio,
      chunks: selectLatestFishTimestampChunks(alignmentSnapshots),
      snapshots: alignmentSnapshots,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `Fish Audio timestamped TTS was idle for ${input.timeoutMs}ms.`,
      );
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function isRetryableFishError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "TypeError") return true;
  if (/was idle|empty stream|no audio chunks|no alignment snapshots/i.test(error.message)) {
    return true;
  }
  const status = error.message.match(/failed with (\d{3})/)?.[1];
  if (!status) return false;
  const statusCode = Number(status);
  return statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
}

export async function fishTtsWithTimestamps(
  input: FishTtsWithTimestampsInput,
): Promise<FishTimestampedAudio> {
  const attempts = 5;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fishTtsWithTimestampsAttempt(input);
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isRetryableFishError(error)) throw error;
      const waitMs = 1_500 * (2 ** (attempt - 1)) + Math.floor(Math.random() * 500);
      console.warn(
        `Fish Audio attempt ${attempt} failed transiently. Retrying in ${waitMs}ms.`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError;
}

export function audioDurationSeconds(filePath: string): number | undefined {
  try {
    const output = execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { encoding: "utf8" },
    ).trim();
    const duration = Number(output);
    return Number.isFinite(duration) ? Number(duration.toFixed(3)) : undefined;
  } catch {
    return undefined;
  }
}

export function writeRunManifest(runRoot: string, manifest: FishRunManifest): string {
  ensureDir(runRoot);
  const manifestPath = path.join(runRoot, "manifest.json");
  writeJson(manifestPath, manifest);
  return manifestPath;
}

export function artifactsAudioRoot(): string {
  return generatedAudioReportsRoot;
}

export function createSettings(input: {
  model: string;
  format: FishAudioFormat;
  speed: number;
  normalize: boolean;
  latency: "normal" | "balanced" | "low";
  chunkLength: number;
  opusBitrate: 24000 | 32000 | 48000 | 64000;
  temperature?: number;
  topP?: number;
  timingSource: AudioTimingSource;
  localAlignmentModel?: string;
}) {
  return {
    provider: "fish-audio",
    model: input.model,
    endpoint: "stream-with-timestamp",
    format: input.format,
    speed: input.speed,
    normalize: input.normalize,
    latency: input.latency,
    chunkLength: input.chunkLength,
    opusBitrate: input.format === "opus" ? input.opusBitrate : null,
    temperature: input.temperature ?? 0.7,
    topP: input.topP ?? 0.7,
    maxNewTokens: 1024,
    repetitionPenalty: 1.2,
    minChunkLength: 50,
    conditionOnPreviousChunks: true,
    earlyStopThreshold: 1,
    timingSource: input.timingSource,
    localAlignmentModel:
      input.timingSource === "fish" ? null : input.localAlignmentModel ?? null,
  };
}

export function generatedFileFingerprint(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function relativeToRepo(filePath: string): string {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

export function existingFileMetadata(filePath: string) {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  return {
    byteSize: stat.size,
    durationSeconds: audioDurationSeconds(filePath),
  };
}
