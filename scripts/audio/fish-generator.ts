import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ensureDir, repoRoot, sha256, writeJson } from "../manuscripts/shared";
import type { CompiledCatalog, CompiledSection } from "../manuscripts/types";

export type FishVoice = {
  id: string;
  label: string;
  referenceId?: string;
};

export type FishRunMode = "sample" | "full";

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
  format: "mp3";
  inputBytes: number;
  inputCharacters: number;
  outputPath: string;
  relativeOutputPath: string;
  publicCacheKey: string;
  generatedAt?: string;
  durationSeconds?: number;
  byteSize?: number;
  skipped?: boolean;
  error?: string;
};

export type FishRunManifest = {
  provider: "fish-audio";
  model: string;
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

export const defaultFishVoice: FishVoice = {
  id: "default",
  label: "Fish default",
};

export const sampleSectionIds = [
  "v02-relational-coherence",
  "v05-purposeful",
  "v09-3-providence-the-device-that-coordinates-the-many",
  "v08-3-the-present-tense-a-reckoning-of-the-year-2026",
];

export function normalizeVoiceId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseVoices(value: string | undefined): FishVoice[] {
  if (!value?.trim()) return [defaultFishVoice];
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
  if (parsed.length === 0) return [defaultFishVoice];
  return parsed;
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

export function textForAudio(section: Pick<CompiledSection, "title" | "text">): string {
  return `${section.title}\n\n${section.text}`.trim();
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

export function chunkTextForAudio(text: string, maxCharacters: number): string[] {
  if (maxCharacters < 500) throw new Error("--chunk-chars must be at least 500.");
  const paragraphs = text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (!current.trim()) return;
    chunks.push(current.trim());
    current = "";
  };

  const appendUnit = (unit: string) => {
    const trimmed = unit.trim();
    if (!trimmed) return;
    if (trimmed.length > maxCharacters) {
      pushCurrent();
      for (let index = 0; index < trimmed.length; index += maxCharacters) {
        chunks.push(trimmed.slice(index, index + maxCharacters).trim());
      }
      return;
    }
    const candidate = current ? `${current}\n\n${trimmed}` : trimmed;
    if (candidate.length > maxCharacters) {
      pushCurrent();
      current = trimmed;
    } else {
      current = candidate;
    }
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxCharacters) {
      appendUnit(paragraph);
      continue;
    }
    for (const sentence of paragraph.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) ?? [paragraph]) {
      appendUnit(sentence);
    }
  }
  pushCurrent();
  return chunks;
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
        format: "mp3",
      });
      const relativeOutputPath = path.join(
        "voices",
        voice.id,
        `${section.audioVersionId}-${input.settingsHash}.mp3`,
      );
      const outputPath = path.join(input.runRoot, relativeOutputPath);
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
        format: "mp3" as const,
        inputBytes: Buffer.byteLength(text, "utf8"),
        inputCharacters: text.length,
        outputPath,
        relativeOutputPath,
        publicCacheKey,
      };
    }),
  );
}

export function createRunManifest(input: {
  model: string;
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
    provider: "fish-audio",
    model: input.model,
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

export async function fishTts(input: {
  apiKey: string;
  model: string;
  text: string;
  referenceId?: string;
  speed: number;
  normalize: boolean;
  temperature?: number;
  topP?: number;
  timeoutMs: number;
}): Promise<Buffer> {
  const body: Record<string, unknown> = {
    text: input.text,
    format: "mp3",
    normalize: input.normalize,
    prosody: { speed: input.speed, volume: 0 },
  };
  if (input.referenceId) body.reference_id = input.referenceId;
  if (input.temperature !== undefined) body.temperature = input.temperature;
  if (input.topP !== undefined) body.top_p = input.topP;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  let response: Response;
  try {
    response = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
        model: input.model,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Fish Audio TTS timed out after ${input.timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Fish Audio TTS failed with ${response.status}: ${errorText || response.statusText}`,
    );
  }

  return Buffer.from(await response.arrayBuffer());
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
  return path.join(repoRoot, "artifacts/audio-runs");
}

export function createSettings(input: {
  model: string;
  speed: number;
  normalize: boolean;
  temperature?: number;
  topP?: number;
}) {
  return {
    provider: "fish-audio",
    model: input.model,
    format: "mp3",
    speed: input.speed,
    normalize: input.normalize,
    temperature: input.temperature ?? null,
    topP: input.topP ?? null,
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
