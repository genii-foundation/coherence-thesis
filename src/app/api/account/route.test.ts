import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createAdminSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createAdminSupabaseClient: mocks.createAdminSupabaseClient,
}));

import { DELETE } from "./route";

function request(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost:3000/api/account", {
    method: "DELETE",
    headers,
  });
}

afterEach(() => {
  mocks.createServerSupabaseClient.mockReset();
  mocks.createAdminSupabaseClient.mockReset();
});

describe("account DELETE route", () => {
  it("rejects a cross-origin request with 403", async () => {
    const response = await DELETE(
      request({ origin: "https://evil.example", host: "localhost:3000" }),
    );
    expect(response.status).toBe(403);
    // The trust-boundary check runs before any Supabase client is created.
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("returns 503 when sync is not configured", async () => {
    mocks.createServerSupabaseClient.mockResolvedValue(null);
    mocks.createAdminSupabaseClient.mockReturnValue(null);
    const response = await DELETE(request());
    expect(response.status).toBe(503);
  });

  it("returns 401 when there is no authenticated user", async () => {
    mocks.createServerSupabaseClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    });
    mocks.createAdminSupabaseClient.mockReturnValue({
      auth: { admin: { deleteUser: vi.fn() } },
    });
    const response = await DELETE(request());
    expect(response.status).toBe(401);
  });

  it("returns 500 when the admin delete fails", async () => {
    mocks.createServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }),
        signOut: vi.fn(),
      },
    });
    mocks.createAdminSupabaseClient.mockReturnValue({
      auth: {
        admin: {
          deleteUser: vi.fn().mockResolvedValue({ error: new Error("nope") }),
        },
      },
    });
    const response = await DELETE(request());
    expect(response.status).toBe(500);
  });

  it("deletes the user, signs out, and returns 200 on success", async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    const deleteUser = vi.fn().mockResolvedValue({ error: null });
    mocks.createServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }),
        signOut,
      },
    });
    mocks.createAdminSupabaseClient.mockReturnValue({
      auth: { admin: { deleteUser } },
    });

    const response = await DELETE(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(deleteUser).toHaveBeenCalledWith("u1");
    expect(signOut).toHaveBeenCalled();
  });
});
