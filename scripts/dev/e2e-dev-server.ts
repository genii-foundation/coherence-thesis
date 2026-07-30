#!/usr/bin/env node

// Process entry point for the fast browser suite's development server. The port
// derivation lives in playwright-server-mode.ts so that Playwright can require
// it from a CommonJS transpile of playwright.config.ts; only this file touches
// the process and module APIs that a CommonJS transpile would break.

import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { createRequire } from "node:module";
import { constants as osConstants } from "node:os";
import path from "node:path";
import { resolveFastE2eAddress } from "./playwright-server-mode";

const require = createRequire(import.meta.url);

export const fastE2eRepoRoot = path.resolve(import.meta.dirname, "../..");

export function resolveChildExitCode(
  code: number | null,
  signal: NodeJS.Signals | null,
): number {
  if (typeof code === "number") return code;
  const signalNumber = signal ? osConstants.signals[signal] : undefined;
  return signalNumber ? 128 + signalNumber : 1;
}

export function startFastE2eServer({
  environment = process.env,
  hostProcess = process,
  run = spawn,
}: {
  environment?: NodeJS.ProcessEnv;
  hostProcess?: NodeJS.Process;
  run?: (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ) => ChildProcess;
} = {}): ChildProcess {
  const { hostname, port } = resolveFastE2eAddress(
    environment,
    fastE2eRepoRoot,
  );
  const nextCli = require.resolve("next/dist/bin/next");

  hostProcess.stdout.write(
    `Fast browser suite server at http://${hostname}:${port}\n`,
  );

  const child = run(
    hostProcess.execPath,
    [nextCli, "dev", "--hostname", hostname, "--port", String(port)],
    {
      cwd: fastE2eRepoRoot,
      env: { ...environment, NEXT_E2E_FAST: "1" },
      stdio: "inherit",
    },
  );

  const forwardSignal = (signal: NodeJS.Signals) => child.kill(signal);
  const forwardInterrupt = () => forwardSignal("SIGINT");
  const forwardTermination = () => forwardSignal("SIGTERM");
  const removeSignalHandlers = () => {
    hostProcess.removeListener("SIGINT", forwardInterrupt);
    hostProcess.removeListener("SIGTERM", forwardTermination);
  };

  hostProcess.once("SIGINT", forwardInterrupt);
  hostProcess.once("SIGTERM", forwardTermination);

  child.once("error", (error) => {
    removeSignalHandlers();
    console.error(error);
    hostProcess.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    removeSignalHandlers();
    hostProcess.exitCode = resolveChildExitCode(code, signal);
  });

  return child;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === path.resolve(import.meta.filename)) {
  try {
    startFastE2eServer();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
