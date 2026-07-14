import type { FishAudioFile, FishRunManifest, FishVoice } from "./fish-generator";

function voicesSignature(voices: FishVoice[]): string {
  return JSON.stringify(
    voices.map(({ id, label, referenceId }) => ({ id, label, referenceId })),
  );
}

function fileKey(file: FishAudioFile): string {
  return `${file.voiceId}:${file.sectionId}`;
}

function stableFileSignature(file: FishAudioFile): string {
  return JSON.stringify({
    sectionId: file.sectionId,
    title: file.title,
    audioVersionId: file.audioVersionId,
    volumeId: file.volumeId,
    voiceId: file.voiceId,
    voiceLabel: file.voiceLabel,
    provider: file.provider,
    model: file.model,
    format: file.format,
    inputBytes: file.inputBytes,
    inputCharacters: file.inputCharacters,
    relativeOutputPath: file.relativeOutputPath,
    timingsRelativeOutputPath: file.timingsRelativeOutputPath,
  });
}

function copyCompletedState(
  desired: FishAudioFile,
  existing: FishAudioFile,
): FishAudioFile {
  const publicCacheKey = existing.publicCacheKey.startsWith(
    `${desired.publicCacheKey}/`,
  )
    ? existing.publicCacheKey
    : desired.publicCacheKey;
  return {
    ...desired,
    publicCacheKey,
    generatedAt: existing.generatedAt,
    durationSeconds: existing.durationSeconds,
    byteSize: existing.byteSize,
    audioSha256: existing.audioSha256,
    timingsByteSize: existing.timingsByteSize,
    timingsSha256: existing.timingsSha256,
    exactWordCount: existing.exactWordCount,
    interpolatedWordCount: existing.interpolatedWordCount,
    timingSource: existing.timingSource,
    providerTimingError: existing.providerTimingError,
    skipped: existing.skipped,
    error: existing.error,
  };
}

export function mergeCompatibleRunManifest(
  existing: FishRunManifest,
  desired: FishRunManifest,
): FishRunManifest {
  if (existing.provider !== desired.provider || existing.endpoint !== desired.endpoint) {
    throw new Error("Existing audio run uses a different provider endpoint.");
  }
  if (existing.runId !== desired.runId || existing.mode !== desired.mode) {
    throw new Error("Existing audio run has a different run id or mode.");
  }
  if (existing.model !== desired.model) {
    throw new Error("Existing audio run uses a different model.");
  }
  if (voicesSignature(existing.voices) !== voicesSignature(desired.voices)) {
    throw new Error("Existing audio run uses a different narrator configuration.");
  }
  if (!existing.settingsHash || existing.settingsHash !== desired.settingsHash) {
    throw new Error(
      "Existing audio run does not match the current generation settings. Use a new run id.",
    );
  }
  if (!existing.catalogHash || existing.catalogHash !== desired.catalogHash) {
    throw new Error(
      "Existing audio run does not match the current manuscript catalog. Use a new run id.",
    );
  }
  if (existing.files.length !== desired.files.length) {
    throw new Error("Existing audio run has an incomplete file inventory.");
  }

  const existingByKey = new Map(existing.files.map((file) => [fileKey(file), file]));
  const files = desired.files.map((file) => {
    const prior = existingByKey.get(fileKey(file));
    if (!prior || stableFileSignature(prior) !== stableFileSignature(file)) {
      throw new Error(
        `Existing audio run file inventory differs at ${file.voiceId}/${file.sectionId}.`,
      );
    }
    return copyCompletedState(file, prior);
  });

  return {
    ...desired,
    generatedAt: existing.generatedAt,
    files,
  };
}

export function selectRunWorkFiles(
  run: FishRunManifest,
  sectionIds: string[],
  limit: number | null,
): FishAudioFile[] {
  const requested = sectionIds.length > 0 ? new Set(sectionIds) : null;
  const selected = requested
    ? run.files.filter((file) => requested.has(file.sectionId))
    : run.files;
  const selectedSectionIds = new Set(selected.map((file) => file.sectionId));
  if (requested) {
    const missing = [...requested].filter((sectionId) => !selectedSectionIds.has(sectionId));
    if (missing.length > 0) {
      throw new Error(`Unknown sectionId '${missing[0]}'.`);
    }
  }
  if (limit === null) return selected;
  const limitedSectionIds = new Set<string>();
  for (const file of selected) {
    if (limitedSectionIds.has(file.sectionId)) continue;
    if (limitedSectionIds.size === limit) break;
    limitedSectionIds.add(file.sectionId);
  }
  return selected.filter((file) => limitedSectionIds.has(file.sectionId));
}
