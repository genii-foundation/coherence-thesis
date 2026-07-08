import {
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

const preferredNarratorNames = [
  "samantha",
  "daniel",
  "karen",
  "moira",
  "tessa",
  "fiona",
  "serena",
  "kate",
  "oliver",
  "ava",
  "allison",
  "susan",
  "tom",
];

const noveltyVoicePatterns = [
  "albert",
  "bad news",
  "bahh",
  "bells",
  "boing",
  "bubbles",
  "cellos",
  "deranged",
  "good news",
  "hysterical",
  "jester",
  "organ",
  "pipe organ",
  "superstar",
  "trinoids",
  "whisper",
  "zarvox",
];

function narratorScore(voice: AudioPlaybackVoice): number {
  const label = voice.label.toLowerCase();
  if (noveltyVoicePatterns.some((pattern) => label.includes(pattern))) {
    return -1;
  }
  const preferredIndex = preferredNarratorNames.findIndex((name) =>
    label.includes(name),
  );
  if (preferredIndex >= 0) return 1_000 - preferredIndex;
  if (label.includes("premium") || label.includes("enhanced")) return 600;
  if (label.includes("english") || label.includes("united states")) return 500;
  return 100;
}

export function elegantSystemVoices(
  voices: AudioPlaybackVoice[],
  limit = 5,
): AudioPlaybackVoice[] {
  return voices
    .map((voice, index) => ({ voice, index, score: narratorScore(voice) }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map((entry) => entry.voice);
}

export function audioVoiceMenuGroups(input: {
  voices: AudioPlaybackVoice[];
  manifest: AudioClipManifest;
}): AudioVoiceMenuGroups {
  const highQuality = input.voices.filter((voice) =>
    Boolean(parseClipVoicePreferenceId(voice.id)),
  );
  const pendingVoiceLabel = input.manifest.voices[0]?.label
    ? `${input.manifest.voices[0].label} (clips pending)`
    : "Fish Audio Default (clips pending)";
  const system = elegantSystemVoices(
    input.voices.filter((voice) => !parseClipVoicePreferenceId(voice.id)),
  );

  return {
    highQuality:
      highQuality.length > 0
        ? highQuality
        : [
            {
              id: "fish-audio-pending",
              label: pendingVoiceLabel,
              disabled: true,
            },
          ],
    system,
  };
}

export function selectableVoiceIds(groups: AudioVoiceMenuGroups): Set<string> {
  return new Set(
    [...groups.highQuality, ...groups.system]
      .filter((voice) => !voice.disabled)
      .map((voice) => voice.id),
  );
}
