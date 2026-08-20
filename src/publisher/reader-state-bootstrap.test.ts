import type {
  PublisherNextReaderStateBootstrapContext,
  PublisherNextReaderStateBootstrapReport,
} from "@genii-foundation/publisher-next/server";
import { parseReaderPreferences } from "@genii-foundation/publisher-reader/preferences";
import { describe, expect, it } from "vitest";
import supportedPreferences from "./fixtures/reader-state/preferences-schema-2-supported.json";
import texturedPreferences from "./fixtures/reader-state/preferences-schema-2-textured.json";
import { coherenceReaderStateBootstrap } from "./reader-state-bootstrap";

const legacyPreferencesKey = "coherence-reader-preferences-v1";
const translatedPreferences =
  '{"schemaVersion":1,"fontScale":115,"fontFamilyId":"newsreader","colorScheme":"black","motion":"system","highlights":false,"focus":"strong"}';

const context: PublisherNextReaderStateBootstrapContext = Object.freeze({
  publicationId: "coherence-thesis",
  reportStorageKey:
    "genii.publisher.reader-state-bootstrap.v1.coherence-thesis",
  targetStorageKeys: Object.freeze({
    bookmarks: "genii.publisher.reader.bookmarks.v1.coherence-thesis",
    engagement: "genii.publisher.reader.engagement.v1.coherence-thesis",
    narrationPreferences:
      "genii.publisher.reader.coherence-thesis.narration",
    preferences: "genii.publisher.reader.preferences.v1.coherence-thesis",
    progress: "genii.publisher.reader.progress.v1.coherence-thesis",
    syncConsent:
      "genii.publisher.reader.sync-consent.v1.coherence-thesis",
  }),
});

class MemoryStorage {
  readonly #values: Map<string, string>;

  constructor(entries: readonly (readonly [string, string])[] = []) {
    this.#values = new Map(entries);
  }

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }

  snapshot(): Record<string, string> {
    return Object.fromEntries(this.#values);
  }
}

class FailingMemoryStorage extends MemoryStorage {
  readonly #readKey?: string;
  readonly #writeKey?: string;

  constructor(
    entries: readonly (readonly [string, string])[],
    { readKey, writeKey }: { readKey?: string; writeKey?: string },
  ) {
    super(entries);
    this.#readKey = readKey;
    this.#writeKey = writeKey;
  }

  override getItem(key: string): string | null {
    if (key === this.#readKey) throw new Error("PRIVATE READ FAILURE");
    return super.getItem(key);
  }

  override setItem(key: string, value: string): void {
    if (key === this.#writeKey) throw new Error("PRIVATE WRITE FAILURE");
    super.setItem(key, value);
  }
}

function configuredBootstrap() {
  const configured = coherenceReaderStateBootstrap.implementation.configure(
    coherenceReaderStateBootstrap.config,
  );
  if (!configured.valid) {
    throw new Error(JSON.stringify(configured.diagnostics));
  }
  return configured.value;
}

function sourceFor(
  bootstrapContext: PublisherNextReaderStateBootstrapContext = context,
): string {
  const created = configuredBootstrap().createSource(bootstrapContext);
  if (!created.valid) {
    throw new Error(JSON.stringify(created.diagnostics));
  }
  return created.value;
}

function runBootstrap(storage: MemoryStorage): PublisherNextReaderStateBootstrapReport {
  const execute = new Function(
    "context",
    "projection",
    "localStorage",
    `"use strict";\n${sourceFor()}`,
  ) as (
    bootstrapContext: PublisherNextReaderStateBootstrapContext,
    projection: null,
    localStorage: MemoryStorage,
  ) => PublisherNextReaderStateBootstrapReport;
  return execute(context, null, storage);
}

describe("Coherence Reader state bootstrap", () => {
  it("uses the Publisher API 1.1 adapter shape without a projection", () => {
    expect(coherenceReaderStateBootstrap).toMatchObject({
      package: "coherence-thesis",
      version: "0.1.0",
      rendererCompatibility: ">=0.1.0-alpha.0 <0.2.0",
      config: {},
      implementation: {
        kind: "genii.publisher.next-reader-state-bootstrap",
        apiVersion: "1.1",
      },
    });
    expect(configuredBootstrap()).not.toHaveProperty("createProjection");
  });

  it("returns deterministic source inside Publisher's source boundaries", () => {
    const source = sourceFor();

    expect(sourceFor()).toBe(source);
    expect(new TextEncoder().encode(source).byteLength).toBeLessThanOrEqual(
      32_768,
    );
    expect(source).not.toMatch(/<\/?script|<!--|-->/iu);
    expect(() => new Function("context", "projection", source)).not.toThrow();
    expect(source).not.toContain("coherence-reader-progress");
    expect(source).not.toContain("coherence-reader-bookmarks");
  });

  it("translates only the single proven schema 2 fixture combination exactly", () => {
    const legacyBytes = JSON.stringify(supportedPreferences);
    const untouchedLegacyEntries = {
      [legacyPreferencesKey]: legacyBytes,
      "coherence-reader-progress-v2": '{"private":"progress"}',
      "coherence-reader-bookmarks-v2": '{"private":"bookmarks"}',
    };
    const storage = new MemoryStorage(Object.entries(untouchedLegacyEntries));

    expect(runBootstrap(storage)).toEqual({
      schemaVersion: "1.0",
      copied: ["preferences"],
      refused: [],
    });
    const emittedTarget = storage.getItem(
      context.targetStorageKeys.preferences,
    );
    expect(emittedTarget).toBe(translatedPreferences);
    expect(
      parseReaderPreferences(emittedTarget, {
        fontFamilyIds: ["newsreader"],
      }),
    ).toEqual({
      schemaVersion: 1,
      fontScale: 115,
      fontFamilyId: "newsreader",
      colorScheme: "black",
      motion: "system",
      highlights: false,
      focus: "strong",
    });
    for (const [key, value] of Object.entries(untouchedLegacyEntries)) {
      expect(storage.getItem(key)).toBe(value);
    }
    for (const targetKey of [
      context.targetStorageKeys.bookmarks,
      context.targetStorageKeys.engagement,
      context.targetStorageKeys.narrationPreferences,
      context.targetStorageKeys.progress,
      context.targetStorageKeys.syncConsent,
    ]) {
      expect(storage.getItem(targetKey)).toBeNull();
    }
  });

  it("refuses the unmappable textured theme without writing a target", () => {
    const legacyBytes = JSON.stringify(texturedPreferences);
    const storage = new MemoryStorage([[legacyPreferencesKey, legacyBytes]]);

    expect(runBootstrap(storage)).toEqual({
      schemaVersion: "1.0",
      copied: [],
      refused: ["preferences"],
    });
    expect(storage.getItem(context.targetStorageKeys.preferences)).toBeNull();
    expect(storage.getItem(legacyPreferencesKey)).toBe(legacyBytes);
  });

  it("preserves every nonempty target before inspecting malformed legacy bytes", () => {
    const targetBytes = "{publisher-owned-but-malformed";
    const legacyBytes = "{malformed-legacy";
    const storage = new MemoryStorage([
      [context.targetStorageKeys.preferences, targetBytes],
      [legacyPreferencesKey, legacyBytes],
    ]);
    const before = storage.snapshot();

    expect(runBootstrap(storage)).toEqual({
      schemaVersion: "1.0",
      copied: [],
      refused: [],
    });
    expect(storage.snapshot()).toEqual(before);
  });

  it("replaces an empty target with the exact supported translation", () => {
    const legacyBytes = JSON.stringify(supportedPreferences);
    const storage = new MemoryStorage([
      [context.targetStorageKeys.preferences, ""],
      [legacyPreferencesKey, legacyBytes],
    ]);

    expect(runBootstrap(storage)).toEqual({
      schemaVersion: "1.0",
      copied: ["preferences"],
      refused: [],
    });
    expect(storage.getItem(context.targetStorageKeys.preferences)).toBe(
      translatedPreferences,
    );
    expect(storage.getItem(legacyPreferencesKey)).toBe(legacyBytes);
  });

  it("refuses malformed and otherwise supported valid JSON above the byte limit", () => {
    const supportedBytes = JSON.stringify(supportedPreferences);
    const oversizedValidBytes = `${" ".repeat(16_385)}${supportedBytes}`;
    const multibytePadding = "é".repeat(8_200);
    const oversizedUtf8Bytes = JSON.stringify({
      ...supportedPreferences,
      focus: multibytePadding,
    }).replace(
      ',"schemaVersion":2}',
      ',"focus":"strong","schemaVersion":2}',
    );
    expect(oversizedUtf8Bytes.length).toBeLessThanOrEqual(16_384);
    expect(new TextEncoder().encode(oversizedUtf8Bytes).byteLength).toBeGreaterThan(
      16_384,
    );
    expect(JSON.parse(oversizedUtf8Bytes)).toEqual(supportedPreferences);

    for (const legacyBytes of [
      "{malformed",
      oversizedValidBytes,
      oversizedUtf8Bytes,
    ]) {
      const storage = new MemoryStorage([[legacyPreferencesKey, legacyBytes]]);

      expect(runBootstrap(storage)).toEqual({
        schemaVersion: "1.0",
        copied: [],
        refused: ["preferences"],
      });
      expect(storage.getItem(context.targetStorageKeys.preferences)).toBeNull();
      expect(storage.getItem(legacyPreferencesKey)).toBe(legacyBytes);
    }
  });

  it("refuses valid JSON near misses without exposing private fields", () => {
    const privateSentinel = "PRIVATE PREFERENCES SENTINEL";
    const supportedBytes = JSON.stringify(supportedPreferences);
    const nearMisses = [
      "null",
      "[]",
      JSON.stringify({ ...supportedPreferences, schemaVersion: 1 }),
      JSON.stringify({ ...supportedPreferences, fontSize: 110 }),
      JSON.stringify({ ...supportedPreferences, fontFamily: "literata" }),
      JSON.stringify({ ...supportedPreferences, animations: "none" }),
      JSON.stringify({ ...supportedPreferences, highlights: "on" }),
      JSON.stringify({ ...supportedPreferences, focus: "light" }),
      JSON.stringify({ ...supportedPreferences, private: privateSentinel }),
      supportedBytes.replace("{", `{"__proto__":"${privateSentinel}",`),
    ];

    for (const legacyBytes of nearMisses) {
      const storage = new MemoryStorage([[legacyPreferencesKey, legacyBytes]]);
      const report = runBootstrap(storage);

      expect(report).toEqual({
        schemaVersion: "1.0",
        copied: [],
        refused: ["preferences"],
      });
      expect(JSON.stringify(report)).not.toContain(privateSentinel);
      expect(storage.getItem(context.targetStorageKeys.preferences)).toBeNull();
      expect(storage.getItem(legacyPreferencesKey)).toBe(legacyBytes);
    }
  });

  it("fails closed when target or legacy storage reads throw", () => {
    const legacyBytes = JSON.stringify(supportedPreferences);
    for (const readKey of [
      context.targetStorageKeys.preferences,
      legacyPreferencesKey,
    ]) {
      const storage = new FailingMemoryStorage(
        [[legacyPreferencesKey, legacyBytes]],
        { readKey },
      );

      expect(runBootstrap(storage)).toEqual({
        schemaVersion: "1.0",
        copied: [],
        refused: ["preferences"],
      });
      expect(storage.snapshot()).toEqual({
        [legacyPreferencesKey]: legacyBytes,
      });
    }
  });

  it("fails closed when the Publisher target write throws", () => {
    const legacyBytes = JSON.stringify(supportedPreferences);
    const storage = new FailingMemoryStorage(
      [[legacyPreferencesKey, legacyBytes]],
      { writeKey: context.targetStorageKeys.preferences },
    );

    expect(runBootstrap(storage)).toEqual({
      schemaVersion: "1.0",
      copied: [],
      refused: ["preferences"],
    });
    expect(storage.snapshot()).toEqual({
      [legacyPreferencesKey]: legacyBytes,
    });
  });

  it("is safe to rerun and leaves the first translated bytes unchanged", () => {
    const legacyBytes = JSON.stringify(supportedPreferences);
    const storage = new MemoryStorage([[legacyPreferencesKey, legacyBytes]]);

    expect(runBootstrap(storage).copied).toEqual(["preferences"]);
    const afterFirstRun = storage.snapshot();
    expect(runBootstrap(storage)).toEqual({
      schemaVersion: "1.0",
      copied: [],
      refused: [],
    });
    expect(storage.snapshot()).toEqual(afterFirstRun);
    expect(storage.getItem(legacyPreferencesKey)).toBe(legacyBytes);
  });

  it("does nothing when no legacy preferences exist", () => {
    const storage = new MemoryStorage();

    expect(runBootstrap(storage)).toEqual({
      schemaVersion: "1.0",
      copied: [],
      refused: [],
    });
    expect(storage.snapshot()).toEqual({});
  });
});
