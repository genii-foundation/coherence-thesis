import type { ReaderNavigationSource } from "./reader-state";

export const readerEventsStorageKey = "coherence-reader-events-v1";
export const readerSyncConsentStorageKey = "coherence-reader-sync-consent-v1";
export const readerSyncConsentVersion = 1;
export const readerSyncConsentCopyVersion = "reader-sync-consent-2026-06-30";

export type ReaderEngagementEventType =
  | "section_opened"
  | "section_visibility_ended"
  | "scroll_milestone"
  | "read_threshold_crossed"
  | "manual_mark_read"
  | "section_returned"
  | "navigation_source_used"
  | "search_submitted"
  | "search_result_clicked"
  | "recommendation_shown"
  | "recommendation_clicked"
  | "updated_notice_shown"
  | "updated_notice_clicked"
  | "audio_started"
  | "audio_paused"
  | "audio_resumed"
  | "audio_completed"
  | "audio_seconds_listened";

export type ReaderEngagementPayload = Record<
  string,
  string | number | boolean | null
>;

export type ReaderEngagementEvent = {
  clientEventId: string;
  eventType: ReaderEngagementEventType;
  eventAt: number;
  sectionId?: string;
  contentHash?: string;
  route?: string;
  payload?: ReaderEngagementPayload;
  syncedAt?: number;
};

export type ReaderSyncConsent = {
  version: number;
  copyVersion: string;
  granted: boolean;
  grantedAt?: number;
  revokedAt?: number;
};

export function emptySyncConsent(): ReaderSyncConsent {
  return {
    version: readerSyncConsentVersion,
    copyVersion: readerSyncConsentCopyVersion,
    granted: false,
  };
}

export function parseSyncConsent(raw: string | null): ReaderSyncConsent {
  if (!raw) return emptySyncConsent();
  try {
    const parsed = JSON.parse(raw) as Partial<ReaderSyncConsent>;
    return {
      version:
        typeof parsed.version === "number"
          ? parsed.version
          : readerSyncConsentVersion,
      copyVersion:
        typeof parsed.copyVersion === "string"
          ? parsed.copyVersion
          : readerSyncConsentCopyVersion,
      granted: parsed.granted === true,
      grantedAt: typeof parsed.grantedAt === "number" ? parsed.grantedAt : undefined,
      revokedAt: typeof parsed.revokedAt === "number" ? parsed.revokedAt : undefined,
    };
  } catch {
    return emptySyncConsent();
  }
}

export function grantSyncConsent(now = Date.now()): ReaderSyncConsent {
  return {
    version: readerSyncConsentVersion,
    copyVersion: readerSyncConsentCopyVersion,
    granted: true,
    grantedAt: now,
  };
}

export function revokeSyncConsent(
  consent: ReaderSyncConsent,
  now = Date.now(),
): ReaderSyncConsent {
  return {
    ...consent,
    granted: false,
    revokedAt: now,
  };
}

export function serializeSyncConsent(consent: ReaderSyncConsent): string {
  return JSON.stringify(consent);
}

export function parseEngagementEvents(raw: string | null): ReaderEngagementEvent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isReaderEngagementEvent);
  } catch {
    return [];
  }
}

export function serializeEngagementEvents(events: ReaderEngagementEvent[]): string {
  return JSON.stringify(events);
}

export function createEngagementEvent(
  eventType: ReaderEngagementEventType,
  details: Omit<ReaderEngagementEvent, "clientEventId" | "eventType" | "eventAt"> & {
    eventAt?: number;
    clientEventId?: string;
  } = {},
): ReaderEngagementEvent {
  const eventAt = details.eventAt ?? Date.now();
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return {
    clientEventId: details.clientEventId ?? `${eventAt}-${randomPart}`,
    eventType,
    eventAt,
    sectionId: details.sectionId,
    contentHash: details.contentHash,
    route: details.route,
    payload: details.payload,
    syncedAt: details.syncedAt,
  };
}

// Upper bound on locally stored engagement events. The server already caps rows
// per user (migration), but the browser log grew unbounded, so a long-lived
// reader could bloat localStorage and eventually hit the quota. Synced events
// are pruned first; unsynced events are retained (they still need uploading)
// until they too exceed the cap.
export const maxStoredEvents = 2000;

export function pruneEvents(
  events: ReaderEngagementEvent[],
  cap = maxStoredEvents,
): ReaderEngagementEvent[] {
  if (events.length <= cap) return events;
  const unsynced = events.filter((event) => !event.syncedAt);
  if (unsynced.length >= cap) {
    return unsynced.slice(-cap);
  }
  const synced = events.filter((event) => event.syncedAt);
  const keptSynced = synced.slice(-(cap - unsynced.length));
  return [...keptSynced, ...unsynced].sort((a, b) => a.eventAt - b.eventAt);
}

export function addEngagementEvent(
  events: ReaderEngagementEvent[],
  event: ReaderEngagementEvent,
): ReaderEngagementEvent[] {
  if (events.some((candidate) => candidate.clientEventId === event.clientEventId)) {
    return events;
  }
  return pruneEvents([...events, event]);
}

export function markEventsSynced(
  events: ReaderEngagementEvent[],
  clientEventIds: string[],
  syncedAt = Date.now(),
): ReaderEngagementEvent[] {
  const ids = new Set(clientEventIds);
  return events.map((event) =>
    ids.has(event.clientEventId) ? { ...event, syncedAt } : event,
  );
}

export function unsyncedEvents(
  events: ReaderEngagementEvent[],
): ReaderEngagementEvent[] {
  return events.filter((event) => !event.syncedAt);
}

export function navigationSourcePayload(
  source: ReaderNavigationSource,
): ReaderEngagementPayload {
  return { source };
}

function isReaderEngagementEvent(value: unknown): value is ReaderEngagementEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Partial<ReaderEngagementEvent>;
  return (
    typeof event.clientEventId === "string" &&
    typeof event.eventType === "string" &&
    typeof event.eventAt === "number"
  );
}
