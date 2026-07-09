import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clipVoicePreferenceId } from "./audio-manifest";
import { createBrowserSpeechProvider, createHostedClipProvider } from "./audio-playback";

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
        sectionId: "section-a",
        audioVersionId: "section-a-hash",
        text: "Title. Body.",
        voiceId: "voice-b",
        rate: 1.2,
        pitch: 0.9,
        onEnd,
        onError,
      });

      // The engine is cancelled before each speak to avoid overlap.
      expect(stub.engine.cancel).toHaveBeenCalledOnce();
      const utterance = stub.spoken[0]!;
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
        sectionId: "section-a",
        audioVersionId: "section-a-hash",
        text: "x",
        voiceId: "missing",
        rate: 1,
        pitch: 1,
        onEnd: vi.fn(),
        onError: vi.fn(),
      });
      expect(stub.spoken[0]!.voice).toBeNull();
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

describe("hosted clip provider", () => {
  const originalAudio = globalThis.Audio;
  const originalFetch = globalThis.fetch;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  afterEach(() => {
    if (originalAudio) {
      Object.defineProperty(globalThis, "Audio", {
        configurable: true,
        value: originalAudio,
      });
    } else {
      delete (globalThis as { Audio?: unknown }).Audio;
    }
    if (originalFetch) {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: originalFetch,
      });
    } else {
      delete (globalThis as { fetch?: unknown }).fetch;
    }
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectUrl,
    });
  });

  it("labels the default hosted voice for the voice menu", () => {
    const provider = createHostedClipProvider(
      {
        version: 1,
        voices: [
          {
            id: "default",
            label: "default",
            provider: "fish-audio",
            model: "s2.1-pro-free",
            sections: [],
          },
        ],
      },
      {
        id: "fallback",
        isSupported: () => false,
        getVoices: () => [],
        subscribeVoices: () => () => {},
        speak: () => {},
        pause: () => {},
        resume: () => {},
        cancel: () => {},
        isPaused: () => false,
      },
    );

    expect(provider.getVoices()).toEqual([
      { id: "clip:default", label: "High Quality 1" },
    ]);
  });

  it("starts hosted clips from their direct audio URL", () => {
    const audioInstances: Array<{
      src: string;
      preload: string;
      playbackRate: number;
      play: ReturnType<typeof vi.fn>;
      pause: ReturnType<typeof vi.fn>;
      removeAttribute: ReturnType<typeof vi.fn>;
      load: ReturnType<typeof vi.fn>;
      onended: (() => void) | null;
      onerror: ((event: unknown) => void) | null;
    }> = [];
    class FakeAudio {
      src = "";
      preload = "";
      playbackRate = 1;
      play = vi.fn(() => Promise.resolve());
      pause = vi.fn();
      removeAttribute = vi.fn((name: string) => {
        if (name === "src") this.src = "";
      });
      load = vi.fn();
      onended: (() => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      constructor() {
        audioInstances.push(this);
      }
    }
    Object.defineProperty(globalThis, "Audio", {
      configurable: true,
      value: FakeAudio,
    });
    const fallback = {
      id: "fallback",
      isSupported: () => false,
      getVoices: () => [],
      subscribeVoices: () => () => {},
      speak: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      cancel: vi.fn(),
      isPaused: () => false,
    };
    const provider = createHostedClipProvider(
      {
        version: 1,
        voices: [
          {
            id: "default",
            label: "default",
            provider: "fish-audio",
            model: "s2.1-pro-free",
            sections: [
              {
                sectionId: "section-a",
                audioVersionId: "section-a-hash",
                href: "/audio/fish/section-a.mp3",
              },
            ],
          },
        ],
      },
      fallback,
    );

    provider.speak({
      sectionId: "section-a",
      audioVersionId: "section-a-hash",
      text: "Title. Body.",
      voiceId: clipVoicePreferenceId("default"),
      rate: 1.15,
      pitch: 1,
      onEnd: vi.fn(),
      onError: vi.fn(),
    });

    expect(fallback.cancel).toHaveBeenCalledOnce();
    expect(fallback.speak).not.toHaveBeenCalled();
    expect(audioInstances).toHaveLength(1);
    expect(audioInstances[0]!.src).toBe("/audio/fish/section-a.mp3");
    expect(audioInstances[0]!.preload).toBe("auto");
    expect(audioInstances[0]!.playbackRate).toBe(1.15);
    expect(audioInstances[0]!.play).toHaveBeenCalledOnce();
  });

  it("uses the fallback voice engine for automatic and named system voices", () => {
    const fallback = {
      id: "fallback",
      isSupported: () => true,
      getVoices: () => [{ id: "Samantha", label: "Samantha" }],
      subscribeVoices: () => () => {},
      speak: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      cancel: vi.fn(),
      isPaused: () => false,
    };
    const provider = createHostedClipProvider(
      {
        version: 1,
        voices: [
          {
            id: "default",
            label: "default",
            provider: "fish-audio",
            model: "s2.1-pro-free",
            sections: [
              {
                sectionId: "section-a",
                audioVersionId: "section-a-hash",
                href: "/audio/fish/section-a.mp3",
              },
            ],
          },
        ],
      },
      fallback,
    );
    const baseRequest = {
      sectionId: "section-a",
      audioVersionId: "section-a-hash",
      text: "Title. Body.",
      rate: 1,
      pitch: 1,
      onEnd: vi.fn(),
      onError: vi.fn(),
    };

    provider.speak({ ...baseRequest, voiceId: null });
    provider.speak({ ...baseRequest, voiceId: "Samantha" });

    expect(fallback.speak).toHaveBeenCalledTimes(2);
    expect(fallback.speak).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ voiceId: null }),
    );
    expect(fallback.speak).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ voiceId: "Samantha" }),
    );
  });

  it("retries hosted clips through a blob URL when direct media loading errors", async () => {
    const audioInstances: Array<{
      src: string;
      preload: string;
      playbackRate: number;
      play: ReturnType<typeof vi.fn>;
      pause: ReturnType<typeof vi.fn>;
      removeAttribute: ReturnType<typeof vi.fn>;
      load: ReturnType<typeof vi.fn>;
      onended: (() => void) | null;
      onerror: ((event: unknown) => void) | null;
    }> = [];
    class FakeAudio {
      src = "";
      preload = "";
      playbackRate = 1;
      play = vi.fn(() => Promise.resolve());
      pause = vi.fn();
      removeAttribute = vi.fn((name: string) => {
        if (name === "src") this.src = "";
      });
      load = vi.fn();
      onended: (() => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      constructor() {
        audioInstances.push(this);
      }
    }
    Object.defineProperty(globalThis, "Audio", {
      configurable: true,
      value: FakeAudio,
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: vi.fn(() =>
        Promise.resolve({
          ok: true,
          blob: () =>
            Promise.resolve(new Blob(["audio"], { type: "audio/mpeg" })),
        }),
      ),
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:fish-clip"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    const fallback = {
      id: "fallback",
      isSupported: () => false,
      getVoices: () => [],
      subscribeVoices: () => () => {},
      speak: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      cancel: vi.fn(),
      isPaused: () => false,
    };
    const provider = createHostedClipProvider(
      {
        version: 1,
        voices: [
          {
            id: "default",
            label: "default",
            provider: "fish-audio",
            model: "s2.1-pro-free",
            sections: [
              {
                sectionId: "section-a",
                audioVersionId: "section-a-hash",
                href: "/audio/fish/section-a.mp3",
              },
            ],
          },
        ],
      },
      fallback,
    );

    provider.speak({
      sectionId: "section-a",
      audioVersionId: "section-a-hash",
      text: "Title. Body.",
      voiceId: clipVoicePreferenceId("default"),
      rate: 1.15,
      pitch: 1,
      onEnd: vi.fn(),
      onError: vi.fn(),
    });
    audioInstances[0]!.onerror?.("direct media error");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/audio/fish/section-a.mp3",
      { credentials: "omit" },
    );
    await vi.waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledOnce());
    expect(audioInstances).toHaveLength(2);
    expect(audioInstances[1]!.src).toBe("blob:fish-clip");
    expect(audioInstances[1]!.play).toHaveBeenCalledOnce();
    expect(fallback.speak).not.toHaveBeenCalled();
  });

  it("falls back to browser speech with the full section text when hosted and blob playback fail", async () => {
    const audioInstances: Array<{
      src: string;
      preload: string;
      playbackRate: number;
      play: ReturnType<typeof vi.fn>;
      pause: ReturnType<typeof vi.fn>;
      removeAttribute: ReturnType<typeof vi.fn>;
      load: ReturnType<typeof vi.fn>;
      onended: (() => void) | null;
      onerror: ((event: unknown) => void) | null;
    }> = [];
    class FakeAudio {
      src = "";
      preload = "";
      playbackRate = 1;
      play = vi.fn(() => Promise.resolve());
      pause = vi.fn();
      removeAttribute = vi.fn((name: string) => {
        if (name === "src") this.src = "";
      });
      load = vi.fn();
      onended: (() => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      constructor() {
        audioInstances.push(this);
      }
    }
    Object.defineProperty(globalThis, "Audio", {
      configurable: true,
      value: FakeAudio,
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: vi.fn(() => Promise.reject(new Error("blocked"))),
    });
    const fallback = {
      id: "fallback",
      isSupported: () => true,
      getVoices: () => [],
      subscribeVoices: () => () => {},
      speak: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      cancel: vi.fn(),
      isPaused: () => false,
    };
    const provider = createHostedClipProvider(
      {
        version: 1,
        voices: [
          {
            id: "default",
            label: "default",
            provider: "fish-audio",
            model: "s2.1-pro-free",
            sections: [
              {
                sectionId: "section-a",
                audioVersionId: "section-a-hash",
                href: "/audio/fish/section-a.mp3",
              },
            ],
          },
        ],
      },
      fallback,
    );
    const fullText = "Section A. This is the complete body text, not just the title.";

    provider.speak({
      sectionId: "section-a",
      audioVersionId: "section-a-hash",
      text: fullText,
      voiceId: clipVoicePreferenceId("default"),
      rate: 1,
      pitch: 1,
      onEnd: vi.fn(),
      onError: vi.fn(),
    });
    audioInstances[0]!.onerror?.("direct media error");

    await vi.waitFor(() => expect(fallback.speak).toHaveBeenCalledOnce());
    expect(fallback.speak).toHaveBeenCalledWith(
      expect.objectContaining({ text: fullText }),
    );
  });
});
