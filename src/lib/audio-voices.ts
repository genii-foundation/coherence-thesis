import {
  clipVoicePreferenceId,
  parseClipVoicePreferenceId,
  type AudioClipSection,
  type AudioClipManifest,
} from "@/lib/audio-manifest";
import type { AudioPlaybackVoice } from "@/lib/audio-playback";

export type AudioVoiceMenuOption = AudioPlaybackVoice & {
  disabled?: boolean;
};

export type AudioVoiceMenuGroups = {
  highQuality: AudioVoiceMenuOption[];
  system: AudioVoiceMenuOption[];
};

export const systemVoiceOption: AudioPlaybackVoice = {
  id: "",
  label: "System voice",
};

export function audioVoiceMenuGroups(input: {
  voices: AudioPlaybackVoice[];
  manifest: AudioClipManifest;
  sections: Array<Pick<AudioClipSection, "sectionId" | "audioVersionId">>;
}): AudioVoiceMenuGroups {
  const declaredHighQuality = input.voices.filter((voice) =>
    Boolean(parseClipVoicePreferenceId(voice.id)),
  );
  const currentVersions = new Set(
    input.sections.map(
      (section) => `${section.sectionId}:${section.audioVersionId}`,
    ),
  );
  const availableVoiceIds = new Set(
    input.manifest.voices
      .filter((voice) =>
        voice.sections.some((section) =>
          currentVersions.has(`${section.sectionId}:${section.audioVersionId}`),
        ),
      )
      .map((voice) => voice.id),
  );
  const highQuality = declaredHighQuality.filter((voice) => {
    const voiceId = parseClipVoicePreferenceId(voice.id);
    return voiceId !== null && availableVoiceIds.has(voiceId);
  });
  const pendingVoiceId =
    declaredHighQuality[0]?.id ??
    clipVoicePreferenceId(input.manifest.voices[0]?.id ?? "default");
  const pendingVoiceLabel = `${
    declaredHighQuality[0]?.label ??
    input.manifest.voices[0]?.label ??
    "High Quality 1"
  } (clips pending)`;

  return {
    highQuality:
      highQuality.length > 0
        ? highQuality
        : [
            {
              id: pendingVoiceId,
              label: pendingVoiceLabel,
              disabled: true,
            },
          ],
    system: [systemVoiceOption],
  };
}

export function selectableVoiceIds(groups: AudioVoiceMenuGroups): Set<string> {
  return new Set(
    [...groups.highQuality, ...groups.system]
      .filter((voice) => !voice.disabled)
      .map((voice) => voice.id),
  );
}
