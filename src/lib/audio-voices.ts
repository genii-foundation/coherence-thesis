import {
  clipVoicePreferenceId,
  parseClipVoicePreferenceId,
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
}): AudioVoiceMenuGroups {
  const highQuality = input.voices.filter((voice) =>
    Boolean(parseClipVoicePreferenceId(voice.id)),
  );
  const pendingVoiceLabel = input.manifest.voices[0]?.label
    ? `${input.manifest.voices[0].label} (clips pending)`
    : "High Quality 1 (clips pending)";

  return {
    highQuality:
      highQuality.length > 0
        ? highQuality
        : [
            {
              id: clipVoicePreferenceId("default"),
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
