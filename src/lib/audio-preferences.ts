"use client";

import { defaultVoicePreference, type AudioVoicePreference } from "./audio-queue";

// Persistence for the audiobook voice/rate/pitch preference, kept out of the
// component so the storage key and parse guards live in one place (DUP-11),
// alongside the other reader preference modules.
export const audioVoiceStorageKey = "coherence-audio-voice-v1";

export function readVoicePreference(): AudioVoicePreference {
  if (typeof window === "undefined") return defaultVoicePreference;
  try {
    return {
      ...defaultVoicePreference,
      ...JSON.parse(window.localStorage.getItem(audioVoiceStorageKey) ?? "{}"),
    };
  } catch {
    return defaultVoicePreference;
  }
}

export function writeVoicePreference(preference: AudioVoicePreference): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(audioVoiceStorageKey, JSON.stringify(preference));
}
