#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createSocket } from "node:dgram";
import {
  appendFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  renameSync,
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

function publisherOperationOwnerPath(port, directory = previewDir) {
  return path.join(directory, `publisher-operation-${port}.json`);
}

export function coherenceLifecycleProposalPath(
  launchToken,
  directory = previewDir,
) {
  if (!/^[a-f0-9]{64}$/.test(launchToken ?? "")) {
    throw new Error(
      "Coherence preview lifecycle proposal requires a valid launch token.",
    );
  }
  const tokenDigest = createHash("sha256")
    .update("coherence-preview-lifecycle-proposal-v1\0")
    .update(launchToken)
    .digest("hex");
  return path.join(directory, `coherence-lifecycle-${tokenDigest}.json`);
}

function parsePublisherOperationOwner(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join("\0") !== "pid\0token" ||
    !Number.isSafeInteger(value.pid) ||
    value.pid <= 1 ||
    !/^[a-f0-9]{64}$/.test(value.token ?? "")
  ) {
    throw new Error("Publisher preview operation lock owner is malformed.");
  }
  return { pid: value.pid, token: value.token };
}

function operationOwnersMatch(left, right) {
  return Boolean(
    left &&
      right &&
      left.pid === right.pid &&
      left.token === right.token,
  );
}

function readPublisherPreviewOperationOwnerRecord(
  port,
  {
    directory = previewDir,
    pathExists = existsSync,
    readFile = readFileSync,
  } = {},
) {
  const ownerPath = publisherOperationOwnerPath(port, directory);
  if (!pathExists(ownerPath)) return { kind: "absent" };
  let value;
  try {
    value = JSON.parse(readFile(ownerPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Publisher preview operation lock is unreadable for port ${port}.`,
      { cause: error },
    );
  }
  try {
    return { kind: "valid", owner: parsePublisherOperationOwner(value) };
  } catch (error) {
    const pid =
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Number.isSafeInteger(value.pid) &&
      value.pid > 1
        ? value.pid
        : null;
    return { cause: error, kind: "malformed", pid };
  }
}

export function readPublisherPreviewOperationOwner(port, dependencies = {}) {
  const record = readPublisherPreviewOperationOwnerRecord(port, dependencies);
  if (record.kind === "absent") return null;
  if (record.kind === "valid") return record.owner;
  throw new Error(
    `Publisher preview operation lock is malformed for port ${port}.`,
    { cause: record.cause },
  );
}

function closePublisherPreviewOperationPort(socket) {
  return new Promise((resolve, reject) => {
    try {
      socket.close(resolve);
    } catch (error) {
      reject(error);
    }
  });
}

export function bindPublisherPreviewOperationPort(
  port,
  createUdpSocket = createSocket,
) {
  return new Promise((resolve, reject) => {
    const socket = createUdpSocket({ reuseAddr: false, type: "udp4" });
    const onError = (error) => {
      reject(error);
    };
    socket.once("error", onError);
    socket.bind(
      { address: "127.0.0.1", exclusive: true, port },
      () => {
        socket.off("error", onError);
        resolve(socket);
      },
    );
  });
}

export async function publisherPreviewOperationIsBusy(
  port,
  {
    bindPort = bindPublisherPreviewOperationPort,
    closePort = closePublisherPreviewOperationPort,
  } = {},
) {
  let socket;
  try {
    socket = await bindPort(port);
  } catch (error) {
    if (error?.code === "EADDRINUSE") return true;
    throw error;
  }
  await closePort(socket);
  return false;
}

export function publisherOperationOwnsLaunch(
  port,
  launchToken,
  {
    processIsAlive = processExists,
    readOwner = readPublisherPreviewOperationOwner,
  } = {},
) {
  const owner = readOwner(port);
  return Boolean(
    owner &&
      owner.token === launchToken &&
      processIsAlive(owner.pid),
  );
}

export function publisherOperationOwnerMatches(
  port,
  expectedOwner,
  readOwner = readPublisherPreviewOperationOwner,
) {
  return operationOwnersMatch(readOwner(port), expectedOwner);
}

export async function withPublisherPreviewOperationLock(
  port,
  operation,
  {
    createToken = createLaunchToken,
    bindPort = bindPublisherPreviewOperationPort,
    closePort = closePublisherPreviewOperationPort,
    directory = previewDir,
    ownerPid = process.pid,
    pathExists = existsSync,
    processIsAlive = processExists,
    readFile = readFileSync,
    removeFile = rmSync,
    writeFile = writeFileSync,
  } = {},
) {
  if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid Publisher preview operation lock port: ${port}`);
  }
  if (directory === previewDir) ensurePreviewDir();
  const ownerPath = publisherOperationOwnerPath(port, directory);
  const owner = { pid: ownerPid, token: createToken() };
  parsePublisherOperationOwner(owner);
  let socket;
  try {
    socket = await bindPort(port);
  } catch (error) {
    if (error?.code === "EADDRINUSE") {
      throw new Error(`Publisher preview operation is busy for port ${port}.`);
    }
    throw error;
  }

  let ownerWritten = false;
  const readRecord = () => {
    return readPublisherPreviewOperationOwnerRecord(port, {
      directory,
      pathExists,
      readFile,
    });
  };
  const removeExactOwner = () => {
    const current = readRecord();
    if (
      current.kind !== "valid" ||
      !operationOwnersMatch(current.owner, owner)
    ) {
      throw new Error(
        `Publisher preview operation lock owner changed for port ${port}.`,
      );
    }
    removeFile(ownerPath, { force: true });
  };
  try {
    const existing = readRecord();
    if (existing.kind === "valid" && processIsAlive(existing.owner.pid)) {
      throw new Error(
        `Publisher preview operation metadata has a live owner for port ${port}.`,
      );
    }
    if (
      existing.kind === "malformed" &&
      (existing.pid === null || processIsAlive(existing.pid))
    ) {
      throw new Error(
        `Publisher preview operation metadata is malformed without a proven stale owner for port ${port}.`,
      );
    }
    writeJsonAtomically(ownerPath, owner, {
      removeFile,
      renameFile: renameSync,
      writeFile,
    });
    ownerWritten = true;
    const written = readRecord();
    if (
      written.kind !== "valid" ||
      !operationOwnersMatch(written.owner, owner)
    ) {
      throw new Error(
        `Publisher preview operation owner could not be authenticated for port ${port}.`,
      );
    }
  } catch (error) {
    if (ownerWritten) {
      try {
        removeExactOwner();
      } catch {
        // Preserve nonmatching shared metadata.
      }
    }
    await closePort(socket);
    throw error;
  }

  let operationResult;
  let operationError = null;
  try {
    operationResult = await operation(owner);
  } catch (error) {
    operationError = error;
  }
  try {
    removeExactOwner();
  } catch (releaseError) {
    await closePort(socket);
    if (operationError) {
      throw new Error(
        `${operationError instanceof Error ? operationError.message : String(operationError)} Operation lock release failed closed: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`,
      );
    }
    throw releaseError;
  }
  await closePort(socket);
  if (operationError) throw operationError;
  return operationResult;
}

export function withManagedPreviewMutation(port, operation, dependencies = {}) {
  return withPublisherPreviewOperationLock(port, operation, dependencies);
}

function readState(port) {
  try {
    return JSON.parse(readFileSync(statePath(port), "utf8"));
  } catch {
    return null;
  }
}

export function writeCoherenceLifecycleState(
  port,
  state,
  {
    operationOwner,
    operationOwnerMatches = publisherOperationOwnerMatches,
    writeManagedState = (targetPort, value) => {
      writeJsonExclusively(statePath(targetPort), value);
    },
  } = {},
) {
  if (
    operationOwner?.token !== state?.launchToken ||
    !operationOwnerMatches(port, operationOwner) ||
    !coherenceLifecycleStateMatchesManager(
      state,
      {
        hostname: state.hostname,
        launchToken: operationOwner.token,
        port,
        publisherPreview: false,
      },
      state.managerPid,
      "pending",
    )
  ) {
    throw new Error(
      `Coherence preview lifecycle write is not owned by the active operation for port ${port}.`,
    );
  }
  writeManagedState(port, state);
}

export function writePublisherLifecycleState(
  port,
  state,
  {
    operationOwner,
    operationOwnerMatches = publisherOperationOwnerMatches,
    writeManagedState = (targetPort, value) => {
      writeJsonExclusively(statePath(targetPort), value);
    },
  } = {},
) {
  if (
    operationOwner?.token !== state.launchToken ||
    !operationOwnerMatches(port, operationOwner) ||
    !publisherLifecycleStateMatchesManager(
      state,
      {
        hostname: state.hostname,
        launchToken: operationOwner.token,
        port,
        publisherPreview: true,
      },
      state.managerPid,
    )
  ) {
    throw new Error(
      `Publisher preview lifecycle write is not owned by the active operation for port ${port}.`,
    );
  }
  writeManagedState(port, state);
}

export function writeJsonAtomically(
  filePath,
  value,
  {
    createToken = () => randomBytes(16).toString("hex"),
    removeFile = rmSync,
    renameFile = renameSync,
    writeFile = writeFileSync,
  } = {},
) {
  const temporaryPath = `${filePath}.${process.pid}.${createToken()}.tmp`;
  try {
    writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    renameFile(temporaryPath, filePath);
  } finally {
    removeFile(temporaryPath, { force: true });
  }
}

export function writeJsonExclusively(
  filePath,
  value,
  {
    createToken = () => randomBytes(16).toString("hex"),
    linkFile = linkSync,
    removeFile = rmSync,
    writeFile = writeFileSync,
  } = {},
) {
  const temporaryPath = `${filePath}.${process.pid}.${createToken()}.tmp`;
  try {
    writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    linkFile(temporaryPath, filePath);
  } finally {
    removeFile(temporaryPath, { force: true });
  }
}

function readCoherenceLifecycleProposal(launchToken) {
  const proposalPath = coherenceLifecycleProposalPath(launchToken);
  if (!existsSync(proposalPath)) return null;
  try {
    return JSON.parse(readFileSync(proposalPath, "utf8"));
  } catch {
    throw new Error(
      "Coherence preview lifecycle proposal is unreadable.",
    );
  }
}

export function coherenceLifecycleProposalMatchesPending(
  pendingState,
  proposal,
) {
  const managerOptions = {
    hostname: pendingState?.hostname,
    launchToken: pendingState?.launchToken,
    port: pendingState?.port,
    publisherPreview: false,
  };
  return Boolean(
    coherenceLifecycleStateMatchesManager(
      pendingState,
      managerOptions,
      pendingState?.managerPid,
      "pending",
    ) &&
      coherenceLifecycleStateMatchesManager(
        proposal,
        managerOptions,
        pendingState.managerPid,
        "final",
      ) &&
      statesAreIdentical(proposal, {
        ...pendingState,
        serverPid: proposal?.serverPid,
      }),
  );
}

function writeCoherenceLifecycleProposal(state) {
  writeJsonExclusively(
    coherenceLifecycleProposalPath(state.launchToken),
    state,
  );
}

export function removeCoherenceLifecycleProposalIfValid(
  state,
  removeProposal = (candidate) => {
    rmSync(coherenceLifecycleProposalPath(candidate.launchToken), {
      force: true,
    });
  },
) {
  if (!/^[a-f0-9]{64}$/.test(state?.launchToken ?? "")) return false;
  removeProposal(state);
  return true;
}

export function publisherCandidateEvidencePath(
  launchToken,
  directory = previewDir,
) {
  if (!/^[a-f0-9]{64}$/.test(launchToken ?? "")) {
    throw new Error(
      "Publisher preview candidate evidence requires a valid launch token.",
    );
  }
  const tokenDigest = createHash("sha256")
    .update("coherence-publisher-preview-candidate-evidence-v1\0")
    .update(launchToken)
    .digest("hex");
  return path.join(directory, `publisher-candidate-${tokenDigest}.json`);
}

function readPublisherCandidateEvidence(state) {
  const evidencePath = publisherCandidateEvidencePath(state.launchToken);
  try {
    return JSON.parse(readFileSync(evidencePath, "utf8"));
  } catch {
    throw new Error(
      `Publisher preview candidate evidence for port ${state.port} is missing or unreadable.`,
    );
  }
}

function writePublisherCandidateEvidence(state, identity) {
  writeJsonAtomically(
    publisherCandidateEvidencePath(state.launchToken),
    identity,
  );
}

function removePublisherCandidateEvidence(state) {
  rmSync(publisherCandidateEvidencePath(state.launchToken), { force: true });
}

export function removePublisherCandidateEvidenceIfValid(
  state,
  removeEvidence = removePublisherCandidateEvidence,
) {
  if (!/^[a-f0-9]{64}$/.test(state?.launchToken ?? "")) return false;
  removeEvidence(state);
  return true;
}

async function loadPublisherPreviewIdentityApi() {
  return import("@genii-foundation/publisher/node");
}

export async function capturePublisherPreviewCandidateIdentity(
  hostRoot,
  loadIdentityApi = loadPublisherPreviewIdentityApi,
) {
  const {
    capturePreviewCandidateIdentity,
    parsePreviewCandidateIdentity,
  } = await loadIdentityApi();
  const captured = await capturePreviewCandidateIdentity({ hostRoot });
  return parsePreviewCandidateIdentity(captured);
}

export async function verifyPublisherPreviewCandidateIdentity(
  evidence,
  hostRoot,
  loadIdentityApi = loadPublisherPreviewIdentityApi,
) {
  const {
    parsePreviewCandidateIdentity,
    verifyPreviewCandidateIdentity,
  } = await loadIdentityApi();
  const expected = parsePreviewCandidateIdentity(evidence);
  return verifyPreviewCandidateIdentity({
    expected,
    hostRoot,
  });
}

function publisherCandidateIdentitySummary(identity) {
  return {
    branch: identity.branch,
    candidateDigest: identity.candidate.digest,
    candidateByteCount: identity.candidate.byteCount,
    candidateEntryCount: identity.candidate.entryCount,
    dirty: identity.dirty,
    gitSha: identity.commit,
    identityDigest: identity.identityDigest,
    schemaVersion: identity.schemaVersion,
    worktreeRoot: identity.worktreeRoot,
  };
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

export async function shutdownManagedPreviewServer(
  server,
  {
    signalServer = killProcessGroup,
    waitForExit = waitForProcessesToExit,
  } = {},
) {
  if (
    !server ||
    !Number.isSafeInteger(server.pid) ||
    server.pid <= 1
  ) {
    return server === null;
  }
  signalServer(server.pid);
  return waitForExit([server.pid]);
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
  const candidatePathspec = ["."];
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

function stateHasExactLaunchOwner(state, expected, targetPort) {
  return Boolean(
    state?.mode === "publisher" &&
      state.port === targetPort &&
      state.managerPid === expected?.managerPid &&
      state.launchToken === expected?.launchToken,
  );
}

export function discardCoherenceLifecycleStateIfExact(
  expectedState,
  targetPort,
  {
    beforeDiscard = () => {},
    discardState = removeState,
    operationOwner,
    operationOwnerMatches = publisherOperationOwnerMatches,
    readManagedState = readState,
  } = {},
) {
  if (!operationOwnerMatches(targetPort, operationOwner)) {
    throw new Error(
      `Coherence preview lifecycle discard is not owned by the active operation for port ${targetPort}.`,
    );
  }
  const currentState = readManagedState(targetPort);
  if (
    currentState?.mode !== "coherence" ||
    currentState.port !== targetPort ||
    currentState.managerPid !== expectedState?.managerPid ||
    currentState.launchToken !== expectedState?.launchToken
  ) {
    return false;
  }
  beforeDiscard(currentState);
  discardState(targetPort);
  return true;
}

export function discardPublisherLifecycleStateIfExact(
  expectedState,
  targetPort,
  {
    beforeDiscard = () => {},
    discardState = removeState,
    operationOwner,
    operationOwnerMatches = publisherOperationOwnerMatches,
    readManagedState = readState,
  } = {},
) {
  if (!operationOwnerMatches(targetPort, operationOwner)) {
    throw new Error(
      `Publisher preview lifecycle discard is not owned by the active operation for port ${targetPort}.`,
    );
  }
  const currentState = readManagedState(targetPort);
  if (!stateHasExactLaunchOwner(currentState, expectedState, targetPort)) {
    return false;
  }
  beforeDiscard(currentState);
  discardState(targetPort);
  return true;
}

function statesAreIdentical(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function previewStateMatchesLaunch(state, expected) {
  const serverOwnershipIsLive =
    state?.mode === "publisher"
      ? state.serverPid === null
      : processExists(state?.serverPid);
  return Boolean(
    state &&
      state.managerPid === expected.managerPid &&
      state.hostname === expected.hostname &&
      state.launchToken === expected.launchToken &&
      state.mode === expected.mode &&
      state.port === expected.port &&
      processExists(state.managerPid) &&
      serverOwnershipIsLive,
  );
}

export async function persistPublisherPreviewCandidateIdentity(
  state,
  expected,
  {
    authenticateManager = authenticatePreviewManager,
    captureCandidate = capturePublisherPreviewCandidateIdentity,
    hostRoot = repoRoot,
    matchesLaunch = previewStateMatchesLaunch,
    readCandidateEvidence = readPublisherCandidateEvidence,
    readManagedState = readState,
    removeCandidateEvidence = removePublisherCandidateEvidence,
    writeCandidateEvidence = writePublisherCandidateEvidence,
  } = {},
) {
  if (
    !matchesLaunch(state, expected) ||
    !authenticateManager(state, expected.port)
  ) {
    throw new Error(
      "Publisher preview candidate capture requires the exact authenticated manager launch.",
    );
  }

  const identity = await captureCandidate(hostRoot);
  const currentState = readManagedState(expected.port);
  if (
    !statesAreIdentical(currentState, state) ||
    !matchesLaunch(currentState, expected) ||
    !authenticateManager(currentState, expected.port)
  ) {
    throw new Error(
      "Publisher preview manager identity changed before candidate evidence could be saved.",
    );
  }

  let evidenceWriteAttempted = false;
  try {
    evidenceWriteAttempted = true;
    writeCandidateEvidence(currentState, identity);
    const persistedState = readManagedState(expected.port);
    if (
      !statesAreIdentical(persistedState, state) ||
      !matchesLaunch(persistedState, expected) ||
      !authenticateManager(persistedState, expected.port) ||
      !statesAreIdentical(readCandidateEvidence(persistedState), identity)
    ) {
      throw new Error(
        "Publisher preview manager identity changed after candidate evidence was saved.",
      );
    }
  } catch (error) {
    if (evidenceWriteAttempted) {
      try {
        removeCandidateEvidence(state);
      } catch (cleanupError) {
        throw new Error(
          `${error instanceof Error ? error.message : String(error)} Candidate evidence cleanup failed closed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        );
      }
    }
    throw error;
  }
  return identity;
}

export async function verifyPublisherPreviewReadyAfterCapture(
  state,
  expected,
  {
    authenticateManager = authenticatePreviewManager,
    matchesLaunch = previewStateMatchesLaunch,
    portIsListening = previewPortIsListening,
    readManagedState = readState,
  } = {},
) {
  const probeHostname = safeLoopbackHostname(state?.hostname);
  if (probeHostname === null) {
    throw new Error(
      `Publisher preview readiness for port ${expected.port} has no safe loopback hostname to probe.`,
    );
  }
  const currentState = readManagedState(expected.port);
  if (
    !statesAreIdentical(currentState, state) ||
    !matchesLaunch(currentState, expected) ||
    !authenticateManager(currentState, expected.port)
  ) {
    throw new Error(
      `Publisher preview manager identity changed after candidate capture for port ${expected.port}.`,
    );
  }
  if (!(await portIsListening(probeHostname, expected.port))) {
    throw new Error(
      `Publisher preview server stopped listening during candidate capture for port ${expected.port}.`,
    );
  }
  const finalState = readManagedState(expected.port);
  if (
    !statesAreIdentical(finalState, state) ||
    !matchesLaunch(finalState, expected) ||
    !authenticateManager(finalState, expected.port)
  ) {
    throw new Error(
      `Publisher preview manager identity changed after the final readiness probe for port ${expected.port}.`,
    );
  }
}

export async function stopManagedPreviewState(
  state,
  options,
  {
    commandReader = readProcessCommand,
    discardCoherenceProposal = removeCoherenceLifecycleProposalIfValid,
    discardCoherenceState = discardCoherenceLifecycleStateIfExact,
    discardPublisherEvidence = removePublisherCandidateEvidenceIfValid,
    discardPublisherState = discardPublisherLifecycleStateIfExact,
    discardState = removeState,
    operationOwnerMatches = publisherOperationOwnerMatches,
    portIsListening = previewPortIsListening,
    processIsAlive = processExists,
    readCoherenceProposal = readCoherenceLifecycleProposal,
    signal = signalManager,
    waitForExit = waitForProcessesToExit,
  } = {},
) {
  const operationOwner = options.publisherOperationOwner;
  if (!operationOwnerMatches(options.port, operationOwner)) {
    throw new Error(
      `Managed preview stop is not owned by the active operation for port ${options.port}.`,
    );
  }
  const authenticated = authenticatePreviewManager(
    state,
    options.port,
    commandReader,
  );
  let coherenceProposal = null;
  if (state?.mode === "coherence" && state.serverPid === null) {
    coherenceProposal = readCoherenceProposal(state.launchToken);
    if (
      coherenceProposal !== null &&
      !coherenceLifecycleProposalMatchesPending(state, coherenceProposal)
    ) {
      throw new Error(
        `Coherence preview pending lifecycle proposal is not exact for port ${options.port}.`,
      );
    }
  }

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
    if (
      state?.mode === "coherence" &&
      state.serverPid === null &&
      (coherenceProposal === null ||
        processIsAlive(coherenceProposal.serverPid))
    ) {
      throw new Error(
        `Coherence preview pending lifecycle state for port ${options.port} has no authenticated quiescence proof. Refusing to discard ownership state.`,
      );
    }
    let discarded;
    if (state?.mode === "publisher") {
      discarded = discardPublisherState(state, options.port, {
        beforeDiscard: () => discardPublisherEvidence(state),
        operationOwner,
        operationOwnerMatches,
      });
    } else if (state?.mode === "coherence") {
      discarded = discardCoherenceState(state, options.port, {
        beforeDiscard: () => discardCoherenceProposal(state),
        operationOwner,
        operationOwnerMatches,
      });
    } else {
      discardState(options.port);
      discarded = true;
    }
    return { authenticated: false, discarded };
  }

  if (!signal(state.managerPid)) {
    throw new Error(
      `Authenticated preview manager ${state.managerPid} could not be stopped.`,
    );
  }

  const pids = [
    ...new Set([
      state.serverPid,
      coherenceProposal?.serverPid,
      state.managerPid,
    ]),
  ].filter((pid) => Number.isSafeInteger(pid) && pid > 1);
  if (!(await waitForExit(pids))) {
    throw new Error(`Preview processes did not stop on port ${options.port}.`);
  }
  if (await portIsListening(state.hostname, state.port)) {
    throw new Error(
      `Preview manager stopped but port ${options.port} is still listening. Refusing to discard ownership state.`,
    );
  }

  if (state.mode === "publisher") {
    return {
      authenticated: true,
      discarded: discardPublisherState(state, options.port, {
        beforeDiscard: () => discardPublisherEvidence(state),
        operationOwner,
        operationOwnerMatches,
      }),
    };
  }
  return {
    authenticated: true,
    discarded: discardCoherenceState(state, options.port, {
      beforeDiscard: () => discardCoherenceProposal(state),
      operationOwner,
      operationOwnerMatches,
    }),
  };
}

export async function failAfterManagedPreviewCleanup(
  error,
  state,
  options,
  stopManagedState = stopManagedPreviewState,
) {
  try {
    await stopManagedState(state, options);
  } catch (cleanupError) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} Cleanup failed closed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
    );
  }
  throw error;
}

export async function createPreviewStatusReport(
  state,
  {
    authenticateManager = authenticatePreviewManager,
    hostRoot = repoRoot,
    legacyIdentity = gitIdentity,
    operationIsBusy = publisherPreviewOperationIsBusy,
    portIsListening = previewPortIsListening,
    processIsAlive = processExists,
    publisherPreview = false,
    readCandidateEvidence = readPublisherCandidateEvidence,
    readManagedState = readState,
    requestedPort = state?.port,
    verifyPublisherCandidate = verifyPublisherPreviewCandidateIdentity,
  } = {},
) {
  const reportedState =
    state?.mode === "publisher"
      ? {
          hostname: state.hostname,
          logPath: state.logPath,
          managerPid: state.managerPid,
          mode: state.mode,
          port: state.port,
          repoRoot: state.repoRoot,
          serverPid: state.serverPid,
          startedAt: state.startedAt,
        }
      : { ...state };
  delete reportedState.launchToken;
  delete reportedState.publisherCandidateIdentity;

  const requestedMode = publisherPreview ? "publisher" : "coherence";
  if (
    state?.mode !== requestedMode ||
    !Number.isSafeInteger(requestedPort) ||
    state?.port !== requestedPort
  ) {
    throw new Error(
      `Preview status requires exact ${requestedMode} managed state for port ${String(requestedPort)}.`,
    );
  }

  if (!publisherPreview) {
    const currentIdentity = legacyIdentity(hostRoot);
    return {
      ...reportedState,
      candidateMatchesStartedPreview:
        state.candidateDigest === currentIdentity.candidateDigest,
      currentIdentity,
      managerAuthenticated: authenticateManager(state, requestedPort),
      managerAlive: processIsAlive(state.managerPid),
      serverAlive: processIsAlive(state.serverPid),
    };
  }

  if (await operationIsBusy(requestedPort)) {
    throw new Error(
      `Publisher preview operation is busy for port ${requestedPort}.`,
    );
  }

  const currentState = readManagedState(requestedPort);
  if (
    !statesAreIdentical(currentState, state) ||
    !authenticateManager(currentState, requestedPort)
  ) {
    throw new Error(
      `Publisher preview state for port ${requestedPort} is not the exact authenticated manager state.`,
    );
  }
  const evidence = readCandidateEvidence(currentState);
  const verification = await verifyPublisherCandidate(evidence, hostRoot);
  const verifiedState = readManagedState(requestedPort);
  if (
    !statesAreIdentical(verifiedState, state) ||
    !authenticateManager(verifiedState, requestedPort)
  ) {
    throw new Error(
      `Publisher preview manager identity changed while status was verified for port ${requestedPort}.`,
    );
  }
  const expectedIdentity = publisherCandidateIdentitySummary(
    verification.expected,
  );
  const probeHostname = safeLoopbackHostname(verifiedState.hostname);
  if (probeHostname === null) {
    throw new Error(
      `Publisher preview status for port ${requestedPort} has no safe loopback hostname to probe.`,
    );
  }
  const portListening = await portIsListening(probeHostname, requestedPort);
  const finalState = readManagedState(requestedPort);
  if (
    !statesAreIdentical(finalState, state) ||
    !authenticateManager(finalState, requestedPort)
  ) {
    throw new Error(
      `Publisher preview manager identity changed after status was verified for port ${requestedPort}.`,
    );
  }
  if (await operationIsBusy(requestedPort)) {
    throw new Error(
      `Publisher preview operation changed while status was verified for port ${requestedPort}.`,
    );
  }
  return {
    ...reportedState,
    branch: expectedIdentity.branch,
    candidateDigest: expectedIdentity.candidateDigest,
    candidateMatchesStartedPreview: verification.matches,
    candidateMismatches: verification.mismatches,
    currentIdentity: publisherCandidateIdentitySummary(verification.actual),
    dirty: expectedIdentity.dirty,
    gitSha: expectedIdentity.gitSha,
    managerAuthenticated: true,
    managerAlive: processIsAlive(finalState.managerPid),
    portListening,
    publisherCandidateIdentity: expectedIdentity,
    serverAlive: portListening,
  };
}

export function isPublisherPreviewStatusReady(report) {
  return Boolean(
    report?.candidateMatchesStartedPreview === true &&
      report.managerAuthenticated === true &&
      report.managerAlive === true &&
      report.portListening === true &&
      report.serverAlive === true,
  );
}

export function coherenceLifecycleStateMatchesManager(
  state,
  options,
  managerPid = process.pid,
  serverState = "pending",
) {
  if (
    !state ||
    typeof state !== "object" ||
    Array.isArray(state) ||
    Object.keys(state).sort().join("\0") !==
      [
        "branch",
        "candidateDigest",
        "dirty",
        "gitSha",
        "hostname",
        "launchToken",
        "logPath",
        "managerPid",
        "mode",
        "port",
        "repoRoot",
        "serverPid",
        "startedAt",
      ].join("\0")
  ) {
    return false;
  }
  const startedAt = Date.parse(state.startedAt);
  const serverPidMatches =
    serverState === "pending"
      ? state.serverPid === null
      : serverState === "final" &&
        Number.isSafeInteger(state.serverPid) &&
        state.serverPid > 1;
  return Boolean(
    options.publisherPreview === false &&
      state.hostname === options.hostname &&
      state.launchToken === options.launchToken &&
      state.logPath === logPath(options.port) &&
      state.managerPid === managerPid &&
      state.mode === "coherence" &&
      state.port === options.port &&
      state.repoRoot === repoRoot &&
      serverPidMatches &&
      (state.branch === null || typeof state.branch === "string") &&
      /^[0-9a-f]{64}$/.test(state.candidateDigest ?? "") &&
      typeof state.dirty === "boolean" &&
      (state.gitSha === null || /^[0-9a-f]{40}$/.test(state.gitSha ?? "")) &&
      Number.isFinite(startedAt) &&
      new Date(startedAt).toISOString() === state.startedAt,
  );
}

export function publisherLifecycleStateMatchesManager(
  state,
  options,
  managerPid = process.pid,
) {
  if (
    !state ||
    typeof state !== "object" ||
    Array.isArray(state) ||
    Object.keys(state).sort().join("\0") !==
      [
        "hostname",
        "launchToken",
        "logPath",
        "managerPid",
        "mode",
        "port",
        "repoRoot",
        "serverPid",
        "startedAt",
      ].join("\0")
  ) {
    return false;
  }
  const startedAt = Date.parse(state.startedAt);
  return Boolean(
    options.publisherPreview === true &&
      safeLoopbackHostname(options.hostname) !== null &&
      state.hostname === options.hostname &&
      state.launchToken === options.launchToken &&
      state.logPath === logPath(options.port) &&
      state.managerPid === managerPid &&
      state.mode === "publisher" &&
      state.port === options.port &&
      state.repoRoot === repoRoot &&
      state.serverPid === null &&
      Number.isFinite(startedAt) &&
      new Date(startedAt).toISOString() === state.startedAt,
  );
}

export async function waitForPublisherLifecycleState(
  options,
  {
    deadlineMs = 30_000,
    managerPid = process.pid,
    now = Date.now,
    operationOwnsLaunch = publisherOperationOwnsLaunch,
    pause = () => new Promise((resolve) => setTimeout(resolve, 50)),
    readManagedState = readState,
  } = {},
) {
  const deadline = now() + deadlineMs;
  while (now() < deadline) {
    const state = readManagedState(options.port);
    if (state !== null) {
      if (publisherLifecycleStateMatchesManager(state, options, managerPid)) {
        return state;
      }
      throw new Error(
        `Publisher preview manager found nonmatching lifecycle state for port ${options.port}.`,
      );
    }
    if (!operationOwnsLaunch(options.port, options.launchToken)) {
      throw new Error(
        `Publisher preview start ownership ended before lifecycle state was published for port ${options.port}.`,
      );
    }
    await pause();
  }
  throw new Error(
    `Publisher preview lifecycle state was not published for port ${options.port}.`,
  );
}

export async function waitForCoherenceLifecycleProposal(
  pendingState,
  {
    authenticateManager = authenticatePreviewManager,
    deadlineMs = 30_000,
    now = Date.now,
    pause = () => new Promise((resolve) => setTimeout(resolve, 50)),
    processIsAlive = processExists,
    readManagedState = readState,
    readProposal = readCoherenceLifecycleProposal,
  } = {},
) {
  const deadline = now() + deadlineMs;
  while (now() < deadline) {
    const currentState = readManagedState(pendingState.port);
    if (!statesAreIdentical(currentState, pendingState)) {
      throw new Error(
        `Coherence preview pending lifecycle ownership changed for port ${pendingState.port}.`,
      );
    }
    if (
      !processIsAlive(pendingState.managerPid) ||
      !authenticateManager(pendingState, pendingState.port)
    ) {
      throw new Error(
        `Coherence preview manager exited before proposing lifecycle state for port ${pendingState.port}.`,
      );
    }
    const proposal = readProposal(pendingState.launchToken);
    if (proposal !== null) return proposal;
    await pause();
  }
  throw new Error(
    `Coherence preview manager did not propose lifecycle state for port ${pendingState.port}.`,
  );
}

export async function waitForCoherencePendingLifecycleState(
  options,
  {
    deadlineMs = 30_000,
    managerPid = process.pid,
    now = Date.now,
    operationOwnsLaunch = publisherOperationOwnsLaunch,
    pause = () => new Promise((resolve) => setTimeout(resolve, 50)),
    readManagedState = readState,
  } = {},
) {
  const deadline = now() + deadlineMs;
  while (now() < deadline) {
    const state = readManagedState(options.port);
    if (state !== null) {
      if (
        coherenceLifecycleStateMatchesManager(
          state,
          options,
          managerPid,
          "pending",
        )
      ) {
        return state;
      }
      throw new Error(
        `Coherence preview manager found nonmatching pending lifecycle state for port ${options.port}.`,
      );
    }
    if (!operationOwnsLaunch(options.port, options.launchToken)) {
      throw new Error(
        `Coherence preview start ownership ended before pending lifecycle state was published for port ${options.port}.`,
      );
    }
    await pause();
  }
  throw new Error(
    `Coherence preview pending lifecycle state was not published for port ${options.port}.`,
  );
}

export function promoteCoherenceLifecycleState(
  pendingState,
  proposal,
  {
    authenticateManager = authenticatePreviewManager,
    operationOwner,
    operationOwnerMatches = publisherOperationOwnerMatches,
    processIsAlive = processExists,
    readManagedState = readState,
    replaceManagedState = (targetPort, value) => {
      writeJsonAtomically(statePath(targetPort), value);
    },
  } = {},
) {
  const port = pendingState.port;
  const managerOptions = {
    hostname: pendingState.hostname,
    launchToken: pendingState.launchToken,
    port,
    publisherPreview: false,
  };
  if (
    operationOwner?.token !== pendingState.launchToken ||
    !operationOwnerMatches(port, operationOwner) ||
    !coherenceLifecycleStateMatchesManager(
      pendingState,
      managerOptions,
      pendingState.managerPid,
      "pending",
    ) ||
    !coherenceLifecycleStateMatchesManager(
      proposal,
      managerOptions,
      pendingState.managerPid,
      "final",
    ) ||
    !statesAreIdentical(proposal, {
      ...pendingState,
      serverPid: proposal?.serverPid,
    }) ||
    !authenticateManager(proposal, port) ||
    !processIsAlive(proposal.managerPid) ||
    !processIsAlive(proposal.serverPid) ||
    !statesAreIdentical(readManagedState(port), pendingState)
  ) {
    throw new Error(
      `Coherence preview lifecycle proposal is not the exact owned promotion for port ${port}.`,
    );
  }
  replaceManagedState(port, proposal);
  if (
    !operationOwnerMatches(port, operationOwner) ||
    !statesAreIdentical(readManagedState(port), proposal) ||
    !authenticateManager(proposal, port)
  ) {
    throw new Error(
      `Coherence preview lifecycle promotion changed while it was saved for port ${port}.`,
    );
  }
  return proposal;
}

export async function waitForCoherenceLifecyclePromotion(
  options,
  proposal,
  {
    deadlineMs = 30_000,
    now = Date.now,
    operationOwnsLaunch = publisherOperationOwnsLaunch,
    pause = () => new Promise((resolve) => setTimeout(resolve, 50)),
    readManagedState = readState,
  } = {},
) {
  const pendingState = { ...proposal, serverPid: null };
  const deadline = now() + deadlineMs;
  while (now() < deadline) {
    const currentState = readManagedState(options.port);
    if (statesAreIdentical(currentState, proposal)) return proposal;
    if (!statesAreIdentical(currentState, pendingState)) {
      throw new Error(
        `Coherence preview lifecycle state changed before promotion for port ${options.port}.`,
      );
    }
    if (!operationOwnsLaunch(options.port, options.launchToken)) {
      throw new Error(
        `Coherence preview start ownership ended before lifecycle promotion for port ${options.port}.`,
      );
    }
    await pause();
  }
  throw new Error(
    `Coherence preview lifecycle state was not promoted for port ${options.port}.`,
  );
}

function spawnPreviewServer(options, spawnProcess = spawn) {
  return spawnProcess(
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
}

export async function spawnPublisherPreviewServer(
  options,
  {
    managerPid = process.pid,
    readLifecycleState = waitForPublisherLifecycleState,
    spawnServer = spawnPreviewServer,
  } = {},
) {
  const state = await readLifecycleState(options);
  if (!publisherLifecycleStateMatchesManager(state, options, managerPid)) {
    throw new Error(
      `Publisher preview server spawn requires exact lifecycle state for port ${options.port}.`,
    );
  }
  return { server: spawnServer(options), state };
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

async function startPreviewWithinOperation(options, publisherOperationOwner) {
  ensurePreviewDir();
  await stopPreview(options, {
    publisherOperationOwner,
    silent: true,
  });
  if (await previewPortIsListening(options.hostname, options.port)) {
    throw new Error(
      `Preview port ${options.port} is already owned outside managed state.`,
    );
  }

  const launchToken = publisherOperationOwner.token;
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
  const initialLifecycleState = createManagedPreviewState(
    { ...options, launchToken },
    null,
    { managerPid: child.pid },
  );
  let url;
  let state = initialLifecycleState;
  let publisherIdentity = null;
  try {
    if (options.publisherPreview) {
      writePublisherLifecycleState(options.port, initialLifecycleState, {
        operationOwner: publisherOperationOwner,
      });
    } else {
      writeCoherenceLifecycleState(options.port, initialLifecycleState, {
        operationOwner: publisherOperationOwner,
      });
      const proposal = await waitForCoherenceLifecycleProposal(
        initialLifecycleState,
      );
      state = promoteCoherenceLifecycleState(
        initialLifecycleState,
        proposal,
        { operationOwner: publisherOperationOwner },
      );
      removeCoherenceLifecycleProposalIfValid(state);
    }
    url = await waitForPreview(options.hostname, options.port, expected);
    state = readState(options.port);
    if (options.publisherPreview) {
      publisherIdentity = await persistPublisherPreviewCandidateIdentity(
        state,
        expected,
      );
      await verifyPublisherPreviewReadyAfterCapture(state, expected);
    }
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
    await failAfterManagedPreviewCleanup(error, launchState, {
      ...options,
      publisherOperationOwner,
    });
  }
  console.log(`Preview ready: ${url}`);
  if (state) {
    const identity = publisherIdentity
      ? publisherCandidateIdentitySummary(publisherIdentity)
      : state;
    console.log(`Worktree: ${identity.worktreeRoot ?? state.repoRoot}`);
    console.log(`Branch: ${identity.branch ?? "unknown"}`);
    console.log(`Git SHA: ${identity.gitSha ?? "unknown"}`);
    console.log(`Candidate digest: ${identity.candidateDigest ?? "unknown"}`);
  }
  if (state?.logPath) {
    console.log(`Log: ${state.logPath}`);
  }
}

async function startPreview(options) {
  return withManagedPreviewMutation(options.port, (operationOwner) => {
    return startPreviewWithinOperation(options, operationOwner);
  });
}

async function stopPreview(
  options,
  { publisherOperationOwner = null, silent = false } = {},
) {
  if (publisherOperationOwner === null) {
    return withManagedPreviewMutation(
      options.port,
      (operationOwner) => {
        return stopPreview(options, {
          publisherOperationOwner: operationOwner,
          silent,
        });
      },
    );
  }
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

  const result = await stopManagedPreviewState(state, {
    ...options,
    publisherOperationOwner,
  });

  if (!silent) {
    console.log(
      result.authenticated
        ? `Stopped preview on port ${options.port}.`
        : `Discarded stale preview state for inactive port ${options.port}.`,
    );
  }
}

export async function statusPreview(
  options,
  {
    createReport = createPreviewStatusReport,
    markFailure = () => {
      process.exitCode = 1;
    },
    operationIsBusy = publisherPreviewOperationIsBusy,
    output = console.log,
    readManagedState = readState,
    stateFileExists = (port) => existsSync(statePath(port)),
  } = {},
) {
  if (options.publisherPreview && (await operationIsBusy(options.port))) {
    markFailure();
    throw new Error(
      `Publisher preview operation is busy for port ${options.port}.`,
    );
  }
  const hasStateFile = stateFileExists(options.port);
  const state = readManagedState(options.port);

  if (!state) {
    if (options.publisherPreview && hasStateFile) {
      markFailure();
      throw new Error(
        `Publisher preview state for port ${options.port} is unreadable.`,
      );
    }
    output(`No preview state found for port ${options.port}.`);
    if (options.publisherPreview) markFailure();
    return null;
  }

  let report;
  try {
    report = await createReport(state, {
      publisherPreview: options.publisherPreview,
      requestedPort: options.port,
    });
  } catch (error) {
    if (options.publisherPreview) markFailure();
    throw error;
  }
  output(JSON.stringify(report, null, 2));
  if (
    options.publisherPreview &&
    !isPublisherPreviewStatusReady(report)
  ) {
    markFailure();
  }
  return report;
}

export function createManagedPreviewState(
  options,
  serverPid,
  {
    legacyIdentity = gitIdentity,
    managerPid = process.pid,
    startedAt = new Date().toISOString(),
  } = {},
) {
  return {
    ...(options.publisherPreview ? {} : legacyIdentity()),
    hostname: options.hostname,
    launchToken: options.launchToken,
    logPath: logPath(options.port),
    managerPid,
    mode: options.publisherPreview ? "publisher" : "coherence",
    port: options.port,
    repoRoot,
    serverPid,
    startedAt,
  };
}

async function runManagedPreview(options) {
  ensurePreviewDir();
  writeLog(options.port, `starting preview manager for ${repoRoot}`);

  const log = appendFileSync;
  let server = null;
  let state = null;
  let stopping = false;

  async function stopAndExit(exitCode = 0) {
    if (stopping) return;
    const ownedState = state ?? readState(options.port);
    if (!authenticatePreviewManager(ownedState, options.port)) {
      writeLog(
        options.port,
        "preview manager refused server shutdown because its launch command could not be authenticated",
      );
      return;
    }
    stopping = true;
    let serverStopped;
    try {
      serverStopped = await shutdownManagedPreviewServer(server);
    } catch (error) {
      writeLog(
        options.port,
        `preview manager could not confirm server shutdown: ${error instanceof Error ? error.message : String(error)}`,
      );
      stopping = false;
      return;
    }
    if (!serverStopped) {
      writeLog(
        options.port,
        "preview manager kept ownership because its server did not exit",
      );
      stopping = false;
      return;
    }
    process.exit(exitCode);
  }

  const onInterrupt = () => {
    void stopAndExit(0);
  };
  const onTerminate = () => {
    void stopAndExit(0);
  };
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);

  try {
    if (options.publisherPreview) {
      ({ server, state } = await spawnPublisherPreviewServer(options));
    } else {
      state = await waitForCoherencePendingLifecycleState(options);
      server = spawnPreviewServer(options);
      const proposal = { ...state, serverPid: server.pid };
      writeCoherenceLifecycleProposal(proposal);
      state = await waitForCoherenceLifecyclePromotion(options, proposal);
    }
  } catch (error) {
    if (server) {
      let serverStopped;
      try {
        serverStopped = await shutdownManagedPreviewServer(server);
      } catch (shutdownError) {
        writeLog(
          options.port,
          `preview manager could not confirm startup failure shutdown: ${shutdownError instanceof Error ? shutdownError.message : String(shutdownError)}`,
        );
        return;
      }
      if (!serverStopped) {
        writeLog(
          options.port,
          "preview manager kept ownership after startup failure because its server did not exit",
        );
        return;
      }
    }
    if (!options.publisherPreview) {
      removeCoherenceLifecycleProposalIfValid(options);
    }
    throw error;
  }

  server.stdout.on("data", (chunk) => {
    log(logPath(options.port), chunk);
  });
  server.stderr.on("data", (chunk) => {
    log(logPath(options.port), chunk);
  });

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
    await statusPreview(options);
    return;
  }

  if (options.command === "run") {
    await runManagedPreview(options);
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
