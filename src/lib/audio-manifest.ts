export type AudioClipSection = {
  sectionId: string;
  audioVersionId: string;
  href: string;
  byteSize?: number;
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

export function hasAudioClips(manifest: AudioClipManifest): boolean {
  return manifest.voices.some((voice) => voice.sections.length > 0);
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
