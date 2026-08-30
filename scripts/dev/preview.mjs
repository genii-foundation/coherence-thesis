#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createConnection } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "../..");
const previewDir = path.join(repoRoot, ".local-preview");
const defaultHostname = "127.0.0.1";
const defaultPort = 55082;
const defaultPublisherPort = 55087;
const npmCommand = path.join(
  path.dirname(process.execPath),
  process.platform === "win32" ? "npm.cmd" : "npm",
);

function safeLoopbackHostname(hostname) {
  if (typeof hostname !== "string") return null;
  const normalized = hostname.trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost"
    ? normalized
    : null;
}

function isLoopbackHostname(hostname) {
  return safeLoopbackHostname(hostname) !== null;
}

function requireOptionValue(args, index, option) {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${option}.`);
  }
  return value;
}

export function parseArgs(argv) {
  const [command = "start", ...args] = argv;
  const options = {
    command,
    hostname: defaultHostname,
    launchToken: null,
    port: defaultPort,
    publisherPreview: false,
  };
  let portConfigured = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--hostname") {
      options.hostname = requireOptionValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--port") {
      options.port = Number(requireOptionValue(args, index, arg));
      portConfigured = true;
      index += 1;
      continue;
    }

    if (arg === "--token") {
      options.launchToken = requireOptionValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--publisher") {
      options.publisherPreview = true;
      continue;
    }

    throw new Error(`Unknown preview argument: ${arg}`);
  }

  if (options.publisherPreview && !portConfigured) {
    options.port = defaultPublisherPort;
  }

  if (
    !Number.isInteger(options.port) ||
    options.port <= 0 ||
    options.port > 65_535
  ) {
    throw new Error(`Invalid preview port: ${options.port}`);
  }
  if (options.publisherPreview && !isLoopbackHostname(options.hostname)) {
    throw new Error("Publisher preview requires a loopback hostname.");
  }
  if (
    options.command === "run" &&
    !/^[a-f0-9]{64}$/.test(options.launchToken ?? "")
  ) {
    throw new Error("Managed preview requires a valid launch token.");
  }
  if (options.command !== "run" && options.launchToken !== null) {
    throw new Error("The launch token is reserved for the internal run command.");
  }

  return options;
}

export function previewServerEnvironment(
  publisherPreview,
  environment = process.env,
  executablePath = process.execPath,
) {
  const runtimeBin = path.dirname(executablePath);
  const inheritedPath = environment.PATH?.trim();
  return {
    ...environment,
    COHERENCE_PUBLISHER_PREVIEW: publisherPreview ? "1" : "0",
    NEXT_E2E_FAST: "0",
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: "development",
    PATH: inheritedPath
      ? `${runtimeBin}${path.delimiter}${inheritedPath}`
      : runtimeBin,
  };
}

export function createLaunchToken(randomBytesFactory = randomBytes) {
  return randomBytesFactory(32).toString("hex");
}

export function managerCommandArguments({
  hostname,
  launchToken,
  port,
  publisherPreview,
}) {
  const args = [
    scriptPath,
    "run",
    "--hostname",
    hostname,
    "--port",
    String(port),
    "--token",
    launchToken,
  ];
  if (publisherPreview) args.push("--publisher");
  return args;
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

function tokenizeProcessCommand(command) {
  const tokens = [];
  let current = "";
  let escaped = false;
  let quote = null;
  let tokenStarted = false;

  for (const character of command.trim()) {
    if (escaped) {
      current += character;
      escaped = false;
      tokenStarted = true;
      continue;
    }

    if (character === "\\" && quote !== "'") {
      escaped = true;
      tokenStarted = true;
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
      tokenStarted = true;
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      tokenStarted = true;
      continue;
    }

    if (/\s/.test(character)) {
      if (tokenStarted) {
        tokens.push(current);
        current = "";
        tokenStarted = false;
      }
      continue;
    }

    current += character;
    tokenStarted = true;
  }

  if (escaped || quote) return null;
  if (tokenStarted) tokens.push(current);
  return tokens;
}

function readProcessCommand(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 1) return null;

  const result = spawnSync(
    "ps",
    ["-ww", "-p", String(pid), "-o", "command="],
    { encoding: "utf8" },
  );
  if (result.status !== 0 || !result.stdout.trim()) return null;
  return tokenizeProcessCommand(result.stdout);
}

function isValidManagedPreviewState(state, targetPort) {
  return Boolean(
    state &&
      Number.isSafeInteger(state.managerPid) &&
      state.managerPid > 1 &&
      typeof state.hostname === "string" &&
      state.hostname.length > 0 &&
      /^[a-f0-9]{64}$/.test(state.launchToken ?? "") &&
      (state.mode === "coherence" || state.mode === "publisher") &&
      Number.isSafeInteger(state.port) &&
      state.port === targetPort &&
      state.repoRoot === repoRoot,
  );
}

export function managerCommandMatchesLaunch(
  state,
  commandArguments,
  targetPort = state?.port,
) {
  if (
    !isValidManagedPreviewState(state, targetPort) ||
    !Array.isArray(commandArguments)
  ) {
    return false;
  }

  const expected = managerCommandArguments({
    hostname: state.hostname,
    launchToken: state.launchToken,
    port: state.port,
    publisherPreview: state.mode === "publisher",
  });
  const scriptIndex = commandArguments.lastIndexOf(scriptPath);
  if (scriptIndex !== 1) return false;

  const managedArguments = commandArguments.slice(scriptIndex);
  return (
    managedArguments.length === expected.length &&
    managedArguments.every((argument, index) => argument === expected[index])
  );
}

export function authenticatePreviewManager(
  state,
  targetPort,
  commandReader = readProcessCommand,
) {
  if (!isValidManagedPreviewState(state, targetPort)) return false;
  return managerCommandMatchesLaunch(
    state,
    commandReader(state.managerPid),
    targetPort,
  );
}

function killProcess(pid) {
  if (!processExists(pid)) return;

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
}

function killProcessGroup(pid) {
  if (!processExists(pid)) return;
  if (process.platform !== "win32") {
    try {
      process.kill(-pid, "SIGTERM");
      return;
    } catch {
      // Older preview managers did not make the npm child a group leader.
    }
  }
  killProcess(pid);
}

async function waitForProcessesToExit(pids, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (pids.some(processExists)) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return true;
}

function signalManager(pid) {
  try {
    process.kill(pid, "SIGTERM");
    return true;
  } catch {
    return false;
  }
}

export function previewPortIsListening(
  hostname,
  port,
  timeoutMs = 500,
  connect = createConnection,
) {
  return new Promise((resolve) => {
    const socket = connect({ host: hostname, port });
    let settled = false;
    const finish = (listening) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(listening);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

function gitOutput(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  });

  if (result.status !== 0) return null;
  return result.stdout;
}

export function gitIdentity(cwd = repoRoot) {
  const candidatePathspec = [".", ":(exclude)next-env.d.ts"];
  const branch = gitOutput(["branch", "--show-current"], cwd)?.trim() || null;
  const gitSha = gitOutput(["rev-parse", "HEAD"], cwd)?.trim() || null;
  const status =
    gitOutput(["status", "--short", "--", ...candidatePathspec], cwd) ?? "";
  const diff =
    gitOutput(["diff", "--binary", "HEAD", "--", ...candidatePathspec], cwd) ??
    "";
  const untracked = (
    gitOutput(
      [
        "ls-files",
        "--others",
        "--exclude-standard",
        "-z",
        "--",
        ...candidatePathspec,
      ],
      cwd,
    ) ?? ""
  )
    .split("\0")
    .filter(Boolean)
    .sort();

  const digest = createHash("sha256");
  digest.update(`${gitSha ?? "unknown"}\0${status}\0${diff}\0`);
  for (const relativePath of untracked) {
    digest.update(`${relativePath}\0`);
    digest.update(readFileSync(path.join(cwd, relativePath)));
    digest.update("\0");
  }

  return {
    branch,
    candidateDigest: digest.digest("hex"),
    dirty: status.length > 0,
    gitSha,
  };
}

function removeState(port) {
  rmSync(statePath(port), { force: true });
}

export function previewStateMatchesLaunch(state, expected) {
  return Boolean(
    state &&
      state.managerPid === expected.managerPid &&
      state.hostname === expected.hostname &&
      state.launchToken === expected.launchToken &&
      state.mode === expected.mode &&
      state.port === expected.port &&
      processExists(state.managerPid) &&
      processExists(state.serverPid),
  );
}

export async function stopManagedPreviewState(
  state,
  options,
  {
    commandReader = readProcessCommand,
    discardState = removeState,
    portIsListening = previewPortIsListening,
    signal = signalManager,
    waitForExit = waitForProcessesToExit,
  } = {},
) {
  const authenticated = authenticatePreviewManager(
    state,
    options.port,
    commandReader,
  );

  if (!authenticated) {
    const probeHostnames = [options.hostname, state?.hostname]
      .map(safeLoopbackHostname)
      .filter((hostname, index, hostnames) => {
        return hostname !== null && hostnames.indexOf(hostname) === index;
      });
    if (probeHostnames.length === 0) {
      throw new Error(
        `Preview state for port ${options.port} is unauthenticated and has no safe loopback hostname to probe. Refusing to discard ownership state.`,
      );
    }
    for (const hostname of probeHostnames) {
      if (await portIsListening(hostname, options.port)) {
        throw new Error(
          `Preview state for port ${options.port} is unauthenticated while the port is listening. Refusing to signal unmanaged processes.`,
        );
      }
    }
    discardState(options.port);
    return { authenticated: false, discarded: true };
  }

  if (!signal(state.managerPid)) {
    throw new Error(
      `Authenticated preview manager ${state.managerPid} could not be stopped.`,
    );
  }

  const pids = [...new Set([state.serverPid, state.managerPid])].filter(
    (pid) => Number.isSafeInteger(pid) && pid > 1,
  );
  if (!(await waitForExit(pids))) {
    throw new Error(`Preview processes did not stop on port ${options.port}.`);
  }
  if (await portIsListening(state.hostname, state.port)) {
    throw new Error(
      `Preview manager stopped but port ${options.port} is still listening. Refusing to discard ownership state.`,
    );
  }

  discardState(options.port);
  return { authenticated: true, discarded: true };
}

async function waitForPreview(hostname, port, expected) {
  const url = `http://${hostname}:${port}/`;
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (previewStateMatchesLaunch(readState(port), expected)) {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (response.ok) return url;
      } catch {
        // Keep polling until the server is ready or the deadline expires.
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Preview did not become ready at ${url}`);
}

async function startPreview(options) {
  ensurePreviewDir();
  await stopPreview(options, { silent: true });
  if (await previewPortIsListening(options.hostname, options.port)) {
    throw new Error(
      `Preview port ${options.port} is already owned outside managed state.`,
    );
  }

  const launchToken = createLaunchToken();
  const managerArgs = managerCommandArguments({
    hostname: options.hostname,
    launchToken,
    port: options.port,
    publisherPreview: options.publisherPreview,
  });

  const child = spawn(
    process.execPath,
    managerArgs,
    {
      cwd: repoRoot,
      detached: true,
      stdio: "ignore",
    },
  );

  child.unref();

  const expected = {
    hostname: options.hostname,
    launchToken,
    managerPid: child.pid,
    mode: options.publisherPreview ? "publisher" : "coherence",
    port: options.port,
  };
  let url;
  let state;
  try {
    url = await waitForPreview(options.hostname, options.port, expected);
    state = readState(options.port);
  } catch (error) {
    const failedState = readState(options.port);
    const launchState = {
      ...expected,
      repoRoot,
      serverPid:
        failedState?.managerPid === child.pid &&
        failedState?.launchToken === launchToken
          ? failedState.serverPid
          : null,
    };
    try {
      await stopManagedPreviewState(launchState, options);
    } catch (cleanupError) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)} Cleanup failed closed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
      );
    }
    throw error;
  }
  console.log(`Preview ready: ${url}`);
  if (state) {
    console.log(`Worktree: ${state.repoRoot}`);
    console.log(`Branch: ${state.branch ?? "unknown"}`);
    console.log(`Git SHA: ${state.gitSha ?? "unknown"}`);
    console.log(`Candidate digest: ${state.candidateDigest ?? "unknown"}`);
  }
  if (state?.logPath) {
    console.log(`Log: ${state.logPath}`);
  }
}

async function stopPreview(options, { silent = false } = {}) {
  const hasStateFile = existsSync(statePath(options.port));
  const state = readState(options.port);

  if (!state) {
    if (await previewPortIsListening(options.hostname, options.port)) {
      throw new Error(
        `Preview port ${options.port} is listening without authenticated managed state. Refusing to signal unmanaged processes.`,
      );
    }
    if (hasStateFile) removeState(options.port);
    if (!silent) {
      console.log(
        hasStateFile
          ? `Discarded unreadable preview state for inactive port ${options.port}.`
          : `No preview state found for port ${options.port}.`,
      );
    }
    return;
  }

  const result = await stopManagedPreviewState(state, options);

  if (!silent) {
    console.log(
      result.authenticated
        ? `Stopped preview on port ${options.port}.`
        : `Discarded stale preview state for inactive port ${options.port}.`,
    );
  }
}

function statusPreview(options) {
  const state = readState(options.port);

  if (!state) {
    console.log(`No preview state found for port ${options.port}.`);
    return;
  }

  const currentIdentity = gitIdentity();
  const reportedState = { ...state };
  delete reportedState.launchToken;
  console.log(
    JSON.stringify(
      {
        ...reportedState,
        candidateMatchesStartedPreview:
          state.candidateDigest === currentIdentity.candidateDigest,
        currentIdentity,
        managerAuthenticated: authenticatePreviewManager(state, options.port),
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
      detached: process.platform !== "win32",
      env: previewServerEnvironment(options.publisherPreview),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const state = {
    ...gitIdentity(),
    hostname: options.hostname,
    launchToken: options.launchToken,
    logPath: logPath(options.port),
    managerPid: process.pid,
    mode: options.publisherPreview ? "publisher" : "coherence",
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
    if (!authenticatePreviewManager(state, options.port)) {
      writeLog(
        options.port,
        "preview manager refused server shutdown because its launch command could not be authenticated",
      );
      return;
    }
    stopping = true;
    killProcessGroup(server.pid);
    process.exit(exitCode);
  }

  server.on("exit", (code, signal) => {
    writeLog(
      options.port,
      `preview server exited with code ${code ?? "null"} and signal ${signal ?? "null"}`,
    );
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

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
