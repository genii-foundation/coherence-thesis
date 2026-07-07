import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserSpeechProvider } from "./audio-playback";

// Minimal fakes for the browser speech engine so the provider contract can be
// exercised in the node test environment.
type FakeUtterance = {
  text: string;
  rate: number;
  pitch: number;
  voice: unknown;
  onend: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
};

function installSpeechStub(voices: Array<{ voiceURI: string; name: string }>) {
  const spoken: FakeUtterance[] = [];
  const listeners = new Map<string, Set<() => void>>();
  const engine = {
    paused: false,
    getVoices: () => voices,
    speak: (utterance: FakeUtterance) => spoken.push(utterance),
    cancel: vi.fn(),
    pause: vi.fn(() => {
      engine.paused = true;
    }),
    resume: vi.fn(() => {
      engine.paused = false;
    }),
    addEventListener: (type: string, fn: () => void) => {
      (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(fn);
    },
    removeEventListener: (type: string, fn: () => void) => {
      listeners.get(type)?.delete(fn);
    },
    dispatch: (type: string) => listeners.get(type)?.forEach((fn) => fn()),
  };

  class FakeSpeechSynthesisUtterance {
    text: string;
    rate = 1;
    pitch = 1;
    voice: unknown = null;
    onend: (() => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    constructor(text: string) {
      this.text = text;
    }
  }

  (globalThis as { window?: unknown }).window = { speechSynthesis: engine };
  (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance =
    FakeSpeechSynthesisUtterance;
  return { engine, spoken, listenerCount: () => listeners.get("voiceschanged")?.size ?? 0 };
}

describe("browser speech provider", () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { SpeechSynthesisUtterance?: unknown })
      .SpeechSynthesisUtterance;
  });

  it("reports unsupported and empty voices when the engine is absent", () => {
    const provider = createBrowserSpeechProvider();
    expect(provider.isSupported()).toBe(false);
    expect(provider.getVoices()).toEqual([]);
    expect(provider.isPaused()).toBe(false);
  });

  describe("with a speech engine present", () => {
    let stub: ReturnType<typeof installSpeechStub>;

    beforeEach(() => {
      stub = installSpeechStub([
        { voiceURI: "voice-a", name: "Voice A" },
        { voiceURI: "voice-b", name: "Voice B" },
      ]);
    });

    it("maps engine voices to id/label pairs", () => {
      const provider = createBrowserSpeechProvider();
      expect(provider.isSupported()).toBe(true);
      expect(provider.getVoices()).toEqual([
        { id: "voice-a", label: "Voice A" },
        { id: "voice-b", label: "Voice B" },
      ]);
    });

    it("applies request settings, selects the voice, and wires callbacks", () => {
      const provider = createBrowserSpeechProvider();
      const onEnd = vi.fn();
      const onError = vi.fn();
      provider.speak({
        text: "Title. Body.",
        voiceId: "voice-b",
        rate: 1.2,
        pitch: 0.9,
        onEnd,
        onError,
      });

      // The engine is cancelled before each speak to avoid overlap.
      expect(stub.engine.cancel).toHaveBeenCalledOnce();
      const utterance = stub.spoken[0];
      expect(utterance.text).toBe("Title. Body.");
      expect(utterance.rate).toBe(1.2);
      expect(utterance.pitch).toBe(0.9);
      expect(utterance.voice).toEqual({ voiceURI: "voice-b", name: "Voice B" });

      utterance.onend?.();
      expect(onEnd).toHaveBeenCalledOnce();
      utterance.onerror?.("boom");
      expect(onError).toHaveBeenCalledWith("boom");
    });

    it("leaves the voice null when the saved preference does not match", () => {
      const provider = createBrowserSpeechProvider();
      provider.speak({
        text: "x",
        voiceId: "missing",
        rate: 1,
        pitch: 1,
        onEnd: vi.fn(),
        onError: vi.fn(),
      });
      expect(stub.spoken[0]?.voice).toBeNull();
    });

    it("delegates pause, resume, cancel, and isPaused to the engine", () => {
      const provider = createBrowserSpeechProvider();
      provider.pause();
      expect(stub.engine.pause).toHaveBeenCalledOnce();
      expect(provider.isPaused()).toBe(true);
      provider.resume();
      expect(stub.engine.resume).toHaveBeenCalledOnce();
      expect(provider.isPaused()).toBe(false);
      provider.cancel();
      expect(stub.engine.cancel).toHaveBeenCalledOnce();
    });

    it("subscribes and unsubscribes from voice changes", () => {
      const provider = createBrowserSpeechProvider();
      const listener = vi.fn();
      const unsubscribe = provider.subscribeVoices(listener);
      expect(stub.listenerCount()).toBe(1);
      stub.engine.dispatch("voiceschanged");
      expect(listener).toHaveBeenCalledOnce();
      unsubscribe();
      expect(stub.listenerCount()).toBe(0);
    });
  });
});
