import fs from "node:fs";
import path from "node:path";

import {
  audioTimingsHref,
  type AudioClipManifest,
  type AudioClipSection,
  type AudioClipVoice,
} from "../../src/lib/audio-manifest";
import { writeJson } from "../manuscripts/shared";
import type { CompiledCatalog } from "../manuscripts/types";
import {
  audioManifestSourcePath,
  audioPublicationCheckpointsRoot,
  generatedCatalogPath,
} from "../repository/paths";
import {
  validateAudioPublicationCheckpoint,
  type AudioPublicationCheckpoint,
} from "./audio-publication-checkpoints";
import { validateCurrentAudioManifest } from "./promote-audio-volume";

type PromoteSectionOptions = {
  version: string;
  sectionIds: string[];
  write: boolean;
};

type TimingCounts = {
  sectionId: string;
  audioVersionId: string;
  voiceId: string;
  exactWordCount: number;
  interpolatedWordCount: number;
};

export type AudioSectionPromotion = {
  manifest: AudioClipManifest;
  version: string;
  narratorId: string;
  promotedSectionIds: string[];
  previousRenderedWordCount: number;
  promotedRenderedWordCount: number;
  renderedWordCount: number;
};

const safeSegment = /^[a-z0-9][a-z0-9._-]*$/i;

function optionValue(args: string[], name: string): string | undefined {
  const prefix = `${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export function parseAudioSectionPromotionOptions(
  args: string[],
): PromoteSectionOptions {
  const version = optionValue(args, "--version");
  if (!version || !safeSegment.test(version)) {
    throw new Error("Set --version to the immutable delta checkpoint version.");
  }
  const sectionIds = (optionValue(args, "--sections") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (sectionIds.length === 0) {
    throw new Error("Set --sections to the exact changed section ids.");
  }
  if (new Set(sectionIds).size !== sectionIds.length) {
    throw new Error("--sections contains a duplicate section id.");
  }
  return { version, sectionIds, write: args.includes("--write") };
}

function assertObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !value) {
    throw new Error(`${label} must be a nonempty string.`);
  }
}

function assertNonnegativeInteger(
  value: unknown,
  label: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative integer.`);
  }
}

function publicAudioBase(sections: AudioClipSection[]): string {
  const bases = new Set(sections.map((section) => {
    const marker = "/audiobook/";
    const index = section.href.indexOf(marker);
    if (index < 1) {
      throw new Error(`${section.sectionId}: published href has no audiobook path.`);
    }
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

function compareExactSets(
  expected: string[],
  actual: string[],
  label: string,
): void {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const missing = expected.filter((value) => !actualSet.has(value));
  const extra = actual.filter((value) => !expectedSet.has(value));
  if (missing.length || extra.length) {
    throw new Error(
      `${label} does not match --sections. Missing: ${missing.join(", ") || "none"}. ` +
      `Extra: ${extra.join(", ") || "none"}.`,
    );
  }
}

export function planAudioSectionPromotion(input: {
  manifest: unknown;
  checkpoints: unknown[];
  catalog: CompiledCatalog;
  version: string;
  sectionIds: string[];
  previousRenderedWordCount: number;
}): AudioSectionPromotion {
  const manifest = validateCurrentAudioManifest(input.manifest);
  const checkpoints = input.checkpoints.map((checkpoint, index) =>
    validateAudioPublicationCheckpoint(checkpoint, `Delta checkpoint ${index + 1}`),
  );
  if (checkpoints.length === 0) {
    throw new Error("The immutable version contains no audio checkpoints.");
  }
  if (checkpoints.some((checkpoint) => checkpoint.version !== input.version)) {
    throw new Error("A delta checkpoint version does not match --version.");
  }

  const first = checkpoints[0]!;
  for (const checkpoint of checkpoints.slice(1)) {
    if (
      checkpoint.narrator.id !== first.narrator.id ||
      checkpoint.narrator.label !== first.narrator.label ||
      checkpoint.narrator.referenceId !== first.narrator.referenceId ||
      checkpoint.provider !== first.provider ||
      checkpoint.model !== first.model ||
      checkpoint.runId !== first.runId ||
      checkpoint.sourceCommit !== first.sourceCommit ||
      checkpoint.catalogHash !== first.catalogHash ||
      checkpoint.settingsHash !== first.settingsHash
    ) {
      throw new Error("Delta checkpoints do not share one generation identity.");
    }
  }

  const files = checkpoints.flatMap((checkpoint) => checkpoint.files.map((file) => ({
    checkpoint,
    file,
  })));
  compareExactSets(
    input.sectionIds,
    files.map(({ file }) => file.sectionId),
    "Delta checkpoint coverage",
  );
  if (new Set(files.map(({ file }) => file.sectionId)).size !== files.length) {
    throw new Error("Delta checkpoints contain a duplicate section.");
  }

  const catalogById = new Map(
    input.catalog.sections.map((section) => [section.sectionId, section]),
  );
  if (catalogById.size !== input.catalog.sections.length) {
    throw new Error("Current catalog contains duplicate section ids.");
  }
  for (const { checkpoint, file } of files) {
    const catalogSection = catalogById.get(file.sectionId);
    if (!catalogSection) {
      throw new Error(`${file.sectionId}: delta checkpoint section is not current.`);
    }
    if (catalogSection.volumeId !== checkpoint.volumeId) {
      throw new Error(`${file.sectionId}: delta checkpoint contains a cross-volume section.`);
    }
    if (catalogSection.audioVersionId !== file.audioVersionId) {
      throw new Error(`${file.sectionId}: delta checkpoint audioVersionId is stale.`);
    }
    const expectedPrefix = `audiobook/${input.version}/${first.narrator.id}/${file.audioVersionId}`;
    if (
      file.audio.objectKey !== `${expectedPrefix}.opus` ||
      file.timings.objectKey !== `${expectedPrefix}.timings.json`
    ) {
      throw new Error(`${file.sectionId}: delta checkpoint object keys are not immutable.`);
    }
  }

  const matchingVoices = manifest.voices.filter(
    (voice) => voice.id === first.narrator.id,
  );
  if (matchingVoices.length !== 1) {
    throw new Error(`Manifest must contain exactly one ${first.narrator.id} narrator.`);
  }
  const currentVoice = matchingVoices[0]!;
  if (
    currentVoice.label !== first.narrator.label ||
    currentVoice.provider !== first.provider ||
    currentVoice.model !== first.model
  ) {
    throw new Error("Delta checkpoint narrator metadata does not match the manifest.");
  }

  const currentById = new Map(
    currentVoice.sections.map((section) => [section.sectionId, section]),
  );
  if (currentById.size !== currentVoice.sections.length) {
    throw new Error("Current manifest contains duplicate narrator sections.");
  }
  for (const sectionId of input.sectionIds) {
    if (!currentById.has(sectionId)) {
      throw new Error(`${sectionId}: current manifest has no section to replace.`);
    }
  }
  assertNonnegativeInteger(
    input.previousRenderedWordCount,
    "Previous selected rendered word count",
  );
  if (input.previousRenderedWordCount > currentVoice.renderedWordCount!) {
    throw new Error("Previous selected word count exceeds the narrator total.");
  }

  const base = publicAudioBase(currentVoice.sections);
  const promotedById = new Map(
    files.map(({ file }) => [file.sectionId, promotedSection(file, base)]),
  );
  const sections = currentVoice.sections.map(
    (section) => promotedById.get(section.sectionId) ?? section,
  );
  const promotedRenderedWordCount = files.reduce(
    (total, { file }) => total + file.exactWordCount + file.interpolatedWordCount,
    0,
  );
  const renderedWordCount =
    currentVoice.renderedWordCount! -
    input.previousRenderedWordCount +
    promotedRenderedWordCount;
  const voice: AudioClipVoice = { ...currentVoice, renderedWordCount, sections };
  const generatedAt = checkpoints.reduce(
    (latest, checkpoint) => checkpoint.remoteVerifiedAt > latest
      ? checkpoint.remoteVerifiedAt
      : latest,
    manifest.generatedAt ?? "",
  );
  return {
    manifest: {
      ...manifest,
      generatedAt,
      voices: manifest.voices.map((candidate) =>
        candidate.id === voice.id ? voice : candidate,
      ),
    },
    version: input.version,
    narratorId: voice.id,
    promotedSectionIds: currentVoice.sections
      .filter((section) => promotedById.has(section.sectionId))
      .map((section) => section.sectionId),
    previousRenderedWordCount: input.previousRenderedWordCount,
    promotedRenderedWordCount,
    renderedWordCount,
  };
}

function parseTimingCounts(
  value: unknown,
  section: AudioClipSection,
  voiceId: string,
): TimingCounts {
  assertObject(value, `${section.sectionId} timing sidecar`);
  assertString(value.sectionId, `${section.sectionId} timing sidecar sectionId`);
  assertString(value.audioVersionId, `${section.sectionId} timing sidecar audioVersionId`);
  assertString(value.voiceId, `${section.sectionId} timing sidecar voiceId`);
  assertNonnegativeInteger(value.exactWordCount, `${section.sectionId} exactWordCount`);
  assertNonnegativeInteger(
    value.interpolatedWordCount,
    `${section.sectionId} interpolatedWordCount`,
  );
  if (
    value.sectionId !== section.sectionId ||
    value.audioVersionId !== section.audioVersionId ||
    value.voiceId !== voiceId
  ) {
    throw new Error(`${section.sectionId}: timing sidecar identity does not match the manifest.`);
  }
  return value as unknown as TimingCounts;
}

export async function readPreviousSectionsRenderedWordCount(input: {
  voice: AudioClipVoice;
  sectionIds: string[];
  fetchImpl?: typeof fetch;
}): Promise<number> {
  const requested = new Set(input.sectionIds);
  const sections = input.voice.sections.filter((section) =>
    requested.has(section.sectionId),
  );
  compareExactSets(input.sectionIds, sections.map((section) => section.sectionId), "Manifest coverage");
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
      return parseTimingCounts(JSON.parse(bytes.toString("utf8")), section, input.voice.id);
    }));
    renderedWordCount += counts.reduce(
      (total, count) => total + count.exactWordCount + count.interpolatedWordCount,
      0,
    );
  }
  return renderedWordCount;
}

function loadVersionCheckpoints(version: string): AudioPublicationCheckpoint[] {
  const versionRoot = path.join(audioPublicationCheckpointsRoot, version);
  if (!fs.existsSync(versionRoot) || !fs.statSync(versionRoot).isDirectory()) {
    throw new Error(`Audio checkpoint version does not exist: ${versionRoot}`);
  }
  return fs.readdirSync(versionRoot).sort().map((fileName) => {
    if (!fileName.endsWith(".json")) {
      throw new Error(`Invalid checkpoint file in ${versionRoot}: ${fileName}`);
    }
    const filePath = path.join(versionRoot, fileName);
    return validateAudioPublicationCheckpoint(
      JSON.parse(fs.readFileSync(filePath, "utf8")),
      filePath,
    );
  });
}

async function main(): Promise<void> {
  const options = parseAudioSectionPromotionOptions(process.argv.slice(2));
  const checkpoints = loadVersionCheckpoints(options.version);
  const manifestValue = JSON.parse(
    fs.readFileSync(audioManifestSourcePath, "utf8"),
  ) as unknown;
  const manifest = validateCurrentAudioManifest(manifestValue);
  const narratorId = checkpoints[0]?.narrator.id;
  const voice = manifest.voices.find((candidate) => candidate.id === narratorId);
  if (!voice) throw new Error(`Current manifest has no ${narratorId} narrator.`);
  const previousRenderedWordCount = await readPreviousSectionsRenderedWordCount({
    voice,
    sectionIds: options.sectionIds,
  });
  const catalog = JSON.parse(
    fs.readFileSync(generatedCatalogPath, "utf8"),
  ) as CompiledCatalog;
  const promotion = planAudioSectionPromotion({
    manifest,
    checkpoints,
    catalog,
    version: options.version,
    sectionIds: options.sectionIds,
    previousRenderedWordCount,
  });
  if (options.write) writeJson(audioManifestSourcePath, promotion.manifest);
  process.stdout.write(
    `${options.write ? "Promoted" : "Validated"} ${promotion.promotedSectionIds.length.toLocaleString()} ` +
    `sections for ${promotion.narratorId}; rendered words ` +
    `${promotion.previousRenderedWordCount.toLocaleString()} -> ` +
    `${promotion.promotedRenderedWordCount.toLocaleString()} for the selection, ` +
    `${promotion.renderedWordCount.toLocaleString()} total.` +
    `${options.write ? "" : " Manifest unchanged; pass --write to promote."}\n`,
  );
}

if (process.argv[1]?.endsWith("promote-audio-sections.ts")) {
  main().catch((error) => {
    process.stderr.write(
      `audio:promote-sections: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  });
}
