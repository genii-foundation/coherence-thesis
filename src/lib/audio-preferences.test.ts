import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function installWindowStub() {
  const storage = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
  };
  (globalThis as { window?: unknown }).window = { localStorage };
  return storage;
}

describe("audio preferences", () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    vi.resetModules();
    storage = installWindowStub();
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("defaults new listeners to the hosted high quality voice", async () => {
    const { readVoicePreference } = await import("./audio-preferences");

    expect(readVoicePreference()).toMatchObject({
      voiceURI: "clip:default",
      rate: 1,
      pitch: 1,
    });
  });

  it("migrates the old automatic default to the hosted high quality voice", async () => {
    storage.set(
      "coherence-audio-voice-v1",
      JSON.stringify({ voiceURI: null, rate: 1.15, pitch: 1 }),
    );
    const { readVoicePreference } = await import("./audio-preferences");

    expect(readVoicePreference()).toMatchObject({
      voiceURI: "clip:default",
      rate: 1.15,
      pitch: 1,
    });
  });

  it("migrates the transitional automatic default to the hosted high quality voice", async () => {
    storage.set(
      "coherence-audio-voice-v2",
      JSON.stringify({ voiceURI: null, rate: 1.05, pitch: 1 }),
    );
    const { readVoicePreference } = await import("./audio-preferences");

    expect(readVoicePreference()).toMatchObject({
      voiceURI: "clip:default",
      rate: 1.05,
      pitch: 1,
    });
  });

  it("migrates an unmarked current automatic default to the hosted high quality voice", async () => {
    storage.set(
      "coherence-audio-voice-v3",
      JSON.stringify({ voiceURI: null, rate: 0.9, pitch: 1 }),
    );
    const { readVoicePreference } = await import("./audio-preferences");

    expect(readVoicePreference()).toMatchObject({
      voiceURI: "clip:default",
      rate: 0.9,
      pitch: 1,
    });
  });

  it("preserves a marked automatic system voice choice", async () => {
    storage.set(
      "coherence-audio-voice-v3",
      JSON.stringify({
        voiceURI: null,
        rate: 0.9,
        pitch: 1,
        useSystemVoice: true,
      }),
    );
    const { readVoicePreference } = await import("./audio-preferences");

    expect(readVoicePreference()).toMatchObject({
      voiceURI: null,
      rate: 0.9,
      pitch: 1,
      useSystemVoice: true,
    });
  });
});
