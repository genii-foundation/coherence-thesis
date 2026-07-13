#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { constants as osConstants } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const require = createRequire(import.meta.url);

export function resolveProductionPreviewAddress(environment = process.env) {
  const configuredUrl = environment.PLAYWRIGHT_BASE_URL?.trim();
  if (!configuredUrl) {
    return { hostname: "127.0.0.1", port: 3100 };
  }

  const url = new URL(configuredUrl);
  if (url.protocol !== "http:") {
    throw new Error("Production preview URLs must use http.");
  }

  const port = Number(url.port || 80);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid production preview port: ${url.port}`);
  }

  return { hostname: url.hostname, port };
}

export function resolveChildExitCode(code, signal) {
  if (typeof code === "number") return code;
  const signalNumber = signal ? osConstants.signals[signal] : undefined;
  return signalNumber ? 128 + signalNumber : 1;
}

export function startProductionPreview({
  environment = process.env,
  hostProcess = process,
  run = spawn,
} = {}) {
  const { hostname, port } = resolveProductionPreviewAddress(environment);
  const nextCli = require.resolve("next/dist/bin/next");
  const child = run(
    hostProcess.execPath,
    [nextCli, "start", "--hostname", hostname, "--port", String(port)],
    {
      cwd: repoRoot,
      env: environment,
      stdio: "inherit",
    },
  );

  const forwardSignal = (signal) => child.kill(signal);
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
if (invokedPath === scriptPath) {
  try {
    startProductionPreview();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
