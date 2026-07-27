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
import { readerBookmarksSchemaVersion } from "./reader-bookmarks";
import {
  deleteReaderAccount,
  deleteRemoteReaderData,
  isReaderSyncConfigured,
  loadRemoteReaderState,
  sendMagicLink,
  uploadRemoteEvents,
  mergeRemoteBookmarks,
  verifyEmailOtp,
} from "./reader-sync";

function makeClient(options: {
  progressRow?: unknown;
  bookmarksRow?: unknown;
  consentRow?: unknown;
  rpcRow?: unknown;
  rpcError?: Error | null;
  upsertError?: Error | null;
}) {
  const {
    progressRow = null,
    bookmarksRow = null,
    consentRow = null,
    rpcRow = null,
    rpcError = null,
    upsertError = null,
  } = options;
  const upserts: Array<{ table: string; rows: unknown }> = [];
  const rpcCalls: Array<{ functionName: string; args: unknown }> = [];
  const rowFor = (table: string) => {
    if (table === "reader_progress") return progressRow;
    if (table === "reader_bookmarks") return bookmarksRow;
    return consentRow;
  };
  const builder = (table: string) => ({
    select: () => builder(table),
    eq: () => builder(table),
    maybeSingle: async () => ({
      data: rowFor(table),
      error: null,
    }),
    upsert: async (rows: unknown) => {
      upserts.push({ table, rows });
      return { error: upsertError };
    },
  });
  const rpc = (functionName: string, args: unknown) => {
    rpcCalls.push({ functionName, args });
    return {
      single: async () => ({
        data: rpcRow,
        error: rpcError,
      }),
    };
  };
  return { client: { from: builder, rpc }, rpcCalls, upserts };
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
      bookmarks: null,
      bookmarksSchemaVersion: null,
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

describe("remote bookmarks", () => {
  beforeEach(() => {
    mocks.createBrowserSupabaseClient.mockReset();
  });

  const bookmark = (overrides: Record<string, unknown> = {}) => ({
    id: "b1",
    progressKey: "cont-1",
    sectionId: "s1",
    paragraphAnchor: "p-h0123456789abcdef",
    paragraphContentHash: "0123456789abcdef",
    quote: "a saved passage",
    quoteOrdinal: 0,
    prefix: "",
    suffix: "",
    startOffset: 0,
    endOffset: 15,
    sectionContentHash: "hash",
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  });

  it("sanitizes the remote bookmarks blob and maps its schema version", async () => {
    const { client } = makeClient({
      bookmarksRow: {
        bookmarks: {
          bookmarks: {
            b1: bookmark(),
            // Structurally invalid, and a key that disagrees with its id.
            junk: { id: "other", quote: 5 },
          },
        },
        schema_version: 1,
      },
    });
    mocks.createBrowserSupabaseClient.mockReturnValue(client);

    const remote = await loadRemoteReaderState("u1");

    expect(Object.keys(remote.bookmarks?.bookmarks ?? {})).toEqual(["b1"]);
    expect(remote.bookmarksSchemaVersion).toBe(1);
  });

  it("reports a null blob and version when the row is absent", async () => {
    const { client } = makeClient({});
    mocks.createBrowserSupabaseClient.mockReturnValue(client);

    const remote = await loadRemoteReaderState("u1");

    expect(remote.bookmarks).toBeNull();
    expect(remote.bookmarksSchemaVersion).toBeNull();
    // The progress path must be unaffected by a missing bookmarks row.
    expect(remote.progress).toBeNull();
  });

  it("atomically merges through the authenticated RPC", async () => {
    const merged = {
      bookmarks: {
        bookmarks: {
          b1: bookmark(),
          b2: bookmark({ id: "b2", quote: "from another device" }),
        },
      },
      schema_version: readerBookmarksSchemaVersion,
    };
    const { client, rpcCalls } = makeClient({ rpcRow: merged });
    mocks.createBrowserSupabaseClient.mockReturnValue(client);

    const result = await mergeRemoteBookmarks({
      bookmarks: { b1: bookmark() as never },
    });

    expect(rpcCalls).toEqual([
      {
        functionName: "merge_reader_bookmarks",
        args: {
          incoming_bookmarks: {
            bookmarks: { b1: bookmark() },
          },
          incoming_schema_version: readerBookmarksSchemaVersion,
        },
      },
    ]);
    expect(result.error).toBeNull();
    expect(Object.keys(result.data?.bookmarks.bookmarks ?? {})).toEqual([
      "b1",
      "b2",
    ]);
    expect(result.data?.schemaVersion).toBe(readerBookmarksSchemaVersion);
  });

  it("surfaces an atomic merge failure without returning stale data", async () => {
    const { client } = makeClient({
      rpcError: new Error("merge failed"),
    });
    mocks.createBrowserSupabaseClient.mockReturnValue(client);

    const result = await mergeRemoteBookmarks({
      bookmarks: { b1: bookmark() as never },
    });

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
  });

  it("deletes the bookmarks row alongside the rest of the reader data", async () => {
    const deletes: string[] = [];
    mocks.createBrowserSupabaseClient.mockReturnValue({
      from: (table: string) => ({
        delete: () => ({
          eq: async () => {
            deletes.push(table);
            return { error: null };
          },
        }),
      }),
    });

    const result = await deleteRemoteReaderData("u1");

    expect(result.error).toBeFalsy();
    expect(deletes).toContain("reader_bookmarks");
    expect(deletes).toContain("reader_progress");
    expect(deletes).toContain("reader_sync_consent");
    expect(deletes).toContain("reader_engagement_events");
  });
});
