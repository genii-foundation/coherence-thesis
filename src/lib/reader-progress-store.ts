"use client";

import { useSyncExternalStore } from "react";
import {
  addEngagementEvent,
  grantSyncConsent,
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
  emptyProgress,
  parseProgress,
  readerProgressStorageKey,
  readerProgressUpdatedEvent,
  readerProgressV2StorageKey,
  serializeProgress,
  type ReaderProgressState,
} from "./reader-state";

export function readStoredProgress(): ReaderProgressState {
  if (typeof window === "undefined") return emptyProgress();
  const v2 = window.localStorage.getItem(readerProgressV2StorageKey);
  if (v2) return parseProgress(v2);
  return parseProgress(window.localStorage.getItem(readerProgressStorageKey));
}

export function writeStoredProgress(progress: ReaderProgressState): void {
  window.localStorage.setItem(readerProgressV2StorageKey, serializeProgress(progress));
  window.dispatchEvent(new Event(readerProgressUpdatedEvent));
}

// Single source of truth for reader progress, shared by every island via
// useReaderProgress(). Previously each island kept a private React copy and
// wrote its own stale snapshot back, so concurrent writers (a scroll tick vs an
// audio-seconds update) dropped each other's changes. All reads and writes now
// flow through one in-memory snapshot that is kept in sync with localStorage
// and with other tabs.
let cachedProgress: ReaderProgressState | null = null;
let writingInternally = false;
const progressListeners = new Set<() => void>();
const serverProgressSnapshot = emptyProgress();

function progressSnapshot(): ReaderProgressState {
  if (cachedProgress === null) cachedProgress = readStoredProgress();
  return cachedProgress;
}

function handleProgressStorageChange(event?: Event): void {
  // A same-tab write already updated the cache and notified listeners; ignore
  // the event it dispatched.
  if (writingInternally) return;
  if (
    event instanceof StorageEvent &&
    event.key &&
    event.key !== readerProgressV2StorageKey &&
    event.key !== readerProgressStorageKey
  ) {
    return;
  }
  cachedProgress = readStoredProgress();
  progressListeners.forEach((listener) => listener());
}

function subscribeProgress(listener: () => void): () => void {
  if (progressListeners.size === 0 && typeof window !== "undefined") {
    window.addEventListener("storage", handleProgressStorageChange);
    window.addEventListener(readerProgressUpdatedEvent, handleProgressStorageChange);
  }
  progressListeners.add(listener);
  return () => {
    progressListeners.delete(listener);
    if (progressListeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", handleProgressStorageChange);
      window.removeEventListener(
        readerProgressUpdatedEvent,
        handleProgressStorageChange,
      );
    }
  };
}

function getServerProgress(): ReaderProgressState {
  return serverProgressSnapshot;
}

// Read the current progress reactively. Returns emptyProgress on the server and
// during hydration, then the persisted value once mounted, with no flash and no
// manual storage-event wiring in the component.
export function useReaderProgress(): ReaderProgressState {
  return useSyncExternalStore(
    subscribeProgress,
    progressSnapshot,
    getServerProgress,
  );
}

// Atomic read-modify-write against the shared snapshot. The updater always sees
// the latest state, so no writer can clobber another's concurrent change.
export function updateStoredProgress(
  updater: (current: ReaderProgressState) => ReaderProgressState,
): ReaderProgressState {
  const current = progressSnapshot();
  const next = updater(current);
  if (next === current) return current;
  cachedProgress = next;
  writingInternally = true;
  try {
    writeStoredProgress(next);
  } finally {
    writingInternally = false;
  }
  progressListeners.forEach((listener) => listener());
  return next;
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

export function grantStoredConsent(now = Date.now()): ReaderSyncConsent {
  const consent = grantSyncConsent(now);
  writeStoredConsent(consent);
  return consent;
}
