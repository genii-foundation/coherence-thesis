import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resolvePlaywrightServerMode } from "../dev/playwright-server-mode";
import {
  createNpmScriptRunner,
  resolveRuntimeNpmExecPath,
  runBuiltE2E,
  runStaticValidation,
  runValidation,
} from "./run-validation.mjs";
import {
  resolveProductionPreviewAddress,
  startProductionPreview,
} from "../dev/production-preview.mjs";

describe("validation orchestration", () => {
  it("prefers npm bundled with the active Node runtime over a stale launcher", () => {
    const bundledNpm = "/test/node/lib/node_modules/npm/bin/npm-cli.js";
    expect(
      resolveRuntimeNpmExecPath({
        environment: { npm_execpath: "/stale/npm-cli.js" },
        execPath: "/test/node/bin/node",
        pathExists: (candidate) => candidate === bundledNpm,
      }),
    ).toBe(bundledNpm);
  });

  it("invokes npm through Node and can suppress lifecycle hooks", () => {
    const run = vi.fn(() => ({ status: 0 }));
    const runScript = createNpmScriptRunner({
      npmExecPath: "/test/npm-cli.js",
      run,
    });

    runScript("lint", {
      environment: { VALIDATION_TEST_FLAG: "set" },
      ignoreLifecycle: true,
    });

    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0][0]).toBe(process.execPath);
    expect(run.mock.calls[0][1]).toEqual([
      "/test/npm-cli.js",
      "run",
      "--ignore-scripts",
      "lint",
    ]);
    expect(run.mock.calls[0][2]).toMatchObject({
      env: { VALIDATION_TEST_FLAG: "set" },
      stdio: "inherit",
    });
  });

  it("prepares once before running every final gate without lifecycle hooks", () => {
    const calls = [];
    runStaticValidation((scriptName, options = {}) => {
      calls.push([scriptName, options.ignoreLifecycle ?? false]);
    });

    expect(calls).toEqual([
      ["manuscripts:prepare", false],
      ["editorial:debt", true],
      ["editorial:validate", true],
      ["editorial:checkpoints", true],
      ["editorial:protected-lines", true],
      ["editorial:voice-exemplars", true],
      ["editorial:semantic-links:validate", true],
      ["manuscripts:validate", true],
      ["audio:checkpoints", true],
      ["audio:verify-manuscript-publication", true],
      ["repository:validate-evidence-immutability", true],
      ["repository:validate-layout", true],
      ["repository:validate-publisher-candidate", true],
      ["publisher:manifests:check", true],
      ["publisher:reader:validate", true],
      ["publisher:content:fidelity", true],
      ["publisher:routes:audit", true],
      ["publisher:application:validate", true],
      ["publisher:content:adapt", true],
      ["publisher:routes:adapted", true],
      ["publisher:audio:adapt", true],
      ["publisher:theme:compile", true],
      ["repository:validate-agents", true],
      ["repository:validate-admin-status", true],
      ["repository:validate-links", true],
      ["repository:source-boundary", true],
      ["readme:check", true],
      ["typecheck", true],
      ["lint", true],
      ["test", true],
      ["build", true],
    ]);
    expect(calls.some(([scriptName]) =>
      scriptName === "publisher:offline:validate"
    )).toBe(false);
  });

  it("substitutes the offline proof before built browser coverage", async () => {
    const calls = [];
    await runValidation(
      { mode: "ui", e2eArguments: ["--project=desktop"] },
      {
        allocatePort: async () => 43127,
        buildExists: () => true,
        runScript: (scriptName, options = {}) => {
          calls.push([scriptName, options]);
        },
      },
    );

    expect(calls.at(-1)).toEqual([
      "test:e2e",
      {
        environment: {
          COHERENCE_UPDATES_SOURCE: "generated",
          PLAYWRIGHT_BASE_URL: "http://127.0.0.1:43127",
          PLAYWRIGHT_PREBUILT: "1",
        },
        ignoreLifecycle: true,
        scriptArguments: ["--project=desktop"],
      },
    ]);
    expect(calls.filter(([scriptName]) =>
      scriptName === "publisher:theme:compile"
    )).toHaveLength(0);
    expect(calls.filter(([scriptName]) =>
      scriptName === "publisher:offline:validate"
    )).toEqual([
      [
        "publisher:offline:validate",
        {
          environment: {
            CI: "1",
            NODE_ENV: "production",
            NEXT_TELEMETRY_DISABLED: "1",
          },
          ignoreLifecycle: true,
        },
      ],
    ]);
    expect(calls.filter(([scriptName]) => scriptName === "build")).toHaveLength(
      1,
    );
    const buildIndex = calls.findIndex(([scriptName]) => scriptName === "build");
    const offlineIndex = calls.findIndex(([scriptName]) =>
      scriptName === "publisher:offline:validate"
    );
    expect(buildIndex).toBeLessThan(offlineIndex);
    expect(offlineIndex).toBeLessThan(calls.findIndex(([scriptName]) =>
      scriptName === "test:e2e"
    ));
  });

  it("keeps the prebuilt E2E entry point free of the offline proof", async () => {
    const calls = [];

    await runValidation(
      { mode: "built-e2e" },
      {
        allocatePort: async () => 43127,
        buildExists: () => true,
        runScript: (scriptName, options = {}) => {
          calls.push([scriptName, options]);
        },
      },
    );

    expect(calls.map(([scriptName]) => scriptName)).toEqual(["test:e2e"]);
    expect(calls.some(([scriptName]) =>
      scriptName === "publisher:offline:validate"
    )).toBe(false);
  });

  it("stops UI validation when the offline proof fails", async () => {
    const calls = [];
    const allocatePort = vi.fn(async () => 43127);

    await expect(runValidation(
      { mode: "ui" },
      {
        allocatePort,
        buildExists: () => true,
        runScript: (scriptName) => {
          calls.push(scriptName);
          if (scriptName === "publisher:offline:validate") {
            throw new Error("offline proof failed");
          }
        },
      },
    )).rejects.toThrow("offline proof failed");

    expect(calls).toContain("build");
    expect(calls).toContain("publisher:offline:validate");
    expect(calls).not.toContain("publisher:theme:compile");
    expect(calls).not.toContain("test:e2e");
    expect(allocatePort).not.toHaveBeenCalled();
  });

  it("gives a prebuilt production server precedence over inherited fast mode", () => {
    expect(
      resolvePlaywrightServerMode({
        PLAYWRIGHT_FAST: "1",
        PLAYWRIGHT_PREBUILT: "1",
      }),
    ).toBe("prebuilt");
  });

  it("starts prebuilt previews without routing through a stale npm launcher", () => {
    const root = path.resolve(import.meta.dirname, "../..");
    const config = fs.readFileSync(path.join(root, "playwright.config.ts"), "utf8");

    expect(config).toContain('? "node scripts/dev/production-preview.mjs"');
    expect(config).not.toContain("npm --ignore-scripts run preview:production");
  });

  it("stops immediately when a validation step fails", () => {
    const calls = [];
    expect(() =>
      runStaticValidation((scriptName) => {
        calls.push(scriptName);
        if (scriptName === "manuscripts:validate") {
          throw new Error("invalid manuscript");
        }
      }),
    ).toThrow("invalid manuscript");
    expect(calls).toEqual([
      "manuscripts:prepare",
      "editorial:debt",
      "editorial:validate",
      "editorial:checkpoints",
      "editorial:protected-lines",
      "editorial:voice-exemplars",
      "editorial:semantic-links:validate",
      "manuscripts:validate",
    ]);
  });

  it("rejects prebuilt browser runs when no production build exists", async () => {
    const runScript = vi.fn();
    await expect(
      runBuiltE2E(runScript, { buildExists: () => false }),
    ).rejects.toThrow("No validated production build was found");
    expect(runScript).not.toHaveBeenCalled();
  });

  it("forwards Playwright shard arguments through the prebuilt gate", async () => {
    const runScript = vi.fn();
    await runBuiltE2E(runScript, {
      allocatePort: async () => 43127,
      buildExists: () => true,
      e2eArguments: ["--shard=2/4"],
    });

    expect(runScript).toHaveBeenLastCalledWith(
      "test:e2e",
      expect.objectContaining({
        ignoreLifecycle: true,
        scriptArguments: ["--shard=2/4"],
      }),
    );
  });
});

describe("production preview address", () => {
  it("uses the established production preview defaults", () => {
    expect(resolveProductionPreviewAddress({})).toEqual({
      hostname: "127.0.0.1",
      port: 3100,
    });
  });

  it("uses the isolated Playwright validation URL", () => {
    expect(
      resolveProductionPreviewAddress({
        PLAYWRIGHT_BASE_URL: "http://127.0.0.1:43127",
      }),
    ).toEqual({ hostname: "127.0.0.1", port: 43127 });
  });

  it("rejects non-http preview URLs", () => {
    expect(() =>
      resolveProductionPreviewAddress({
        PLAYWRIGHT_BASE_URL: "https://example.com",
      }),
    ).toThrow("must use http");
  });

  it("forwards termination and reports unexpected child signals as failures", () => {
    const hostProcess = new EventEmitter();
    hostProcess.execPath = "/test/node";
    const child = new EventEmitter();
    child.kill = vi.fn();
    const run = vi.fn(() => child);

    expect(startProductionPreview({ hostProcess, run })).toBe(child);
    hostProcess.emit("SIGTERM");
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");

    child.emit("exit", null, "SIGKILL");
    expect(hostProcess.exitCode).toBe(137);
    expect(hostProcess.listenerCount("SIGINT")).toBe(0);
    expect(hostProcess.listenerCount("SIGTERM")).toBe(0);
  });

  it("reports preview spawn failures and removes signal handlers", () => {
    const hostProcess = new EventEmitter();
    hostProcess.execPath = "/test/node";
    const child = new EventEmitter();
    const run = vi.fn(() => child);
    const error = new Error("spawn failed");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    startProductionPreview({ hostProcess, run });
    child.emit("error", error);

    expect(consoleError).toHaveBeenCalledWith(error);
    expect(hostProcess.exitCode).toBe(1);
    expect(hostProcess.listenerCount("SIGINT")).toBe(0);
    expect(hostProcess.listenerCount("SIGTERM")).toBe(0);
    consoleError.mockRestore();
  });
});
