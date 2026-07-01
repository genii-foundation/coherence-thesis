#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const previewDir = path.join(repoRoot, ".local-preview");
const defaultHostname = "127.0.0.1";
const defaultPort = 55082;
const npmCommand = path.join(
  path.dirname(process.execPath),
  process.platform === "win32" ? "npm.cmd" : "npm",
);

function parseArgs(argv) {
  const [command = "start", ...args] = argv;
  const options = {
    command,
    hostname: defaultHostname,
    port: defaultPort,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--hostname") {
      options.hostname = args[index + 1] ?? options.hostname;
      index += 1;
      continue;
    }

    if (arg === "--port") {
      options.port = Number(args[index + 1] ?? options.port);
      index += 1;
      continue;
    }
  }

  if (!Number.isInteger(options.port) || options.port <= 0) {
    throw new Error(`Invalid preview port: ${options.port}`);
  }

  return options;
}

function ensurePreviewDir() {
  mkdirSync(previewDir, { recursive: true });
}

function statePath(port) {
  return path.join(previewDir, `dev-${port}.json`);
}

function logPath(port) {
  return path.join(previewDir, `dev-${port}.log`);
}

function readState(port) {
  try {
    return JSON.parse(readFileSync(statePath(port), "utf8"));
  } catch {
    return null;
  }
}

function writeLog(port, message) {
  ensurePreviewDir();
  appendFileSync(logPath(port), `${new Date().toISOString()} ${message}\n`);
}

function processExists(pid) {
  if (!pid) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killProcess(pid) {
  if (!processExists(pid)) return;

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
}

function currentBranch() {
  const result = spawnSync("git", ["branch", "--show-current"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) return null;

  return result.stdout.trim() || null;
}

function removeState(port) {
  rmSync(statePath(port), { force: true });
}

async function waitForPreview(hostname, port) {
  const url = `http://${hostname}:${port}/`;
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return url;
    } catch {
      // Keep polling until the server is ready or the deadline expires.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Preview did not become ready at ${url}`);
}

async function startPreview(options) {
  ensurePreviewDir();
  await stopPreview(options, { silent: true });

  const child = spawn(
    process.execPath,
    [
      scriptPath,
      "run",
      "--hostname",
      options.hostname,
      "--port",
      String(options.port),
    ],
    {
      cwd: repoRoot,
      detached: true,
      stdio: "ignore",
    },
  );

  child.unref();

  const url = await waitForPreview(options.hostname, options.port);
  const state = readState(options.port);
  console.log(`Preview ready: ${url}`);
  if (state?.logPath) {
    console.log(`Log: ${state.logPath}`);
  }
}

async function stopPreview(options, { silent = false } = {}) {
  const state = readState(options.port);

  if (!state) {
    if (!silent) console.log(`No preview state found for port ${options.port}.`);
    return;
  }

  killProcess(state.serverPid);
  killProcess(state.managerPid);
  removeState(options.port);

  if (!silent) {
    console.log(`Stopped preview on port ${options.port}.`);
  }
}

function statusPreview(options) {
  const state = readState(options.port);

  if (!state) {
    console.log(`No preview state found for port ${options.port}.`);
    return;
  }

  console.log(
    JSON.stringify(
      {
        ...state,
        managerAlive: processExists(state.managerPid),
        serverAlive: processExists(state.serverPid),
      },
      null,
      2,
    ),
  );
}

function runManagedPreview(options) {
  ensurePreviewDir();
  writeLog(options.port, `starting preview manager for ${repoRoot}`);

  const log = appendFileSync;
  const server = spawn(
    npmCommand,
    [
      "run",
      "dev",
      "--",
      "--hostname",
      options.hostname,
      "--port",
      String(options.port),
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const state = {
    branch: currentBranch(),
    hostname: options.hostname,
    logPath: logPath(options.port),
    managerPid: process.pid,
    port: options.port,
    repoRoot,
    serverPid: server.pid,
    startedAt: new Date().toISOString(),
  };

  writeFileSync(statePath(options.port), `${JSON.stringify(state, null, 2)}\n`);

  server.stdout.on("data", (chunk) => {
    log(logPath(options.port), chunk);
  });
  server.stderr.on("data", (chunk) => {
    log(logPath(options.port), chunk);
  });

  let stopping = false;

  function stopAndExit(exitCode = 0) {
    if (stopping) return;
    stopping = true;
    killProcess(server.pid);
    removeState(options.port);
    process.exit(exitCode);
  }

  server.on("exit", (code, signal) => {
    writeLog(
      options.port,
      `preview server exited with code ${code ?? "null"} and signal ${signal ?? "null"}`,
    );
    removeState(options.port);
    process.exit(code ?? 1);
  });

  const cleanupInterval = setInterval(() => {
    if (!existsSync(repoRoot)) {
      writeLog(options.port, "worktree path no longer exists, stopping preview");
      stopAndExit(0);
    }
  }, 5_000);

  cleanupInterval.unref();

  process.on("SIGINT", () => stopAndExit(0));
  process.on("SIGTERM", () => stopAndExit(0));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.command === "start") {
    await startPreview(options);
    return;
  }

  if (options.command === "stop") {
    await stopPreview(options);
    return;
  }

  if (options.command === "status") {
    statusPreview(options);
    return;
  }

  if (options.command === "run") {
    runManagedPreview(options);
    return;
  }

  throw new Error(`Unknown preview command: ${options.command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
