import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createBrowserSupabaseClient: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("./supabase/browser", () => ({
  createBrowserSupabaseClient: mocks.createBrowserSupabaseClient,
}));

import { createEngagementEvent } from "./reader-engagement";
import {
  deleteReaderAccount,
  isReaderSyncConfigured,
  loadRemoteReaderState,
  sendMagicLink,
  uploadRemoteEvents,
  verifyEmailOtp,
} from "./reader-sync";

function makeClient(options: {
  progressRow?: unknown;
  consentRow?: unknown;
  upsertError?: Error | null;
}) {
  const { progressRow = null, consentRow = null, upsertError = null } = options;
  const upserts: Array<{ table: string; rows: unknown }> = [];
  const builder = (table: string) => ({
    select: () => builder(table),
    eq: () => builder(table),
    maybeSingle: async () => ({
      data: table === "reader_progress" ? progressRow : consentRow,
      error: null,
    }),
    upsert: async (rows: unknown) => {
      upserts.push({ table, rows });
      return { error: upsertError };
    },
  });
  return { client: { from: builder }, upserts };
}

describe("reader sync auth", () => {
  beforeEach(() => {
    mocks.createBrowserSupabaseClient.mockReturnValue({
      auth: {
        signInWithOtp: mocks.signInWithOtp,
        verifyOtp: mocks.verifyOtp,
      },
    });
    mocks.signInWithOtp.mockReset();
    mocks.verifyOtp.mockReset();
  });

  it("starts email sign in with the supplied callback URL", async () => {
    mocks.signInWithOtp.mockResolvedValue({ error: null });

    await sendMagicLink(
      "reader@example.com",
      "https://www.coherence-thesis.com/auth/callback?next=%2F",
    );

    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: "reader@example.com",
      options: {
        emailRedirectTo: "https://www.coherence-thesis.com/auth/callback?next=%2F",
      },
    });
  });

  it("verifies a one-time email code", async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: { user: { id: "user-1", email: "reader@example.com" } },
      error: null,
    });

    await verifyEmailOtp("reader@example.com", "12345678");

    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      email: "reader@example.com",
      token: "12345678",
      type: "email",
    });
  });

  it("returns a configuration error when Supabase is unavailable", async () => {
    mocks.createBrowserSupabaseClient.mockReturnValue(null);

    const result = await verifyEmailOtp("reader@example.com", "12345678");

    expect(result.error).toBeInstanceOf(Error);
  });
});

describe("reader sync orchestration", () => {
  beforeEach(() => {
    mocks.createBrowserSupabaseClient.mockReset();
  });

  it("reports whether sync is configured", () => {
    mocks.createBrowserSupabaseClient.mockReturnValue(null);
    expect(isReaderSyncConfigured()).toBe(false);
    mocks.createBrowserSupabaseClient.mockReturnValue({});
    expect(isReaderSyncConfigured()).toBe(true);
  });

  it("returns empty remote state when sync is not configured", async () => {
    mocks.createBrowserSupabaseClient.mockReturnValue(null);
    expect(await loadRemoteReaderState("u1")).toEqual({
      progress: null,
      progressSchemaVersion: null,
      consent: null,
    });
  });

  it("sanitizes remote progress and maps schema version and consent", async () => {
    const { client } = makeClient({
      progressRow: {
        progress: {
          sections: {
            s1: { sectionId: "s1", contentHash: "h", readAt: 5, percent: 80 },
            bad: { sectionId: "bad" },
          },
        },
        schema_version: 2,
      },
      consentRow: {
        consent_version: 1,
        copy_version: "cv-1",
        granted: true,
        granted_at: "2026-01-01T00:00:00.000Z",
        revoked_at: null,
      },
    });
    mocks.createBrowserSupabaseClient.mockReturnValue(client);

    const state = await loadRemoteReaderState("u1");
    expect(Object.keys(state.progress?.sections ?? {})).toEqual(["s1"]);
    expect(state.progressSchemaVersion).toBe(2);
    expect(state.consent).toMatchObject({
      version: 1,
      copyVersion: "cv-1",
      granted: true,
      grantedAt: Date.parse("2026-01-01T00:00:00.000Z"),
    });
  });

  it("no-ops uploadRemoteEvents for an empty batch", async () => {
    mocks.createBrowserSupabaseClient.mockReturnValue(makeClient({}).client);
    expect(await uploadRemoteEvents("u1", [])).toEqual({
      error: null,
      uploadedIds: [],
    });
  });

  it("maps events to rows and returns their ids on success", async () => {
    const { client, upserts } = makeClient({});
    mocks.createBrowserSupabaseClient.mockReturnValue(client);
    const event = createEngagementEvent("section_opened", {
      clientEventId: "e1",
      eventAt: 1000,
      sectionId: "s1",
      contentHash: "h",
      route: "/r",
      payload: { source: "direct" },
    });

    const result = await uploadRemoteEvents("u1", [event]);
    expect(result.uploadedIds).toEqual(["e1"]);
    expect(upserts[0]?.table).toBe("reader_engagement_events");
    expect((upserts[0]?.rows as Array<Record<string, unknown>>)[0]).toMatchObject({
      user_id: "u1",
      client_event_id: "e1",
      event_at: new Date(1000).toISOString(),
      route: "/r",
      payload: { source: "direct" },
    });
  });

  it("returns no uploaded ids when the write errors", async () => {
    const { client } = makeClient({ upsertError: new Error("boom") });
    mocks.createBrowserSupabaseClient.mockReturnValue(client);
    const event = createEngagementEvent("section_opened", { clientEventId: "e1" });
    const result = await uploadRemoteEvents("u1", [event]);
    expect(result.uploadedIds).toEqual([]);
    expect(result.error).toBeInstanceOf(Error);
  });
});

describe("deleteReaderAccount", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("resolves without error when the endpoint succeeds", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: true } as Response);
    expect(await deleteReaderAccount()).toEqual({ error: null });
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/account", {
      method: "DELETE",
    });
  });

  it("reports an error when the endpoint fails", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: false } as Response);
    const result = await deleteReaderAccount();
    expect(result.error).toBeInstanceOf(Error);
  });
});
