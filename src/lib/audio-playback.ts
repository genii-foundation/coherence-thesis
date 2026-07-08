// Audio playback provider seam (ARCH-05).
//
// AudioPlayerIsland used to call window.speechSynthesis directly in 17 places,
// welding the UI to the browser TTS engine. This interface is the seam the
// audio-provider research (docs/audio-provider-research.md) calls for: the
// island drives queue orchestration and engagement tracking, while a provider
// owns the actual playback engine. Today the only implementation is the browser
// SpeechSynthesis provider; the recommended precomputed-clip path can ship a
// second implementation of this same interface without touching the island.

export type AudioPlaybackVoice = {
  // Stable identifier used to match a saved preference. For the browser engine
  // this is the SpeechSynthesisVoice.voiceURI; for a clip provider it is the
  // approved-voice id.
  id: string;
  label: string;
};

export type AudioPlaybackRequest = {
  sectionId: string;
  audioVersionId: string;
  text: string;
  voiceId: string | null;
  rate: number;
  pitch: number;
  // The provider invokes exactly one of these per request: onEnd when playback
  // finishes cleanly, onError when the engine fails. The island guards both
  // with its playback token so a stale callback after a route change is
  // ignored.
  onEnd: () => void;
  onError: (error?: unknown) => void;
};

export interface AudioPlaybackProvider {
  readonly id: string;
  isSupported(): boolean;
  getVoices(): AudioPlaybackVoice[];
  // Subscribe to voice-list changes (browser voices load asynchronously).
  // Returns an unsubscribe function.
  subscribeVoices(listener: () => void): () => void;
  speak(request: AudioPlaybackRequest): void;
  pause(): void;
  resume(): void;
  cancel(): void;
  isPaused(): boolean;
}

export function createBrowserSpeechProvider(): AudioPlaybackProvider {
  const synth = (): SpeechSynthesis | null =>
    typeof window !== "undefined" && "speechSynthesis" in window
      ? window.speechSynthesis
      : null;

  return {
    id: "browser-speech",
    isSupported() {
      return synth() !== null;
    },
    getVoices() {
      const engine = synth();
      if (!engine) return [];
      return engine
        .getVoices()
        .map((voice) => ({ id: voice.voiceURI, label: voice.name }));
    },
    subscribeVoices(listener) {
      const engine = synth();
      if (!engine) return () => {};
      engine.addEventListener("voiceschanged", listener);
      return () => engine.removeEventListener("voiceschanged", listener);
    },
    speak({ text, voiceId, rate, pitch, onEnd, onError }) {
      const engine = synth();
      if (!engine) {
        onError(new Error("Speech synthesis is not available."));
        return;
      }
      engine.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.voice =
        engine.getVoices().find((voice) => voice.voiceURI === voiceId) ?? null;
      utterance.onend = () => onEnd();
      utterance.onerror = (event) => onError(event);
      engine.speak(utterance);
    },
    pause() {
      synth()?.pause();
    },
    resume() {
      synth()?.resume();
    },
    cancel() {
      synth()?.cancel();
    },
    isPaused() {
      return synth()?.paused ?? false;
    },
  };
}

async function responseForAudioUrl(url: string): Promise<Response> {
  if ("caches" in globalThis) {
    const cache = await caches.open(offlineAudioCacheName);
    const cached = await cache.match(url);
    if (cached) return cached;
    const response = await fetch(url, { credentials: "same-origin" });
    if (response.ok) await cache.put(url, response.clone());
    return response;
  }
  return fetch(url, { credentials: "same-origin" });
}

export function createHostedClipProvider(
  manifest: AudioClipManifest,
  fallback: AudioPlaybackProvider = createBrowserSpeechProvider(),
): AudioPlaybackProvider {
  let audio: HTMLAudioElement | null = null;
  let objectUrl: string | null = null;
  let playingClip = false;

  const clearAudio = () => {
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    audio = null;
    playingClip = false;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  };

  return {
    id: "hosted-clips",
    isSupported() {
      return (
        (typeof Audio !== "undefined" && manifest.voices.length > 0) ||
        fallback.isSupported()
      );
    },
    getVoices() {
      return [
        ...manifest.voices.map((voice) => ({
          id: clipVoicePreferenceId(voice.id),
          label: voice.label,
        })),
        ...fallback.getVoices(),
      ];
    },
    subscribeVoices(listener) {
      return fallback.subscribeVoices(listener);
    },
    speak(request) {
      const explicitClipVoiceId = parseClipVoicePreferenceId(request.voiceId);
      const clipVoiceId = explicitClipVoiceId ?? firstClipVoiceId(manifest);
      const clip =
        clipVoiceId === null
          ? null
          : findAudioClip(
              manifest,
              clipVoiceId,
              request.sectionId,
              request.audioVersionId,
            );
      if (!clip || typeof Audio === "undefined") {
        fallback.speak(request);
        return;
      }

      fallback.cancel();
      clearAudio();
      playingClip = true;
      responseForAudioUrl(clip.href)
        .then(async (response) => {
          if (!response.ok) throw new Error(`Audio clip failed: ${response.status}`);
          const blob = await response.blob();
          objectUrl = URL.createObjectURL(blob);
          audio = new Audio(objectUrl);
          audio.playbackRate = request.rate;
          audio.onended = () => {
            clearAudio();
            request.onEnd();
          };
          audio.onerror = (event) => {
            clearAudio();
            request.onError(event);
          };
          return audio.play();
        })
        .catch(() => {
          clearAudio();
          fallback.speak(request);
        });
    },
    pause() {
      if (audio && playingClip) {
        audio.pause();
        return;
      }
      fallback.pause();
    },
    resume() {
      if (audio && playingClip) {
        void audio.play();
        return;
      }
      fallback.resume();
    },
    cancel() {
      clearAudio();
      fallback.cancel();
    },
    isPaused() {
      if (audio && playingClip) return audio.paused;
      return fallback.isPaused();
    },
  };
}

// Selects the playback provider for the reader. Today this is always the
// browser engine; when a precomputed audio manifest exists, a clip-backed
// provider can be chosen here without any island change.
export function createDefaultAudioProvider(
  manifest?: AudioClipManifest,
): AudioPlaybackProvider {
  if (manifest?.voices.length) {
    return createHostedClipProvider(manifest);
  }
  return createBrowserSpeechProvider();
}
import {
  clipVoicePreferenceId,
  findAudioClip,
  firstClipVoiceId,
  parseClipVoicePreferenceId,
  type AudioClipManifest,
} from "@/lib/audio-manifest";
import { offlineAudioCacheName } from "@/lib/audio-offline-cache";
