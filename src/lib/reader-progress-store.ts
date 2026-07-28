"use client";

import {
  addEngagementEvent,
  parseEngagementEvents,
  parseSyncConsent,
  readerEventsStorageKey,
  readerSyncConsentStorageKey,
  serializeEngagementEvents,
  serializeSyncConsent,
  type ReaderEngagementEvent,
  type ReaderSyncConsent,
} from "./reader-engagement";
import {
  emptyBookmarks,
  parseBookmarks,
  readerBookmarksStorageKey,
  readerBookmarksUpdatedEvent,
  serializeBookmarks,
  type ReaderBookmarksState,
} from "./reader-bookmarks";
import {
  captureBookmarkOperationError,
  recordBookmarkOperation,
  type BookmarkOperation,
} from "./bookmark-monitoring";
import { createReaderStore } from "./reader-store";
import {
  emptyProgress,
  parseProgress,
  readerProgressStorageKey,
  readerProgressUpdatedEvent,
  readerProgressV2StorageKey,
  serializeProgress,
  type ReaderProgressState,
} from "./reader-state";

// Single source of truth for reader progress, shared by every island via
// useReaderProgress(). Previously each island kept a private React copy and
// wrote its own stale snapshot back, so concurrent writers (a scroll tick vs an
// audio-seconds update) dropped each other's changes. All reads and writes now
// flow through one in-memory snapshot that is kept in sync with localStorage
// and with other tabs.
//
// The subscription machinery that guarantees this lives in reader-store.ts, so
// bookmarks below get the identical guarantees from the same code rather than a
// second copy of it.
const progressStore = createReaderStore<ReaderProgressState>({
  storageKey: readerProgressV2StorageKey,
  legacyStorageKey: readerProgressStorageKey,
  updatedEvent: readerProgressUpdatedEvent,
  parse: parseProgress,
  serialize: serializeProgress,
  empty: emptyProgress,
});

export function readStoredProgress(): ReaderProgressState {
  return progressStore.read();
}

export function writeStoredProgress(progress: ReaderProgressState): void {
  progressStore.write(progress);
}

// Read the current progress reactively. Returns emptyProgress on the server and
// during hydration, then the persisted value once mounted, with no flash and no
// manual storage-event wiring in the component.
export function useReaderProgress(): ReaderProgressState {
  return progressStore.useValue();
}

// Atomic read-modify-write against the shared snapshot. The updater always sees
// the latest state, so no writer can clobber another's concurrent change.
export function updateStoredProgress(
  updater: (current: ReaderProgressState) => ReaderProgressState,
): ReaderProgressState {
  return progressStore.update(updater);
}

const bookmarksStore = createReaderStore<ReaderBookmarksState>({
  storageKey: readerBookmarksStorageKey,
  updatedEvent: readerBookmarksUpdatedEvent,
  parse: parseBookmarks,
  serialize: serializeBookmarks,
  empty: emptyBookmarks,
});

export function readStoredBookmarks(): ReaderBookmarksState {
  return bookmarksStore.read();
}

export function writeStoredBookmarks(bookmarks: ReaderBookmarksState): void {
  bookmarksStore.write(bookmarks);
}

export function useReaderBookmarks(): ReaderBookmarksState {
  return bookmarksStore.useValue();
}

export function updateStoredBookmarks(
  updater: (current: ReaderBookmarksState) => ReaderBookmarksState,
  operation: BookmarkOperation = "unspecified",
): ReaderBookmarksState {
  let currentAtFailure = emptyBookmarks();
  try {
    const next = bookmarksStore.update((current) => {
      currentAtFailure = current;
      recordBookmarkOperation(operation, "start", current);
      const proposed = updater(current);
      currentAtFailure = proposed;
      return proposed;
    });
    recordBookmarkOperation(operation, "complete", next);
    return next;
  } catch (error) {
    captureBookmarkOperationError(operation, error, currentAtFailure);
    throw error;
  }
}

export function readStoredEvents(): ReaderEngagementEvent[] {
  if (typeof window === "undefined") return [];
  return parseEngagementEvents(window.localStorage.getItem(readerEventsStorageKey));
}

export function writeStoredEvents(events: ReaderEngagementEvent[]): void {
  window.localStorage.setItem(readerEventsStorageKey, serializeEngagementEvents(events));
}

export function appendStoredEvent(event: ReaderEngagementEvent): void {
  writeStoredEvents(addEngagementEvent(readStoredEvents(), event));
}

export function readStoredConsent(): ReaderSyncConsent {
  if (typeof window === "undefined") return parseSyncConsent(null);
  return parseSyncConsent(window.localStorage.getItem(readerSyncConsentStorageKey));
}

export function writeStoredConsent(consent: ReaderSyncConsent): void {
  window.localStorage.setItem(readerSyncConsentStorageKey, serializeSyncConsent(consent));
}
