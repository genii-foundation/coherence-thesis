import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { resolvePlaywrightServerMode } from "./playwright-server-mode";
import {
  createNpmScriptRunner,
  preparedValidationScripts,
  runBuiltE2E,
  runStaticValidation,
  runValidation,
} from "./run-validation.mjs";
import {
  resolveProductionPreviewAddress,
  startProductionPreview,
} from "./production-preview.mjs";

describe("validation orchestration", () => {
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
      "--ignore-scripts",
      "run",
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
      ...preparedValidationScripts.map((scriptName) => [scriptName, true]),
    ]);
  });

  it("runs browser coverage against the build produced by the static gate", async () => {
    const calls = [];
    await runValidation(
      { mode: "ui" },
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
          PLAYWRIGHT_BASE_URL: "http://127.0.0.1:43127",
          PLAYWRIGHT_PREBUILT: "1",
        },
        ignoreLifecycle: true,
      },
    ]);
    expect(calls.filter(([scriptName]) => scriptName === "build")).toHaveLength(
      1,
    );
  });

  it("gives a prebuilt production server precedence over inherited fast mode", () => {
    expect(
      resolvePlaywrightServerMode({
        PLAYWRIGHT_FAST: "1",
        PLAYWRIGHT_PREBUILT: "1",
      }),
    ).toBe("prebuilt");
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
      "manuscripts:debt",
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
