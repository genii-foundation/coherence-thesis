import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createBrowserSupabaseClient: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("./supabase/browser", () => ({
  createBrowserSupabaseClient: mocks.createBrowserSupabaseClient,
}));

import { sendMagicLink, verifyEmailOtp } from "./reader-sync";

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
