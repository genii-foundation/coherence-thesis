"use client";

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
