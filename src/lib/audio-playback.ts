// Audio playback provider seam (ARCH-05).
//
// AudioPlayerIsland used to call window.speechSynthesis directly in 17 places,
// welding the UI to the browser TTS engine. This interface is the seam the
// audio-provider research (docs/audio-provider-research.md) calls for: the
// island drives queue orchestration and engagement tracking, while a provider
// owns the actual playback engine. Today the only implementation is the browser
// SpeechSynthesis provider; the recommended precomputed-clip path can ship a
// second implementation of this same interface without touching the island.

import {
  clipVoicePreferenceId,
  findAudioClip,
  parseClipVoicePreferenceId,
  type AudioClipSection,
  type AudioClipManifest,
} from "@/lib/audio-manifest";
import { offlineAudioCacheName } from "@/lib/audio-offline-cache";
import {
  isAudioTimingDocument,
  timingForCharIndex,
  timingForSeconds,
  type AudioTimingDocument,
} from "@/lib/audio-timings";

export type AudioPlaybackVoice = {
  // Stable identifier used to match a saved preference. For the browser engine
  // this is the SpeechSynthesisVoice.voiceURI; for a clip provider it is the
  // approved-voice id.
  id: string;
  label: string;
};

export type AudioPlaybackProgress = {
  sectionId: string;
  audioVersionId: string;
  charIndex?: number;
  seconds?: number;
  durationSeconds?: number;
};

export type AudioPlaybackRequest = {
  sectionId: string;
  audioVersionId: string;
  text: string;
  voiceId: string | null;
  rate: number;
  pitch: number;
  startCharIndex?: number;
  startSeconds?: number;
  // Hosted playback can start from its immutable clip URL during the original
  // user gesture, then resolve the full canonical text for timing validation
  // and browser speech fallback without delaying media startup.
  resolveText?: () => Promise<string>;
  // Playback engagement begins only after the provider confirms that its
  // speech or media engine has actually started.
  onStart?: () => void;
  // The provider invokes exactly one of these per request: onEnd when playback
  // finishes cleanly, onError when the engine fails. The island guards both
  // with its playback token so a stale callback after a route change is
  // ignored.
  onEnd: () => void;
  onError: (error?: unknown) => void;
  onProgress?: (progress: AudioPlaybackProgress) => void;
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
  let requestSequence = 0;
  let resolvingText = false;

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
    speak(request) {
      const sequence = ++requestSequence;
      const speakResolvedText = (text: string) => {
        if (sequence !== requestSequence) return;
        resolvingText = false;
        const engine = synth();
        if (!engine) {
          request.onError(new Error("Speech synthesis is not available."));
          return;
        }
        engine.cancel();
        const startCharIndex = request.startCharIndex ?? 0;
        const safeStartCharIndex = Math.max(
          0,
          Math.min(text.length, startCharIndex),
        );
        const utterance = new SpeechSynthesisUtterance(
          text.slice(safeStartCharIndex),
        );
        utterance.rate = request.rate;
        utterance.pitch = request.pitch;
        utterance.voice =
          engine
            .getVoices()
            .find((voice) => voice.voiceURI === request.voiceId) ?? null;
        utterance.onboundary = (event) => {
          if (event.name !== "word") return;
          request.onProgress?.({
            sectionId: request.sectionId,
            audioVersionId: request.audioVersionId,
            charIndex: safeStartCharIndex + event.charIndex,
          });
        };
        utterance.onstart = () => request.onStart?.();
        utterance.onend = () => request.onEnd();
        utterance.onerror = (event) => request.onError(event);
        engine.speak(utterance);
      };

      if (!request.resolveText) {
        speakResolvedText(request.text);
        return;
      }
      resolvingText = true;
      void request
        .resolveText()
        .then(speakResolvedText)
        .catch((error: unknown) => {
          if (sequence !== requestSequence) return;
          resolvingText = false;
          request.onError(error);
        });
    },
    pause() {
      if (resolvingText) {
        requestSequence += 1;
        resolvingText = false;
        synth()?.cancel();
      } else {
        synth()?.pause();
      }
    },
    resume() {
      synth()?.resume();
    },
    cancel() {
      requestSequence += 1;
      resolvingText = false;
      synth()?.cancel();
    },
    isPaused() {
      return synth()?.paused ?? false;
    },
  };
}

async function responseForAudioUrl(
  url: string,
  signal?: AbortSignal,
): Promise<Response> {
  const requestInit: RequestInit = signal
    ? { credentials: "omit", signal }
    : { credentials: "omit" };
  if (signal?.aborted) throw new Error("Audio request was aborted.");
  if ("caches" in globalThis) {
    const cache = await caches.open(offlineAudioCacheName);
    const cached = await cache.match(url);
    if (signal?.aborted) throw new Error("Audio request was aborted.");
    if (cached) return cached;
    const response = await fetch(url, requestInit);
    if (response.ok && !signal?.aborted) await cache.put(url, response.clone());
    return response;
  }
  return fetch(url, requestInit);
}

const hostedTimingFetchTimeoutMs = 1_500;

type HostedTimingState = {
  document: AudioTimingDocument | null;
};

function hostedVoiceLabel(voice: AudioClipManifest["voices"][number]): string {
  if (voice.provider === "fish-audio" && voice.id === "default") {
    return "High Quality 1";
  }
  return voice.label;
}

export function createHostedClipProvider(
  manifest: AudioClipManifest,
  fallback: AudioPlaybackProvider = createBrowserSpeechProvider(),
): AudioPlaybackProvider {
  let audio: HTMLAudioElement | null = null;
  let objectUrl: string | null = null;
  let playingClip = false;
  let audioHasStarted = false;
  let pendingHostedPlayback = false;
  let requestSequence = 0;
  const timingDocuments = new Map<string, AudioTimingDocument>();
  const pendingNetworkControllers = new Set<AbortController>();

  const abortPendingNetwork = () => {
    for (const controller of pendingNetworkControllers) controller.abort();
    pendingNetworkControllers.clear();
  };

  const clearAudio = () => {
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    audio = null;
    playingClip = false;
    audioHasStarted = false;
    pendingHostedPlayback = false;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  };

  const playAudio = (
    source: string,
    request: AudioPlaybackRequest,
    onFailure: (error?: unknown) => void,
    timingState: HostedTimingState,
    sequence: number,
    managedObjectUrl?: string,
  ) => {
    if (sequence !== requestSequence) return;
    clearAudio();
    objectUrl = managedObjectUrl ?? null;
    const currentAudio = new Audio();
    audio = currentAudio;
    playingClip = true;
    pendingHostedPlayback = true;
    currentAudio.src = source;
    currentAudio.preload = "auto";
    currentAudio.playbackRate = request.rate;
    currentAudio.ontimeupdate = () => {
      const durationSeconds = Number.isFinite(currentAudio.duration)
        ? currentAudio.duration
        : undefined;
      const seconds = currentAudio.currentTime;
      if (audio !== currentAudio || sequence !== requestSequence) return;
      const exactTiming = timingState.document
        ? timingForSeconds(timingState.document, seconds)
        : undefined;
      const charIndex = exactTiming?.charStart ?? (
        durationSeconds && durationSeconds > 0
          ? Math.floor((seconds / durationSeconds) * request.text.length)
          : undefined
      );
      request.onProgress?.({
        sectionId: request.sectionId,
        audioVersionId: request.audioVersionId,
        charIndex,
        seconds,
        durationSeconds,
      });
    };
    currentAudio.onloadedmetadata = () => {
      if (audio !== currentAudio || sequence !== requestSequence) return;
      if (typeof request.startSeconds === "number") {
        currentAudio.currentTime = Math.max(
          0,
          Math.min(currentAudio.duration || request.startSeconds, request.startSeconds),
        );
      } else if (typeof request.startCharIndex === "number" && request.text.length > 0) {
        const exactTiming = timingState.document
          ? timingForCharIndex(timingState.document, request.startCharIndex)
          : undefined;
        if (exactTiming) {
          currentAudio.currentTime = exactTiming.startSeconds;
        } else {
          const durationSeconds = Number.isFinite(currentAudio.duration)
            ? currentAudio.duration
            : 0;
          currentAudio.currentTime =
            durationSeconds * (request.startCharIndex / request.text.length);
        }
      }
    };
    currentAudio.onended = () => {
      if (audio !== currentAudio || sequence !== requestSequence) return;
      clearAudio();
      request.onEnd();
    };
    const fail = (error?: unknown) => {
      if (audio !== currentAudio || sequence !== requestSequence) return;
      clearAudio();
      onFailure(error);
    };
    currentAudio.onerror = fail;
    void currentAudio
      .play()
      .then(() => {
        if (audio !== currentAudio || sequence !== requestSequence) return;
        audioHasStarted = true;
        pendingHostedPlayback = false;
        request.onStart?.();
      })
      .catch(fail);
  };

  const timingMatchesRequest = (
    value: AudioTimingDocument,
    request: AudioPlaybackRequest,
    voiceId: string,
  ): boolean =>
    value.sectionId === request.sectionId &&
    value.audioVersionId === request.audioVersionId &&
    value.voiceId === voiceId &&
    value.textCharacters === request.text.length;

  const loadTimings = (
    clip: AudioClipSection,
    request: AudioPlaybackRequest,
    voiceId: string,
  ): Promise<AudioTimingDocument | null> => {
    if (!clip.timingsHref) return Promise.resolve(null);
    const existing = timingDocuments.get(clip.timingsHref);
    if (existing && timingMatchesRequest(existing, request, voiceId)) {
      return Promise.resolve(existing);
    }

    const controller = new AbortController();
    pendingNetworkControllers.add(controller);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        resolve(null);
      }, hostedTimingFetchTimeoutMs);
    });
    const requestDocument = responseForAudioUrl(
      clip.timingsHref,
      controller.signal,
    )
      .then(async (response) => {
        if (!response.ok) return null;
        const value: unknown = await response.json();
        if (!isAudioTimingDocument(value)) return null;
        if (!timingMatchesRequest(value, request, voiceId)) return null;
        return value;
      })
      .catch(() => null);

    return Promise.race([requestDocument, timeout])
      .then((value) => {
        if (value) timingDocuments.set(clip.timingsHref!, value);
        return value;
      })
      .finally(() => {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        pendingNetworkControllers.delete(controller);
      });
  };

  const playCachedBlob = (
    clip: AudioClipSection,
    request: AudioPlaybackRequest,
    timingState: HostedTimingState,
    sequence: number,
    onFallback: () => void,
  ) => {
    if (sequence !== requestSequence) return;
    pendingHostedPlayback = true;
    const controller = new AbortController();
    pendingNetworkControllers.add(controller);
    responseForAudioUrl(clip.href, controller.signal)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Audio clip failed: ${response.status}`);
        const blob = await response.blob();
        if (sequence !== requestSequence || controller.signal.aborted) return;
        const blobUrl = URL.createObjectURL(blob);
        if (sequence !== requestSequence || controller.signal.aborted) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        playAudio(
          blobUrl,
          request,
          () => {
            clearAudio();
            onFallback();
          },
          timingState,
          sequence,
          blobUrl,
        );
      })
      .catch(() => {
        if (sequence !== requestSequence || controller.signal.aborted) return;
        clearAudio();
        onFallback();
      })
      .finally(() => {
        pendingNetworkControllers.delete(controller);
      });
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
          label: hostedVoiceLabel(voice),
        })),
        ...fallback.getVoices(),
      ];
    },
    subscribeVoices(listener) {
      return fallback.subscribeVoices(listener);
    },
    speak(request) {
      const sequence = ++requestSequence;
      abortPendingNetwork();
      clearAudio();
      fallback.cancel();
      let startReported = false;
      const guardedRequest: AudioPlaybackRequest = {
        ...request,
        onStart: () => {
          if (startReported) return;
          startReported = true;
          request.onStart?.();
        },
      };
      let resolvedRequestPromise: Promise<AudioPlaybackRequest> | null = null;
      const resolveGuardedRequest = (): Promise<AudioPlaybackRequest> => {
        if (!guardedRequest.resolveText) return Promise.resolve(guardedRequest);
        resolvedRequestPromise ??= guardedRequest.resolveText().then((text) => {
          guardedRequest.text = text;
          guardedRequest.resolveText = undefined;
          return guardedRequest;
        });
        return resolvedRequestPromise;
      };
      const fallbackToSpeech = () => {
        void resolveGuardedRequest()
          .then((resolvedRequest) => {
            if (sequence !== requestSequence) return;
            fallback.speak(resolvedRequest);
          })
          .catch((error: unknown) => {
            if (sequence !== requestSequence) return;
            request.onError(error);
          });
      };
      const clipVoiceId = parseClipVoicePreferenceId(request.voiceId);
      const clip =
        clipVoiceId === null
          ? null
          : findAudioClip(
              manifest,
              clipVoiceId,
              request.sectionId,
              request.audioVersionId,
            );
      if (!clipVoiceId || !clip || typeof Audio === "undefined") {
        fallback.speak(guardedRequest);
        return;
      }

      const timingState: HostedTimingState = { document: null };
      const playHostedClip = () => {
        playAudio(
          clip.href,
          guardedRequest,
          () =>
            playCachedBlob(
              clip,
              guardedRequest,
              timingState,
              sequence,
              fallbackToSpeech,
            ),
          timingState,
          sequence,
        );
      };
      if (!clip.timingsHref) {
        playHostedClip();
        return;
      }

      const startsAtBeginning =
        (guardedRequest.startSeconds ?? 0) <= 0 &&
        (guardedRequest.startCharIndex ?? 0) <= 0;
      if (startsAtBeginning) playHostedClip();
      else pendingHostedPlayback = true;

      const timingRequest = guardedRequest.resolveText
        ? resolveGuardedRequest().then((resolvedRequest) =>
            loadTimings(clip, resolvedRequest, clipVoiceId),
          )
        : loadTimings(clip, guardedRequest, clipVoiceId);
      void timingRequest
        .catch(() => null)
        .then((timings) => {
          if (sequence !== requestSequence) return;
          timingState.document = timings;
          if (!startsAtBeginning) playHostedClip();
        });
    },
    pause() {
      if (audio && playingClip && audioHasStarted) {
        abortPendingNetwork();
        audio.pause();
        return;
      }
      if (pendingHostedPlayback || (audio && playingClip)) {
        requestSequence += 1;
        abortPendingNetwork();
        clearAudio();
        fallback.cancel();
        return;
      }
      abortPendingNetwork();
      fallback.pause();
    },
    resume() {
      if (audio && playingClip && audioHasStarted) {
        void audio.play();
        return;
      }
      fallback.resume();
    },
    cancel() {
      requestSequence += 1;
      abortPendingNetwork();
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
