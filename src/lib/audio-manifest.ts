export type AudioClipSection = {
  sectionId: string;
  audioVersionId: string;
  href: string;
  format?: "mp3" | "opus" | "wav";
  timingsHref?: string;
  byteSize?: number;
  timingsByteSize?: number;
  durationSeconds?: number;
};

export type AudioClipVoice = {
  id: string;
  label: string;
  provider?: string;
  model?: string;
  sections: AudioClipSection[];
};

export type AudioClipManifest = {
  version: 1;
  generatedAt?: string;
  voices: AudioClipVoice[];
};

export type AudioDurationSection = Pick<
  AudioClipSection,
  "sectionId" | "audioVersionId"
>;

export type RecordedAudioDurationSummary = {
  durationSeconds: number;
  sectionCount: number;
  durationSecondsBySection: Map<string, number>;
};

export const emptyAudioClipManifest: AudioClipManifest = {
  version: 1,
  voices: [],
};

const clipVoicePrefix = "clip:";

export function clipVoicePreferenceId(voiceId: string): string {
  return `${clipVoicePrefix}${voiceId}`;
}

export function parseClipVoicePreferenceId(value: string | null): string | null {
  if (!value?.startsWith(clipVoicePrefix)) return null;
  return value.slice(clipVoicePrefix.length) || null;
}

export function firstClipVoiceId(manifest: AudioClipManifest): string | null {
  return manifest.voices[0]?.id ?? null;
}

export function resolveHostedVoicePreference(
  manifest: AudioClipManifest,
  preferenceId: string | null,
): string | null {
  const clipVoiceId = parseClipVoicePreferenceId(preferenceId);
  if (!clipVoiceId) return null;
  if (manifest.voices.length === 0) return preferenceId;
  const selected = manifest.voices.find((voice) => voice.id === clipVoiceId);
  return clipVoicePreferenceId(selected?.id ?? manifest.voices[0]!.id);
}

export function hasAudioClips(manifest: AudioClipManifest): boolean {
  return manifest.voices.some((voice) => voice.sections.length > 0);
}

export function recordedAudioDurationSummary(
  manifest: AudioClipManifest,
  sections: AudioDurationSection[],
  voiceId = firstClipVoiceId(manifest),
): RecordedAudioDurationSummary {
  const voice = voiceId
    ? manifest.voices.find((candidate) => candidate.id === voiceId)
    : undefined;
  const currentVersions = new Map(
    sections.map((section) => [section.sectionId, section.audioVersionId]),
  );
  const durationSecondsBySection = new Map<string, number>();

  for (const clip of voice?.sections ?? []) {
    if (currentVersions.get(clip.sectionId) !== clip.audioVersionId) continue;
    if (
      typeof clip.durationSeconds !== "number" ||
      !Number.isFinite(clip.durationSeconds) ||
      clip.durationSeconds <= 0
    ) {
      continue;
    }
    durationSecondsBySection.set(clip.sectionId, clip.durationSeconds);
  }

  return {
    durationSeconds: [...durationSecondsBySection.values()].reduce(
      (total, durationSeconds) => total + durationSeconds,
      0,
    ),
    sectionCount: durationSecondsBySection.size,
    durationSecondsBySection,
  };
}

export function findAudioClip(
  manifest: AudioClipManifest,
  voiceId: string,
  sectionId: string,
  audioVersionId: string,
): AudioClipSection | null {
  const voice = manifest.voices.find((candidate) => candidate.id === voiceId);
  if (!voice) return null;
  return (
    voice.sections.find(
      (section) =>
        section.sectionId === sectionId &&
        section.audioVersionId === audioVersionId,
    ) ?? null
  );
}
