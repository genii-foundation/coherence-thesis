import { describe, expect, it } from "vitest";
import {
  addEngagementEvent,
  createEngagementEvent,
  grantSyncConsent,
  markEventsSynced,
  parseEngagementEvents,
  parseSyncConsent,
  pruneEvents,
  revokeSyncConsent,
  unsyncedEvents,
} from "./reader-engagement";

describe("engagement event pruning", () => {
  // syncedAt uses index + 1 so it is never 0 (which reads as "unsynced").
  const event = (index: number, synced: boolean) =>
    createEngagementEvent("section_opened", {
      clientEventId: `e-${index}`,
      eventAt: index,
      sectionId: "s",
      ...(synced ? { syncedAt: index + 1 } : {}),
    });

  it("keeps the log bounded, dropping the oldest synced events first", () => {
    const events = Array.from({ length: 10 }, (_, i) => event(i, true));
    const pruned = pruneEvents(events, 4);
    expect(pruned.map((entry) => entry.clientEventId)).toEqual([
      "e-6",
      "e-7",
      "e-8",
      "e-9",
    ]);
  });

  it("keeps unsynced events, dropping synced ones to make room", () => {
    const events = [
      ...Array.from({ length: 3 }, (_, i) => event(i, true)),
      ...Array.from({ length: 5 }, (_, i) => event(i + 3, false)),
    ];
    const pruned = pruneEvents(events, 6);
    // All five unsynced survive (they still need uploading); one synced is kept
    // to fill the cap, the older two are dropped.
    expect(unsyncedEvents(pruned)).toHaveLength(5);
    expect(pruned).toHaveLength(6);
  });

  it("still bounds storage when unsynced events alone exceed the cap", () => {
    const events = Array.from({ length: 8 }, (_, i) => event(i, false));
    expect(pruneEvents(events, 4)).toHaveLength(4);
  });

  it("prunes as part of addEngagementEvent", () => {
    let events = Array.from({ length: 2000 }, (_, i) => event(i, true));
    events = addEngagementEvent(events, event(9999, false));
    expect(events.length).toBeLessThanOrEqual(2000);
    expect(events.some((entry) => entry.clientEventId === "e-9999")).toBe(true);
  });
});

describe("reader engagement", () => {
  it("deduplicates events by client id", () => {
    const event = createEngagementEvent("section_opened", {
      clientEventId: "event-1",
      eventAt: 1_700,
      sectionId: "section-a",
    });

    expect(addEngagementEvent(addEngagementEvent([], event), event)).toEqual([event]);
  });

  it("marks uploaded events without removing local history", () => {
    const first = createEngagementEvent("section_opened", {
      clientEventId: "event-1",
      eventAt: 1,
    });
    const second = createEngagementEvent("manual_mark_read", {
      clientEventId: "event-2",
      eventAt: 2,
    });

    const marked = markEventsSynced([first, second], ["event-1"], 3);

    expect(marked[0]!.syncedAt).toBe(3);
    expect(marked[1]!.syncedAt).toBeUndefined();
    expect(unsyncedEvents(marked)).toEqual([second]);
  });

  it("parses malformed event storage as empty", () => {
    expect(parseEngagementEvents("not-json")).toEqual([]);
    expect(parseEngagementEvents(JSON.stringify([{ nope: true }]))).toEqual([]);
  });

  it("tracks consent grant and revocation", () => {
    const granted = grantSyncConsent(1_000);
    const revoked = revokeSyncConsent(granted, 2_000);

    expect(granted.granted).toBe(true);
    expect(revoked).toMatchObject({
      granted: false,
      grantedAt: 1_000,
      revokedAt: 2_000,
    });
    expect(parseSyncConsent(JSON.stringify(revoked))).toMatchObject(revoked);
  });
});
