import { describe, expect, it } from "vitest";
import {
  addEngagementEvent,
  createEngagementEvent,
  grantSyncConsent,
  markEventsSynced,
  parseEngagementEvents,
  parseSyncConsent,
  revokeSyncConsent,
  unsyncedEvents,
} from "./reader-engagement";

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

    expect(marked[0].syncedAt).toBe(3);
    expect(marked[1].syncedAt).toBeUndefined();
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
