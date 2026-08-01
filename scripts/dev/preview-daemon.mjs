#!/usr/bin/env node
// A preview server that outlives the agent turn that started it.
//
//   node scripts/dev/preview-daemon.mjs start|status|stop|logs
//
// The agent managed preview runs as a child of the desktop application, so the
// harness reaps it when a turn ends. The author then meets a browser tab whose hot
// reload client is retrying a server that no longer exists, which reads as a reload
// loop and is really a corpse. This starts the same dev server in its own process
// session, reparented away from the agent, and keeps it alive if it exits.
//
// Nothing here is specific to an agent. It is the same `npm run dev` the author
// would type, supervised.

import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const runtimeDir = path.join(repoRoot, "generated", "dev");
const pidFile = path.join(runtimeDir, "preview.pid");
const logFile = path.join(runtimeDir, "preview.log");
const port = Number(process.env.COHERENCE_PREVIEW_PORT ?? 55082);
const hostname = process.env.COHERENCE_PREVIEW_HOST ?? "127.0.0.1";

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid() {
  if (!existsSync(pidFile)) return null;
  const pid = Number.parseInt(readFileSync(pidFile, "utf8").trim(), 10);
  return Number.isInteger(pid) && alive(pid) ? pid : null;
}

function listeningPid() {
  // The pid file can go stale, and a server started another way still counts as
  // running. The port is the fact that matters, so ask it rather than the file.
  try {
    const out = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const pid = Number.parseInt(out.split("\n")[0] ?? "", 10);
    return Number.isInteger(pid) ? pid : null;
  } catch {
    return null;
  }
}

function start() {
  const serving = listeningPid();
  if (serving) {
    process.stdout.write(`Preview already serving on ${hostname}:${port} (pid ${serving}).\n`);
    return;
  }
  mkdirSync(runtimeDir, { recursive: true });
  const log = openSync(logFile, "a");

  // detached plus its own session is what survives the turn: the supervisor is no
  // longer in the agent's process group, so a group signal does not reach it.
  const supervisor = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), "supervise"],
    { cwd: repoRoot, detached: true, stdio: ["ignore", log, log] },
  );
  supervisor.unref();
  writeFileSync(pidFile, `${supervisor.pid}\n`);
  process.stdout.write(
    `Preview supervisor started (pid ${supervisor.pid}).\n` +
      `It rebuilds every section first, so give it a minute before the port answers.\n` +
      `  url:  http://${hostname}:${port}/\n  logs: ${path.relative(repoRoot, logFile)}\n`,
  );
}

// Restarts the dev server whenever it exits, so a crash or an OOM does not leave the
// author looking at a retrying tab. Backs off so a server that cannot start does not
// spin, and gives up loudly rather than hiding a permanent failure in a log.
async function supervise() {
  let failures = 0;
  for (;;) {
    const started = Date.now();
    const code = await new Promise((resolve) => {
      const child = spawn(
        "npm",
        ["run", "dev", "--", "--hostname", hostname, "--port", String(port)],
        { cwd: repoRoot, stdio: ["ignore", "inherit", "inherit"] },
      );
      const stop = (signal) => () => {
        child.kill(signal);
        process.exit(0);
      };
      process.on("SIGTERM", stop("SIGTERM"));
      process.on("SIGINT", stop("SIGINT"));
      child.on("exit", (exitCode) => resolve(exitCode ?? 0));
      child.on("error", () => resolve(1));
    });
    const ranFor = Date.now() - started;
    failures = ranFor > 30_000 ? 0 : failures + 1;
    if (failures >= 5) {
      process.stderr.write(
        `Dev server exited ${failures} times without staying up. Supervisor stopping; ` +
          `run npm run dev by hand to see why.\n`,
      );
      process.exit(1);
    }
    const waitMs = Math.min(30_000, 1_000 * 2 ** failures);
    process.stderr.write(
      `Dev server exited with ${code} after ${Math.round(ranFor / 1000)}s. ` +
        `Restarting in ${Math.round(waitMs / 1000)}s.\n`,
    );
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

function status() {
  const serving = listeningPid();
  const supervisor = readPid();
  process.stdout.write(
    `supervisor: ${supervisor ? `running (pid ${supervisor})` : "not running"}\n` +
      `port ${port}: ${serving ? `serving (pid ${serving})` : "not listening"}\n`,
  );
  process.exitCode = serving ? 0 : 1;
}

function stop() {
  const supervisor = readPid();
  if (supervisor) {
    try {
      process.kill(supervisor, "SIGTERM");
    } catch {
      // already gone
    }
  }
  const serving = listeningPid();
  if (serving) {
    try {
      process.kill(serving, "SIGTERM");
    } catch {
      // already gone
    }
  }
  rmSync(pidFile, { force: true });
  process.stdout.write(
    supervisor || serving ? "Preview stopped.\n" : "Preview was not running.\n",
  );
}

const command = process.argv[2] ?? "start";
if (command === "start") start();
else if (command === "supervise") await supervise();
else if (command === "status") status();
else if (command === "stop") stop();
else if (command === "logs") {
  process.stdout.write(existsSync(logFile) ? readFileSync(logFile, "utf8").slice(-4000) : "No log yet.\n");
} else {
  process.stderr.write("Usage: preview-daemon.mjs start|status|stop|logs\n");
  process.exitCode = 1;
}
