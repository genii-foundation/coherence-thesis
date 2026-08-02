import fs from "node:fs";
import path from "node:path";
import {
  audioTimingsHref,
  type AudioClipManifest,
  type AudioClipSection,
  type AudioClipVoice,
} from "../../src/lib/audio-manifest";
import { readVolumeConfigs, writeJson } from "../manuscripts/shared";
import type { CompiledCatalog } from "../manuscripts/types";
import {
  audioManifestSourcePath,
  audioPublicationCheckpointsRoot,
  editorialVolumeIds,
  generatedCatalogPath,
} from "../repository/paths";
import {
  validateAudioPublicationCheckpoint,
  type AudioPublicationCheckpoint,
} from "./audio-publication-checkpoints";

type PromoteOptions = {
  editorialId: string;
  version: string;
  write: boolean;
};

type TimingCounts = {
  sectionId: string;
  audioVersionId: string;
  voiceId: string;
  exactWordCount: number;
  interpolatedWordCount: number;
};

export type AudioVolumePromotion = {
  manifest: AudioClipManifest;
  editorialId: string;
  volumeId: string;
  narratorId: string;
  replacedSectionCount: number;
  promotedSectionCount: number;
  previousRenderedWordCount: number;
  promotedRenderedWordCount: number;
  renderedWordCount: number;
};

const safeSegment = /^[a-z0-9][a-z0-9._-]*$/i;
const sectionVolumePattern = /^v(0[1-9])-/;

function optionValue(args: string[], name: string): string | undefined {
  const prefix = `${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export function parseAudioVolumePromotionOptions(args: string[]): PromoteOptions {
  const editorialId = optionValue(args, "--volume");
  const version = optionValue(args, "--version");
  if (!editorialId || !editorialVolumeIds.includes(editorialId)) {
    throw new Error("Set --volume to volume-01 through volume-09.");
  }
  if (!version || !safeSegment.test(version)) {
    throw new Error("Set --version to the checkpoint's immutable audio version.");
  }
  return {
    editorialId,
    version,
    write: args.includes("--write"),
  };
}

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function assertNonemptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a nonempty string.`);
  }
}

function assertPositiveNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

function assertNonnegativeInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative integer.`);
  }
}

function validateManifestSection(
  value: unknown,
  label: string,
): asserts value is AudioClipSection {
  assertObject(value, label);
  assertNonemptyString(value.sectionId, `${label}.sectionId`);
  if (!sectionVolumePattern.test(value.sectionId)) {
    throw new Error(`${label}.sectionId cannot be assigned to a canonical volume.`);
  }
  assertNonemptyString(value.audioVersionId, `${label}.audioVersionId`);
  assertNonemptyString(value.href, `${label}.href`);
  const href = new URL(value.href);
  if (href.protocol !== "https:") {
    throw new Error(`${label}.href must use HTTPS.`);
  }
  if (value.format !== undefined && !["mp3", "opus", "wav"].includes(String(value.format))) {
    throw new Error(`${label}.format is not supported.`);
  }
  if (value.byteSize !== undefined) assertPositiveNumber(value.byteSize, `${label}.byteSize`);
  if (value.durationSeconds !== undefined) {
    assertPositiveNumber(value.durationSeconds, `${label}.durationSeconds`);
  }
  if (value.timingsByteSize !== undefined) {
    assertPositiveNumber(value.timingsByteSize, `${label}.timingsByteSize`);
  }
}

export function validateCurrentAudioManifest(value: unknown): AudioClipManifest {
  assertObject(value, "Audio manifest");
  if (value.version !== 1) throw new Error("Audio manifest version must be 1.");
  if (value.generatedAt !== undefined) {
    assertNonemptyString(value.generatedAt, "Audio manifest generatedAt");
    if (Number.isNaN(Date.parse(value.generatedAt))) {
      throw new Error("Audio manifest generatedAt must be a timestamp.");
    }
  }
  if (!Array.isArray(value.voices) || value.voices.length === 0) {
    throw new Error("Audio manifest must contain at least one voice.");
  }
  const seenVoices = new Set<string>();
  for (const [voiceIndex, voice] of value.voices.entries()) {
    const label = `Audio manifest voices[${voiceIndex}]`;
    assertObject(voice, label);
    assertNonemptyString(voice.id, `${label}.id`);
    assertNonemptyString(voice.label, `${label}.label`);
    if (seenVoices.has(voice.id)) throw new Error(`Duplicate audio voice ${voice.id}.`);
    seenVoices.add(voice.id);
    assertPositiveNumber(voice.renderedWordCount, `${label}.renderedWordCount`);
    if (!Number.isInteger(voice.renderedWordCount)) {
      throw new Error(`${label}.renderedWordCount must be an integer.`);
    }
    if (!Array.isArray(voice.sections) || voice.sections.length === 0) {
      throw new Error(`${label}.sections must not be empty.`);
    }
    const seenSections = new Set<string>();
    for (const [sectionIndex, section] of voice.sections.entries()) {
      validateManifestSection(section, `${label}.sections[${sectionIndex}]`);
      if (seenSections.has(section.sectionId)) {
        throw new Error(`${label} contains duplicate section ${section.sectionId}.`);
      }
      seenSections.add(section.sectionId);
    }
  }
  return value as unknown as AudioClipManifest;
}

function editorialPrefix(editorialId: string): string {
  return `v${editorialId.slice("volume-".length)}-`;
}

function publicAudioBase(sections: AudioClipSection[]): string {
  const bases = new Set(sections.map((section) => {
    const marker = "/audiobook/";
    const index = section.href.indexOf(marker);
    if (index < 1) throw new Error(`${section.sectionId}: published href has no audiobook path.`);
    return section.href.slice(0, index);
  }));
  if (bases.size !== 1) {
    throw new Error("The narrator's published sections do not share one public audio base.");
  }
  return [...bases][0]!;
}

function encodeObjectKey(objectKey: string): string {
  return objectKey.split("/").map(encodeURIComponent).join("/");
}

function promotedSection(
  file: AudioPublicationCheckpoint["files"][number],
  base: string,
): AudioClipSection {
  return {
    sectionId: file.sectionId,
    audioVersionId: file.audioVersionId,
    href: `${base}/${encodeObjectKey(file.audio.objectKey)}`,
    format: "opus",
    byteSize: file.audio.byteSize,
    durationSeconds: file.durationSeconds,
    timingsByteSize: file.timings.byteSize,
  };
}

function exactTargetCatalogSections(input: {
  catalog: CompiledCatalog;
  volumeId: string;
  prefix: string;
}): CompiledCatalog["sections"] {
  const seen = new Set<string>();
  for (const section of input.catalog.sections) {
    if (seen.has(section.sectionId)) {
      throw new Error(`Current catalog contains duplicate section ${section.sectionId}.`);
    }
    seen.add(section.sectionId);
  }
  const sections = input.catalog.sections.filter((section) => section.volumeId === input.volumeId);
  if (sections.length === 0) throw new Error(`${input.volumeId}: current catalog has no sections.`);
  if (sections.some((section) => !section.sectionId.startsWith(input.prefix))) {
    throw new Error(`${input.volumeId}: current catalog contains a cross-volume section id.`);
  }
  return sections;
}

export function planAudioVolumePromotion(input: {
  manifest: unknown;
  checkpoint: unknown;
  catalog: CompiledCatalog;
  editorialId: string;
  volumeId: string;
  previousTargetRenderedWordCount: number;
}): AudioVolumePromotion {
  const manifest = validateCurrentAudioManifest(input.manifest);
  const checkpoint = validateAudioPublicationCheckpoint(input.checkpoint);
  if (checkpoint.editorialId !== input.editorialId || checkpoint.volumeId !== input.volumeId) {
    throw new Error("Checkpoint identity does not match the requested volume.");
  }
  const prefix = editorialPrefix(input.editorialId);
  const catalogSections = exactTargetCatalogSections({
    catalog: input.catalog,
    volumeId: input.volumeId,
    prefix,
  });
  const checkpointFiles = new Map(checkpoint.files.map((file) => [file.sectionId, file]));
  if (checkpointFiles.size !== checkpoint.files.length) {
    throw new Error("Checkpoint contains duplicate sections.");
  }
  if (checkpoint.files.some((file) => !file.sectionId.startsWith(prefix))) {
    throw new Error("Checkpoint contains a cross-volume section.");
  }
  if (checkpointFiles.size !== catalogSections.length) {
    throw new Error("Checkpoint section count does not match the current target volume.");
  }
  for (const section of catalogSections) {
    const file = checkpointFiles.get(section.sectionId);
    if (!file) throw new Error(`Checkpoint is missing current section ${section.sectionId}.`);
    if (file.audioVersionId !== section.audioVersionId) {
      throw new Error(`${section.sectionId}: checkpoint audioVersionId is stale.`);
    }
    const expectedAudioKey = `audiobook/${checkpoint.version}/${checkpoint.narrator.id}/${file.audioVersionId}.opus`;
    const expectedTimingsKey = `audiobook/${checkpoint.version}/${checkpoint.narrator.id}/${file.audioVersionId}.timings.json`;
    if (file.audio.objectKey !== expectedAudioKey || file.timings.objectKey !== expectedTimingsKey) {
      throw new Error(`${section.sectionId}: checkpoint object keys do not match its audioVersionId.`);
    }
  }

  const matchingVoices = manifest.voices.filter((voice) => voice.id === checkpoint.narrator.id);
  if (matchingVoices.length !== 1) {
    throw new Error(`Manifest must contain exactly one ${checkpoint.narrator.id} narrator.`);
  }
  const currentVoice = matchingVoices[0]!;
  if (
    currentVoice.label !== checkpoint.narrator.label ||
    currentVoice.provider !== checkpoint.provider ||
    currentVoice.model !== checkpoint.model
  ) {
    throw new Error("Checkpoint narrator metadata does not match the current manifest voice.");
  }
  const targetIndexes = currentVoice.sections
    .map((section, index) => section.sectionId.startsWith(prefix) ? index : -1)
    .filter((index) => index >= 0);
  if (targetIndexes.length === 0) {
    throw new Error("Current manifest has no target-volume entries to replace.");
  }
  const firstTarget = targetIndexes[0]!;
  const lastTarget = targetIndexes[targetIndexes.length - 1]!;
  if (lastTarget - firstTarget + 1 !== targetIndexes.length) {
    throw new Error("Current manifest target-volume entries are not contiguous.");
  }
  assertNonnegativeInteger(
    input.previousTargetRenderedWordCount,
    "Previous target rendered word count",
  );
  if (input.previousTargetRenderedWordCount <= 0) {
    throw new Error("Previous target rendered word count must be positive.");
  }
  if (input.previousTargetRenderedWordCount > currentVoice.renderedWordCount!) {
    throw new Error("Previous target rendered word count exceeds the narrator total.");
  }

  const base = publicAudioBase(currentVoice.sections);
  const promoted = catalogSections.map((section) => promotedSection(checkpointFiles.get(section.sectionId)!, base));
  const promotedRenderedWordCount = checkpoint.files.reduce(
    (total, file) => total + file.exactWordCount + file.interpolatedWordCount,
    0,
  );
  const renderedWordCount =
    currentVoice.renderedWordCount! -
    input.previousTargetRenderedWordCount +
    promotedRenderedWordCount;
  const sections = [
    ...currentVoice.sections.slice(0, firstTarget),
    ...promoted,
    ...currentVoice.sections.slice(lastTarget + 1),
  ];
  const voice: AudioClipVoice = {
    ...currentVoice,
    renderedWordCount,
    sections,
  };
  const voices = manifest.voices.map((candidate) =>
    candidate.id === voice.id ? voice : candidate,
  );
  return {
    manifest: {
      ...manifest,
      generatedAt:
        manifest.generatedAt && manifest.generatedAt > checkpoint.remoteVerifiedAt
          ? manifest.generatedAt
          : checkpoint.remoteVerifiedAt,
      voices,
    },
    editorialId: input.editorialId,
    volumeId: input.volumeId,
    narratorId: checkpoint.narrator.id,
    replacedSectionCount: targetIndexes.length,
    promotedSectionCount: promoted.length,
    previousRenderedWordCount: input.previousTargetRenderedWordCount,
    promotedRenderedWordCount,
    renderedWordCount,
  };
}

function parseTimingCounts(value: unknown, section: AudioClipSection, voiceId: string): TimingCounts {
  assertObject(value, `${section.sectionId} timing sidecar`);
  assertNonemptyString(value.sectionId, `${section.sectionId} timing sidecar sectionId`);
  assertNonemptyString(value.audioVersionId, `${section.sectionId} timing sidecar audioVersionId`);
  assertNonemptyString(value.voiceId, `${section.sectionId} timing sidecar voiceId`);
  assertNonnegativeInteger(value.exactWordCount, `${section.sectionId} exactWordCount`);
  assertNonnegativeInteger(value.interpolatedWordCount, `${section.sectionId} interpolatedWordCount`);
  if (
    value.sectionId !== section.sectionId ||
    value.audioVersionId !== section.audioVersionId ||
    value.voiceId !== voiceId
  ) {
    throw new Error(`${section.sectionId}: timing sidecar identity does not match the manifest.`);
  }
  return value as unknown as TimingCounts;
}

export async function readPreviousTargetRenderedWordCount(input: {
  voice: AudioClipVoice;
  editorialId: string;
  fetchImpl?: typeof fetch;
}): Promise<number> {
  const prefix = editorialPrefix(input.editorialId);
  const sections = input.voice.sections.filter((section) => section.sectionId.startsWith(prefix));
  if (sections.length === 0) throw new Error("Manifest has no previous target audio to measure.");
  const fetchImpl = input.fetchImpl ?? fetch;
  let renderedWordCount = 0;
  const concurrency = 8;
  for (let index = 0; index < sections.length; index += concurrency) {
    const batch = sections.slice(index, index + concurrency);
    const counts = await Promise.all(batch.map(async (section) => {
      const url = audioTimingsHref(section);
      if (!url || section.timingsByteSize === undefined) {
        throw new Error(`${section.sectionId}: current manifest lacks timing-sidecar evidence.`);
      }
      const response = await fetchImpl(url, { method: "GET" });
      if (!response.ok) {
        throw new Error(`${section.sectionId}: timing sidecar returned HTTP ${response.status}.`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength !== section.timingsByteSize) {
        throw new Error(`${section.sectionId}: timing sidecar size does not match the manifest.`);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(bytes.toString("utf8"));
      } catch {
        throw new Error(`${section.sectionId}: timing sidecar is not valid JSON.`);
      }
      return parseTimingCounts(parsed, section, input.voice.id);
    }));
    renderedWordCount += counts.reduce(
      (total, count) => total + count.exactWordCount + count.interpolatedWordCount,
      0,
    );
  }
  return renderedWordCount;
}

async function main(): Promise<void> {
  const options = parseAudioVolumePromotionOptions(process.argv.slice(2));
  const configs = readVolumeConfigs();
  const config = configs.find((candidate) => candidate.editorialId === options.editorialId);
  if (!config) throw new Error(`${options.editorialId}: canonical volume configuration is missing.`);
  const checkpointPath = path.join(
    audioPublicationCheckpointsRoot,
    options.version,
    `${options.editorialId}.json`,
  );
  if (!fs.existsSync(checkpointPath)) {
    throw new Error(`Audio publication checkpoint does not exist: ${checkpointPath}`);
  }
  const manifestValue = JSON.parse(fs.readFileSync(audioManifestSourcePath, "utf8")) as unknown;
  const manifest = validateCurrentAudioManifest(manifestValue);
  const checkpointValue = JSON.parse(fs.readFileSync(checkpointPath, "utf8")) as unknown;
  const checkpoint = validateAudioPublicationCheckpoint(checkpointValue, checkpointPath);
  if (checkpoint.version !== options.version) {
    throw new Error("Checkpoint version does not match the requested immutable version.");
  }
  const catalog = JSON.parse(fs.readFileSync(generatedCatalogPath, "utf8")) as CompiledCatalog;
  const voice = manifest.voices.find((candidate) => candidate.id === checkpoint.narrator.id);
  if (!voice) throw new Error(`Current manifest has no ${checkpoint.narrator.id} narrator.`);
  const previousTargetRenderedWordCount = await readPreviousTargetRenderedWordCount({
    voice,
    editorialId: options.editorialId,
  });
  const promotion = planAudioVolumePromotion({
    manifest,
    checkpoint,
    catalog,
    editorialId: options.editorialId,
    volumeId: config.volumeId,
    previousTargetRenderedWordCount,
  });
  if (options.write) writeJson(audioManifestSourcePath, promotion.manifest);
  process.stdout.write(
    `${options.write ? "Promoted" : "Validated"} ${promotion.editorialId} for ${promotion.narratorId}: ` +
    `${promotion.promotedSectionCount.toLocaleString()} current sections replace ` +
    `${promotion.replacedSectionCount.toLocaleString()} published sections; rendered words ` +
    `${promotion.previousRenderedWordCount.toLocaleString()} -> ` +
    `${promotion.promotedRenderedWordCount.toLocaleString()} for the volume, ` +
    `${promotion.renderedWordCount.toLocaleString()} total.${options.write ? "" : " Manifest unchanged; pass --write to promote."}\n`,
  );
}

if (process.argv[1]?.endsWith("promote-audio-volume.ts")) {
  main().catch((error) => {
    process.stderr.write(
      `audio:promote-volume: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  });
}
