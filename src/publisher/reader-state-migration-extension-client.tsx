"use client";

import { useEffect } from "react";
import {
  createPublisherReaderStore,
  type PublisherNextExtensionClientProps,
  type PublisherReaderStoreEnvironment,
} from "@genii-foundation/publisher-next";
import {
  createEmptyReaderBookmarksState,
  createReaderBookmarksStorageKey,
  parseReaderBookmarksState,
  serializeReaderBookmarksState,
} from "@genii-foundation/publisher-reader/bookmarks";
import {
  createEmptyReaderProgressState,
  createReaderProgressStorageKey,
  parseReaderProgressState,
  serializeReaderProgressState,
} from "@genii-foundation/publisher-reader/progress";

import {
  assertCoherenceReaderStateMigrationProjection,
  type CoherenceReaderStateMigrationProjection,
} from "./reader-state-migration-extension-contract";
import { migrateCoherenceReaderState } from "./reader-state-migration";
import {
  MAXIMUM_COHERENCE_STATE_MIGRATION_BYTES,
  parseCoherenceReaderStateMigrationArtifact,
} from "./reader-state-migration-schema";

export const COHERENCE_READER_STATE_MIGRATION_RECEIPT_KEY =
  "coherence.publisher.reader-state-migration.receipt.v1";

export type CoherenceReaderStateMigrationBrowserEnvironment = Readonly<{
  origin: string;
  fetch: typeof fetch;
  crypto: Crypto;
  now: () => number;
  readStorage: (key: string) => string | null;
  writeStorage: (key: string, value: string) => void;
}>;

function defaultEnvironment(): CoherenceReaderStateMigrationBrowserEnvironment {
  return Object.freeze({
    origin: window.location.origin,
    fetch: window.fetch.bind(window),
    crypto: window.crypto,
    now: () => Date.now(),
    readStorage: (key) => window.localStorage.getItem(key),
    writeStorage: (key, value) => window.localStorage.setItem(key, value),
  });
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function readBoundedResponse(response: Response): Promise<Uint8Array> {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^[0-9]+$/u.test(declared) ||
    Number(declared) > MAXIMUM_COHERENCE_STATE_MIGRATION_BYTES)) {
    throw new TypeError("Coherence Reader state migration response is oversized.");
  }
  if (response.body === null) {
    throw new TypeError("Coherence Reader state migration response has no body.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > MAXIMUM_COHERENCE_STATE_MIGRATION_BYTES) {
        throw new TypeError("Coherence Reader state migration response is oversized.");
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function firstLegacyValue(
  keys: readonly string[],
  environment: CoherenceReaderStateMigrationBrowserEnvironment,
): string | null {
  for (const key of keys) {
    const value = environment.readStorage(key);
    if (value !== null) return value;
  }
  return null;
}

export async function migrateCoherenceReaderStateInBrowser(
  projection: CoherenceReaderStateMigrationProjection,
  environment: CoherenceReaderStateMigrationBrowserEnvironment,
): Promise<Readonly<{
  progressWritten: boolean;
  bookmarksWritten: boolean;
  progressAccepted: number;
  progressRefused: number;
  bookmarksAccepted: number;
  bookmarksRefused: number;
}>> {
  assertCoherenceReaderStateMigrationProjection(projection);
  const requested = new URL(projection.artifact.href, environment.origin);
  if (requested.origin !== environment.origin) {
    throw new TypeError("Coherence Reader state migration artifact escaped its origin.");
  }
  const response = await environment.fetch(requested, {
    cache: "no-store",
    credentials: "same-origin",
    redirect: "error",
  });
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]
    ?.trim().toLowerCase();
  if (
    response.status !== 200 || !response.ok || response.redirected ||
    new URL(response.url).href !== requested.href ||
    contentType !== "application/json"
  ) {
    throw new TypeError("Coherence Reader state migration response drifted.");
  }
  const bytes = await readBoundedResponse(response);
  if (bytes.byteLength !== projection.artifact.byteSize) {
    throw new TypeError("Coherence Reader state migration byte size drifted.");
  }
  const digest = new Uint8Array(
    await environment.crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer),
  );
  if (`sha256:${hex(digest)}` !== projection.artifact.sha256) {
    throw new TypeError("Coherence Reader state migration digest drifted.");
  }
  const parsed = parseCoherenceReaderStateMigrationArtifact(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown,
  );
  if (
    parsed === null || parsed.publicationId !== projection.publicationId ||
    parsed.readerBuildId !== projection.artifact.readerBuildId ||
    parsed.buildId !== projection.artifact.buildId
  ) {
    throw new TypeError("Coherence Reader state migration artifact drifted.");
  }
  const now = Math.max(0, Math.trunc(environment.now()));
  const context = { publicationId: projection.publicationId, now };
  const storageEnvironment: PublisherReaderStoreEnvironment = Object.freeze({
    read: environment.readStorage,
    write: environment.writeStorage,
    publish: () => undefined,
    subscribe: () => () => undefined,
  });
  const progressStore = createPublisherReaderStore({
    storageKey: createReaderProgressStorageKey(projection.publicationId),
    parse: (serialized) => parseReaderProgressState(serialized, context),
    serialize: (value) => serializeReaderProgressState(value, context),
    empty: () => createEmptyReaderProgressState(projection.publicationId),
    environment: storageEnvironment,
  });
  const bookmarksStore = createPublisherReaderStore({
    storageKey: createReaderBookmarksStorageKey(projection.publicationId),
    parse: (serialized) => parseReaderBookmarksState(serialized, context),
    serialize: (value) => serializeReaderBookmarksState(value, context),
    empty: () => createEmptyReaderBookmarksState(projection.publicationId),
    environment: storageEnvironment,
  });
  const progressEmpty = Object.keys(progressStore.read().entries).length === 0;
  const bookmarksEmpty = Object.keys(bookmarksStore.read().bookmarks).length === 0;
  const migrated = migrateCoherenceReaderState({
    artifact: parsed,
    legacyProgress: progressEmpty
      ? firstLegacyValue(parsed.legacyProgressStorageKeys, environment)
      : null,
    legacyBookmarks: bookmarksEmpty
      ? firstLegacyValue(parsed.legacyBookmarksStorageKeys, environment)
      : null,
    now,
  });
  const progressWritten = progressEmpty && migrated.report.progressAccepted > 0;
  const bookmarksWritten = bookmarksEmpty && migrated.report.bookmarksAccepted > 0;
  if (progressWritten) progressStore.write(migrated.progress);
  if (bookmarksWritten) bookmarksStore.write(migrated.bookmarks);
  const receipt = Object.freeze({
    ...migrated.report,
    publicationId: projection.publicationId,
    readerBuildId: projection.artifact.readerBuildId,
    artifactBuildId: projection.artifact.buildId,
    progressWritten,
    bookmarksWritten,
  });
  environment.writeStorage(
    COHERENCE_READER_STATE_MIGRATION_RECEIPT_KEY,
    JSON.stringify(receipt),
  );
  return Object.freeze({
    progressWritten,
    bookmarksWritten,
    progressAccepted: migrated.report.progressAccepted,
    progressRefused: migrated.report.progressRefused,
    bookmarksAccepted: migrated.report.bookmarksAccepted,
    bookmarksRefused: migrated.report.bookmarksRefused,
  });
}

const inFlight = new Map<string, Promise<unknown>>();

export function CoherenceReaderStateMigrationClient({
  clientData,
}: PublisherNextExtensionClientProps): null {
  useEffect(() => {
    try {
      assertCoherenceReaderStateMigrationProjection(clientData);
      const key = clientData.artifact.buildId;
      if (!inFlight.has(key)) {
        const promise = migrateCoherenceReaderStateInBrowser(
          clientData,
          defaultEnvironment(),
        ).catch(() => {
          inFlight.delete(key);
        });
        inFlight.set(key, promise);
      }
    } catch {
      return;
    }
  }, [clientData]);
  return null;
}
