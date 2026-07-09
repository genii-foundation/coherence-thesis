"use client";

import { defaultVoicePreference, type AudioVoicePreference } from "./audio-queue";

// Persistence for the audiobook voice/rate/pitch preference, kept out of the
// component so the storage key and parse guards live in one place (DUP-11),
// alongside the other reader preference modules.
export const legacyAudioVoiceStorageKeys = [
  "coherence-audio-voice-v2",
  "coherence-audio-voice-v1",
] as const;
export const audioVoiceStorageKey = "coherence-audio-voice-v3";

function parseVoicePreference(value: string | null): Partial<AudioVoicePreference> {
  if (!value) return {};
  const parsed = JSON.parse(value) as Partial<AudioVoicePreference>;
  return parsed && typeof parsed === "object" ? parsed : {};
}

function withDefaultVoice(
  preference: Partial<AudioVoicePreference>,
): AudioVoicePreference {
  const voiceURI =
    preference.voiceURI === null
      ? preference.useSystemVoice === true
        ? null
        : defaultVoicePreference.voiceURI
      : (preference.voiceURI ?? defaultVoicePreference.voiceURI);
  return {
    ...defaultVoicePreference,
    ...preference,
    voiceURI,
  };
}

export function readVoicePreference(): AudioVoicePreference {
  if (typeof window === "undefined") return defaultVoicePreference;
  try {
    const current = window.localStorage.getItem(audioVoiceStorageKey);
    if (current) {
      return withDefaultVoice(parseVoicePreference(current));
    }
    const legacy = legacyAudioVoiceStorageKeys
      .map((key) => parseVoicePreference(window.localStorage.getItem(key)))
      .find((preference) => Object.keys(preference).length > 0);
    return withDefaultVoice(legacy ?? {});
  } catch {
    return defaultVoicePreference;
  }
}

export function writeVoicePreference(preference: AudioVoicePreference): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(audioVoiceStorageKey, JSON.stringify(preference));
}
