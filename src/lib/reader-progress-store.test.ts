import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordAudioSeconds, recordScrollProgress } from "./reader-state";

// The store reads window/localStorage lazily inside each call, so a minimal
// stub installed before importing the module is enough to exercise it in the
// node test environment.
function installWindowStub() {
  const storage = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  };
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const windowStub = {
    localStorage,
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(fn);
    },
    removeEventListener: (type: string, fn: (event: unknown) => void) => {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent: (event: { type: string }) => {
      listeners.get(event.type)?.forEach((fn) => fn(event));
      return true;
    },
  };
  (globalThis as { window?: unknown }).window = windowStub;
  return storage;
}

describe("reader progress store", () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    vi.resetModules();
    storage = installWindowStub();
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  const section = { sectionId: "s1", contentHash: "hash-1" };

  it("applies each update against the latest snapshot so concurrent writers do not clobber each other", async () => {
    const { updateStoredProgress, readStoredProgress } = await import(
      "./reader-progress-store"
    );

    // Simulates the old BUG-02: the audio island records seconds while the
    // toolbar island records scroll percent. With private React copies each
    // wrote a stale snapshot back; through the store the second write sees the
    // first's field.
    updateStoredProgress((current) =>
      recordAudioSeconds(current, section, 30),
    );
    updateStoredProgress((current) =>
      recordScrollProgress(current, section, 65),
    );

    const stored = readStoredProgress().sections[section.sectionId];
    expect(stored?.audioSeconds).toBe(30);
    expect(stored?.maxScrollPercent).toBe(65);
    expect(storage.size).toBeGreaterThan(0);
  });

  it("returns the same state and skips persistence when the updater is a no-op", async () => {
    const { updateStoredProgress } = await import("./reader-progress-store");

    const first = updateStoredProgress((current) =>
      recordScrollProgress(current, section, 40),
    );
    // Scrolling to a lower percent yields the same reference from
    // recordScrollProgress, so the store must return it unchanged.
    const second = updateStoredProgress((current) =>
      recordScrollProgress(current, section, 10),
    );

    expect(second).toBe(first);
  });
});
