import { describe, expect, it } from "vitest";
import {
  fastE2ePortBase,
  fastE2ePortCount,
  resolveFastE2eAddress,
  resolveFastE2eBaseUrl,
  resolveFastE2ePort,
  resolvePlaywrightServerMode,
} from "./playwright-server-mode";

describe("resolvePlaywrightServerMode", () => {
  it("prefers the prebuilt server", () => {
    expect(
      resolvePlaywrightServerMode({
        PLAYWRIGHT_PREBUILT: "1",
        PLAYWRIGHT_FAST: "1",
      }),
    ).toBe("prebuilt");
  });

  it("selects fast mode when only fast is requested", () => {
    expect(resolvePlaywrightServerMode({ PLAYWRIGHT_FAST: "1" })).toBe("fast");
  });

  it("builds from source by default", () => {
    expect(resolvePlaywrightServerMode({})).toBe("full");
  });
});

describe("resolveFastE2ePort", () => {
  it("stays inside the documented band", () => {
    const roots = [
      "/repo",
      "/repo/.claude/worktrees/one",
      "/repo/.claude/worktrees/two",
      "/somewhere/else/coherence-thesis",
    ];
    for (const root of roots) {
      const port = resolveFastE2ePort(root);
      expect(port).toBeGreaterThanOrEqual(fastE2ePortBase);
      expect(port).toBeLessThan(fastE2ePortBase + fastE2ePortCount);
    }
  });

  it("is stable for one checkout so a running server can be reused", () => {
    expect(resolveFastE2ePort("/repo/.claude/worktrees/one")).toBe(
      resolveFastE2ePort("/repo/.claude/worktrees/one"),
    );
  });

  it("separates worktrees so concurrent suites cannot share a server", () => {
    expect(resolveFastE2ePort("/repo/.claude/worktrees/one")).not.toBe(
      resolveFastE2ePort("/repo/.claude/worktrees/two"),
    );
    expect(resolveFastE2ePort("/repo")).not.toBe(
      resolveFastE2ePort("/repo/.claude/worktrees/one"),
    );
  });

  it("resolves a relative root to the same port as its absolute form", () => {
    expect(resolveFastE2ePort(".")).toBe(resolveFastE2ePort(process.cwd()));
  });
});

describe("resolveFastE2eAddress", () => {
  it("defaults to loopback and the derived port", () => {
    expect(resolveFastE2eAddress({}, "/repo")).toEqual({
      hostname: "127.0.0.1",
      port: resolveFastE2ePort("/repo"),
    });
  });

  it("honors an explicit base URL", () => {
    expect(
      resolveFastE2eAddress(
        { PLAYWRIGHT_BASE_URL: "http://127.0.0.1:4321" },
        "/repo",
      ),
    ).toEqual({ hostname: "127.0.0.1", port: 4321 });
  });

  it("defaults an explicit base URL without a port to 80", () => {
    expect(
      resolveFastE2eAddress({ PLAYWRIGHT_BASE_URL: "http://example.test" }),
    ).toEqual({ hostname: "example.test", port: 80 });
  });

  it("ignores a blank base URL", () => {
    expect(
      resolveFastE2eAddress({ PLAYWRIGHT_BASE_URL: "   " }, "/repo"),
    ).toEqual({ hostname: "127.0.0.1", port: resolveFastE2ePort("/repo") });
  });

  it("rejects a base URL that is not http", () => {
    expect(() =>
      resolveFastE2eAddress({ PLAYWRIGHT_BASE_URL: "https://example.test" }),
    ).toThrow(/must use http/);
  });

  it("builds a base URL matching the resolved address", () => {
    expect(resolveFastE2eBaseUrl({}, "/repo")).toBe(
      `http://127.0.0.1:${resolveFastE2ePort("/repo")}`,
    );
  });
});
