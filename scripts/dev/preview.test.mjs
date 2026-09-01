import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createSocket } from "node:dgram";
import { EventEmitter, once } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  capturePublisherPreviewCandidateIdentity,
  coherenceLifecycleProposalPath,
  coherenceLifecycleProposalMatchesPending,
  coherenceLifecycleStateMatchesManager,
  createManagedPreviewState,
  createPreviewStatusReport,
  createLaunchToken,
  discardCoherenceLifecycleStateIfExact,
  discardPublisherLifecycleStateIfExact,
  failAfterManagedPreviewCleanup,
  gitIdentity,
  managerCommandArguments,
  managerCommandMatchesLaunch,
  parseArgs,
  persistPublisherPreviewCandidateIdentity,
  promoteCoherenceLifecycleState,
  previewPortIsListening,
  previewServerEnvironment,
  previewStateMatchesLaunch,
  publisherLifecycleStateMatchesManager,
  publisherCandidateEvidencePath,
  publisherOperationOwnsLaunch,
  publisherPreviewOperationIsBusy,
  readPublisherPreviewOperationOwner,
  removePublisherCandidateEvidenceIfValid,
  isPublisherPreviewStatusReady,
  statusPreview,
  stopManagedPreviewState,
  shutdownManagedPreviewServer,
  spawnPublisherPreviewServer,
  verifyPublisherPreviewCandidateIdentity,
  verifyPublisherPreviewReadyAfterCapture,
  waitForCoherenceLifecyclePromotion,
  waitForCoherencePendingLifecycleState,
  waitForPublisherLifecycleState,
  withManagedPreviewMutation,
  writeJsonAtomically,
  writeJsonExclusively,
  withPublisherPreviewOperationLock,
  writeCoherenceLifecycleState,
  writePublisherLifecycleState,
} from "./preview.mjs";

const temporaryDirectories = [];
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "../..");
const defaultLaunchToken = "a".repeat(64);

function managedState(overrides = {}) {
  return {
    hostname: "127.0.0.1",
    launchToken: defaultLaunchToken,
    managerPid: 41_001,
    mode: "publisher",
    port: 55_087,
    repoRoot: projectRoot,
    serverPid: 41_002,
    ...overrides,
  };
}

function coherencePendingState(overrides = {}) {
  const hostname = overrides.hostname ?? "127.0.0.1";
  const launchToken = overrides.launchToken ?? defaultLaunchToken;
  const managerPid = overrides.managerPid ?? 41_001;
  const port = overrides.port ?? 55_087;
  return createManagedPreviewState(
    {
      hostname,
      launchToken,
      port,
      publisherPreview: false,
    },
    null,
    {
      legacyIdentity: () => ({
        branch: "main",
        candidateDigest: "c".repeat(64),
        dirty: false,
        gitSha: "d".repeat(40),
      }),
      managerPid,
      startedAt: "2026-08-31T12:00:00.000Z",
    },
  );
}

function exactManagerCommand(state, overrides = {}) {
  return [
    "/runtime/node/bin/node",
    ...managerCommandArguments({
      hostname: state.hostname,
      launchToken: state.launchToken,
      port: state.port,
      publisherPreview: state.mode === "publisher",
      ...overrides,
    }),
  ];
}

function stopDependencies({ command, listening = false } = {}) {
  return {
    commandReader: vi.fn(() => command),
    discardCoherenceProposal: vi.fn(),
    discardCoherenceState: vi.fn((_state, _port, operation) => {
      operation.beforeDiscard?.();
      return true;
    }),
    discardPublisherEvidence: vi.fn(),
    discardPublisherState: vi.fn((_state, _port, operation) => {
      operation.beforeDiscard?.();
      return true;
    }),
    discardState: vi.fn(),
    operationOwnerMatches: vi.fn(() => true),
    portIsListening: vi.fn().mockResolvedValue(listening),
    processIsAlive: vi.fn(() => false),
    readCoherenceProposal: vi.fn(() => null),
    signal: vi.fn(() => true),
    waitForExit: vi.fn().mockResolvedValue(true),
  };
}

function runGit(cwd, ...args) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function createRepository() {
  const root = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), "coherence-preview-")),
  );
  temporaryDirectories.push(root);
  runGit(root, "init", "-b", "main");
  runGit(root, "config", "user.email", "preview-test@example.com");
  runGit(root, "config", "user.name", "Preview Test");
  writeFileSync(path.join(root, "tracked.txt"), "first\n");
  writeFileSync(path.join(root, ".gitignore"), "/next-env.d.ts\n");
  writeFileSync(path.join(root, "next-env.d.ts"), "generated first\n");
  runGit(root, "add", ".gitignore", "tracked.txt");
  runGit(root, "commit", "-m", "initial");
  return root;
}

function bindUdpPort(port = 0) {
  return new Promise((resolve, reject) => {
    const socket = createSocket({ reuseAddr: false, type: "udp4" });
    socket.once("error", reject);
    socket.bind({ address: "127.0.0.1", exclusive: true, port }, () => {
      resolve(socket);
    });
  });
}

function closeUdpPort(socket) {
  return new Promise((resolve) => socket.close(resolve));
}

async function unusedUdpPort() {
  const socket = await bindUdpPort();
  const { port } = socket.address();
  await closeUdpPort(socket);
  return port;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("preview candidate identity", () => {
  it("changes when tracked or untracked candidate bytes change", () => {
    const root = createRepository();
    const clean = gitIdentity(root);

    expect(clean).toMatchObject({ branch: "main", dirty: false });
    expect(clean.gitSha).toMatch(/^[a-f0-9]{40}$/);

    writeFileSync(path.join(root, "tracked.txt"), "second\n");
    const trackedChange = gitIdentity(root);
    expect(trackedChange.dirty).toBe(true);
    expect(trackedChange.candidateDigest).not.toBe(clean.candidateDigest);

    writeFileSync(path.join(root, "new.txt"), "new\n");
    const untrackedChange = gitIdentity(root);
    expect(untrackedChange.candidateDigest).not.toBe(
      trackedChange.candidateDigest,
    );
  });

  it("ignores generated next-env bytes without masking a tracked copy", () => {
    const root = createRepository();
    const clean = gitIdentity(root);

    writeFileSync(path.join(root, "next-env.d.ts"), "generated second\n");
    expect(gitIdentity(root)).toEqual(clean);

    runGit(root, "add", "-f", "next-env.d.ts");
    runGit(root, "commit", "-m", "track generated declaration");
    const tracked = gitIdentity(root);
    expect(tracked).toMatchObject({ branch: "main", dirty: false });

    writeFileSync(path.join(root, "next-env.d.ts"), "generated third\n");
    const changed = gitIdentity(root);
    expect(changed.dirty).toBe(true);
    expect(changed.candidateDigest).not.toBe(tracked.candidateDigest);
  });
});

describe("authenticated Publisher preview candidate identity", () => {
  it("captures one exact clean candidate through the public Publisher API", async () => {
    const root = createRepository();
    const identity = await capturePublisherPreviewCandidateIdentity(root);

    expect(identity).toMatchObject({
      schemaVersion: "1.0",
      worktreeRoot: root,
      branch: "main",
      dirty: false,
      candidate: {
        entryCount: 2,
        byteCount:
          Buffer.byteLength("/next-env.d.ts\n") +
          Buffer.byteLength("first\n"),
        digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      },
      identityDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    });
    expect(identity.commit).toMatch(/^[0-9a-f]{40}$/u);
    expect(identity.candidate.entries.map(({ path: candidatePath }) =>
      candidatePath
    )).toEqual([".gitignore", "tracked.txt"]);
    expect(Object.isFrozen(identity)).toBe(true);
  });

  it.each([
    [
      "tracked dirty bytes",
      (root) => writeFileSync(path.join(root, "tracked.txt"), "changed\n"),
    ],
    [
      "staged bytes",
      (root) => {
        writeFileSync(path.join(root, "tracked.txt"), "staged\n");
        runGit(root, "add", "tracked.txt");
      },
    ],
    [
      "untracked bytes",
      (root) => writeFileSync(path.join(root, "untracked.txt"), "new\n"),
    ],
  ])("reports exact mismatches for %s", async (_label, mutate) => {
    const root = createRepository();
    const expected = await capturePublisherPreviewCandidateIdentity(root);
    mutate(root);

    const verification = await verifyPublisherPreviewCandidateIdentity(
      expected,
      root,
    );
    expect(verification.matches).toBe(false);
    expect(verification.mismatches).toEqual([
      "dirty",
      "candidate",
      "identity",
    ]);
    expect(verification.actual.dirty).toBe(true);
  });

  it("reports every public mismatch reason in its exact stable order", async () => {
    const root = createRepository();
    const expected = await capturePublisherPreviewCandidateIdentity(root);
    const sibling = realpathSync(
      mkdtempSync(path.join(os.tmpdir(), "coherence-preview-sibling-")),
    );
    temporaryDirectories.push(sibling);
    rmSync(sibling, { recursive: true });
    runGit(root, "worktree", "add", "-b", "changed", sibling);
    runGit(sibling, "commit", "--allow-empty", "-m", "changed commit");
    writeFileSync(path.join(sibling, "tracked.txt"), "changed bytes\n");

    const verification = await verifyPublisherPreviewCandidateIdentity(
      expected,
      sibling,
    );
    expect(verification.matches).toBe(false);
    expect(verification.mismatches).toEqual([
      "worktree",
      "branch",
      "commit",
      "dirty",
      "candidate",
      "identity",
    ]);
  });

  it("rejects Git failure instead of manufacturing a clean identity", async () => {
    const root = realpathSync(
      mkdtempSync(path.join(os.tmpdir(), "coherence-preview-no-git-")),
    );
    temporaryDirectories.push(root);

    await expect(
      capturePublisherPreviewCandidateIdentity(root),
    ).rejects.toThrow("Git rev-parse failed with status 128");
    expect(gitIdentity(root)).toMatchObject({
      branch: null,
      dirty: false,
      gitSha: null,
      candidateDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
  });

  it("rejects an unmerged index", async () => {
    const root = createRepository();
    runGit(root, "checkout", "-b", "divergent");
    writeFileSync(path.join(root, "tracked.txt"), "divergent\n");
    runGit(root, "add", "tracked.txt");
    runGit(root, "commit", "-m", "divergent");
    runGit(root, "checkout", "main");
    writeFileSync(path.join(root, "tracked.txt"), "main\n");
    runGit(root, "add", "tracked.txt");
    runGit(root, "commit", "-m", "main");
    expect(() =>
      execFileSync("git", ["merge", "divergent"], {
        cwd: root,
        stdio: "ignore",
      })
    ).toThrow();

    await expect(
      capturePublisherPreviewCandidateIdentity(root),
    ).rejects.toThrow("unmerged Git index");
  });

  it("rejects malformed and digest-tampered saved evidence", async () => {
    const root = createRepository();
    const identity = await capturePublisherPreviewCandidateIdentity(root);

    await expect(
      verifyPublisherPreviewCandidateIdentity(
        {},
        root,
      ),
    ).rejects.toThrow("Preview identity must contain exactly");

    const tampered = cloneJson(identity);
    tampered.candidate.entries[0].sha256 = `sha256:${"f".repeat(64)}`;
    await expect(
      verifyPublisherPreviewCandidateIdentity(
        tampered,
        root,
      ),
    ).rejects.toThrow("candidate digest does not authenticate its entries");
  });

  it("rejects a candidate path reached through a symbolic-link parent", async () => {
    const root = createRepository();
    const nested = path.join(root, "nested");
    mkdirSync(nested);
    writeFileSync(path.join(nested, "owned.txt"), "owned\n");
    runGit(root, "add", "nested/owned.txt");
    runGit(root, "commit", "-m", "nested");

    const replacement = path.join(root, "replacement");
    mkdirSync(replacement);
    writeFileSync(path.join(replacement, "owned.txt"), "replacement\n");
    rmSync(nested, { recursive: true });
    symlinkSync("replacement", nested, "dir");

    await expect(
      capturePublisherPreviewCandidateIdentity(root),
    ).rejects.toThrow("symbolic-link parent");
  });

  it.each(["tracked", "untracked"])(
    "hashes a final-component %s symbolic link without following its target",
    async (kind) => {
      const root = createRepository();
      const outsideDirectory = realpathSync(
        mkdtempSync(path.join(os.tmpdir(), "coherence-preview-outside-")),
      );
      temporaryDirectories.push(outsideDirectory);
      const outsideTarget = path.join(outsideDirectory, "private.txt");
      const linkPath = path.join(root, "candidate.link");
      writeFileSync(outsideTarget, "outside secret one\n");
      symlinkSync(outsideTarget, linkPath, "file");
      if (kind === "tracked") {
        runGit(root, "add", "candidate.link");
        runGit(root, "commit", "-m", "track symbolic link");
      }

      const first = await capturePublisherPreviewCandidateIdentity(root);
      const firstEntry = first.candidate.entries.find(
        ({ path: candidatePath }) => candidatePath === "candidate.link",
      );
      expect(firstEntry).toEqual({
        bytes: Buffer.byteLength(outsideTarget),
        kind: "symbolic-link",
        path: "candidate.link",
        sha256: `sha256:${createHash("sha256")
          .update(outsideTarget)
          .digest("hex")}`,
      });

      writeFileSync(outsideTarget, "different outside secret bytes\n");
      const second = await capturePublisherPreviewCandidateIdentity(root);
      expect(
        second.candidate.entries.find(
          ({ path: candidatePath }) => candidatePath === "candidate.link",
        ),
      ).toEqual(firstEntry);
      expect(second.identityDigest).toBe(first.identityDigest);
    },
  );

  it("rejects a special candidate file", async () => {
    const root = createRepository();
    const fifoPath = path.join(root, "candidate.fifo");
    writeFileSync(fifoPath, "tracked before replacement\n");
    runGit(root, "add", "candidate.fifo");
    runGit(root, "commit", "-m", "track candidate path");
    rmSync(fifoPath);
    execFileSync("mkfifo", [fifoPath]);

    await expect(
      capturePublisherPreviewCandidateIdentity(root),
    ).rejects.toThrow("neither a regular file nor a symbolic link");
  });

  it(
    "rejects candidate bytes that change during capture",
    async () => {
      const root = createRepository();
      const trackedPath = path.join(root, "tracked.txt");
      writeFileSync(trackedPath, Buffer.alloc(64 * 1024 * 1024, 0x61));
      runGit(root, "add", "tracked.txt");
      runGit(root, "commit", "-m", "large tracked candidate");
      const mutator = spawn(
        process.execPath,
        [
          "-e",
          [
            'const fs = require("node:fs");',
            "const target = process.argv[1];",
            'process.stdout.write("ready\\n");',
            'const timer = setInterval(() => fs.appendFileSync(target, "x"), 0);',
            "setTimeout(() => { clearInterval(timer); process.exit(0); }, 5000);",
          ].join("\n"),
          trackedPath,
        ],
        { stdio: ["ignore", "pipe", "ignore"] },
      );
      await once(mutator.stdout, "data");
      try {
        await expect(
          capturePublisherPreviewCandidateIdentity(root),
        ).rejects.toThrow(/changed|grew/u);
      } finally {
        mutator.kill("SIGTERM");
      }
    },
    10_000,
  );
});

describe("Publisher preview evidence persistence", () => {
  it("uses one deterministic domain-hashed launch token sidecar", () => {
    const directory = mkdtempSync(
      path.join(os.tmpdir(), "coherence-preview-evidence-"),
    );
    temporaryDirectories.push(directory);
    const firstToken = "1".repeat(64);
    const secondToken = "2".repeat(64);
    const firstPath = publisherCandidateEvidencePath(firstToken, directory);

    expect(firstPath).toBe(
      publisherCandidateEvidencePath(firstToken, directory),
    );
    expect(firstPath).not.toContain(firstToken);
    expect(path.dirname(firstPath)).toBe(directory);
    expect(path.basename(firstPath)).toMatch(
      /^publisher-candidate-[0-9a-f]{64}\.json$/u,
    );
    expect(publisherCandidateEvidencePath(secondToken, directory)).not.toBe(
      firstPath,
    );
    expect(() => publisherCandidateEvidencePath("forged", directory)).toThrow(
      "requires a valid launch token",
    );
  });

  it("atomically replaces complete JSON without a partial read window", () => {
    const directory = mkdtempSync(
      path.join(os.tmpdir(), "coherence-preview-atomic-"),
    );
    temporaryDirectories.push(directory);
    const destination = path.join(directory, "evidence.json");
    const oldEvidence = { schemaVersion: "old", entries: ["complete-old"] };
    const newEvidence = {
      schemaVersion: "1.0",
      entries: ["complete-new", "still-complete"],
    };
    writeFileSync(destination, `${JSON.stringify(oldEvidence)}\n`);
    let temporaryPath = null;
    let observedDuringReplace = null;

    writeJsonAtomically(destination, newEvidence, {
      createToken: () => "fixed",
      renameFile: (source, target) => {
        temporaryPath = source;
        observedDuringReplace = JSON.parse(readFileSync(target, "utf8"));
        renameSync(source, target);
      },
    });

    expect(observedDuringReplace).toEqual(oldEvidence);
    expect(JSON.parse(readFileSync(destination, "utf8"))).toEqual(newEvidence);
    expect(() => readFileSync(temporaryPath, "utf8")).toThrow();
  });

  it("authorizes lifecycle writes and exact deletes under one operation owner", () => {
    const state = createManagedPreviewState(
      {
        hostname: "127.0.0.1",
        launchToken: defaultLaunchToken,
        port: 55_087,
        publisherPreview: true,
      },
      null,
      {
        managerPid: 41_001,
        startedAt: "2026-08-31T12:00:00.000Z",
      },
    );
    const operationOwner = {
      pid: process.pid,
      token: state.launchToken,
    };
    const operationOwnerMatches = vi.fn(() => true);
    const writeManagedState = vi.fn();
    const discardState = vi.fn();

    writePublisherLifecycleState(state.port, state, {
      operationOwner,
      operationOwnerMatches,
      writeManagedState,
    });
    expect(
      discardPublisherLifecycleStateIfExact(state, state.port, {
        discardState,
        operationOwner,
        operationOwnerMatches,
        readManagedState: () => state,
      }),
    ).toBe(true);
    expect(writeManagedState).toHaveBeenCalledExactlyOnceWith(
      state.port,
      state,
    );
    expect(operationOwnerMatches.mock.calls).toEqual([
      [state.port, operationOwner],
      [state.port, operationOwner],
    ]);
    expect(discardState).toHaveBeenCalledExactlyOnceWith(state.port);
  });

  it("rejects every noncanonical parent lifecycle publication", () => {
    const state = createManagedPreviewState(
      {
        hostname: "127.0.0.1",
        launchToken: defaultLaunchToken,
        port: 55_087,
        publisherPreview: true,
      },
      null,
      {
        managerPid: 41_001,
        startedAt: "2026-08-31T12:00:00.000Z",
      },
    );
    const operationOwner = {
      pid: process.pid,
      token: state.launchToken,
    };

    for (const malformed of [
      { ...state, serverPid: 41_002 },
      { ...state, unexpected: true },
      { ...state, hostname: "preview.example" },
      { ...state, logPath: "/tmp/forged.log" },
      { ...state, startedAt: "not-a-time" },
    ]) {
      const writeManagedState = vi.fn();
      expect(() =>
        writePublisherLifecycleState(state.port, malformed, {
          operationOwner,
          operationOwnerMatches: vi.fn(() => true),
          writeManagedState,
        })
      ).toThrow("lifecycle write is not owned");
      expect(writeManagedState).not.toHaveBeenCalled();
    }
  });

  it("keeps exact lifecycle ownership if evidence removal fails", () => {
    const state = managedState();
    const discardState = vi.fn();
    const evidenceFailure = new Error("evidence removal failed");

    expect(() =>
      discardPublisherLifecycleStateIfExact(state, state.port, {
        beforeDiscard: () => {
          throw evidenceFailure;
        },
        discardState,
        operationOwner: {
          pid: process.pid,
          token: state.launchToken,
        },
        operationOwnerMatches: vi.fn(() => true),
        readManagedState: () => state,
      })
    ).toThrow(evidenceFailure);
    expect(discardState).not.toHaveBeenCalled();
  });

  it.each([
    ["T2 publishes before delayed T1", "second"],
    ["T1 publishes before T2", "first"],
  ])("never overwrites shared lifecycle state when %s", (_label, winner) => {
    const directory = mkdtempSync(
      path.join(os.tmpdir(), "coherence-preview-exclusive-state-"),
    );
    temporaryDirectories.push(directory);
    const destination = path.join(directory, "dev-55087.json");
    const publisherState = (launchToken, managerPid) => {
      return createManagedPreviewState(
        {
          hostname: "127.0.0.1",
          launchToken,
          port: 55_087,
          publisherPreview: true,
        },
        null,
        {
          managerPid,
          startedAt: "2026-08-31T12:00:00.000Z",
        },
      );
    };
    const firstState = publisherState("1".repeat(64), 41_001);
    const secondState = publisherState("2".repeat(64), 41_011);
    const publish = (state) => {
      writeJsonExclusively(destination, state);
    };

    if (winner === "second") {
      expect(() =>
        writePublisherLifecycleState(firstState.port, firstState, {
          operationOwner: {
            pid: process.pid,
            token: firstState.launchToken,
          },
          operationOwnerMatches: vi.fn(() => true),
          writeManagedState: (_port, value) => {
            publish(secondState);
            publish(value);
          },
        })
      ).toThrow(/EEXIST/u);
      expect(JSON.parse(readFileSync(destination, "utf8"))).toEqual(
        secondState,
      );
      return;
    }

    publish(firstState);
    expect(() => publish(secondState)).toThrow(/EEXIST/u);
    expect(JSON.parse(readFileSync(destination, "utf8"))).toEqual(firstState);
  });

  it("cannot spawn a delayed manager after a successful no-state stop", async () => {
    const options = {
      hostname: "127.0.0.1",
      launchToken: "1".repeat(64),
      port: 55_087,
      publisherPreview: true,
    };
    let stopSucceeded = false;
    const spawnServer = vi.fn();

    await expect(
      spawnPublisherPreviewServer(options, {
        readLifecycleState: (managerOptions) => {
          return waitForPublisherLifecycleState(managerOptions, {
            managerPid: 41_001,
            operationOwnsLaunch: () => !stopSucceeded,
            pause: async () => {
              stopSucceeded = true;
            },
            readManagedState: () => null,
          });
        },
        spawnServer,
      }),
    ).rejects.toThrow(
      "start ownership ended before lifecycle state was published",
    );
    expect(stopSucceeded).toBe(true);
    expect(spawnServer).not.toHaveBeenCalled();
  });

  it("spawns only after an exact parent-published lifecycle state", async () => {
    const options = {
      hostname: "127.0.0.1",
      launchToken: "1".repeat(64),
      port: 55_087,
      publisherPreview: true,
    };
    const state = createManagedPreviewState(options, null, {
      legacyIdentity: vi.fn(() => {
        throw new Error("legacy identity must stay dormant");
      }),
      managerPid: 41_001,
      startedAt: "2026-08-31T12:00:00.000Z",
    });
    const calls = [];
    const server = { pid: 41_002 };

    await expect(
      spawnPublisherPreviewServer(options, {
        managerPid: 41_001,
        readLifecycleState: async () => {
          calls.push("lifecycle");
          return state;
        },
        spawnServer: () => {
          calls.push("spawn");
          return server;
        },
      }),
    ).resolves.toEqual({ server, state });
    expect(calls).toEqual(["lifecycle", "spawn"]);
    expect(publisherLifecycleStateMatchesManager(state, options, 41_001)).toBe(
      true,
    );
    expect(
      publisherLifecycleStateMatchesManager(
        { ...state, serverPid: 41_002 },
        options,
        41_001,
      ),
    ).toBe(false);
    expect(
      publisherLifecycleStateMatchesManager(
        { ...state, mutableSummary: "forged" },
        options,
        41_001,
      ),
    ).toBe(false);
  });

  it("publishes only an exact pending ordinary lifecycle under the shared owner", () => {
    const pendingState = coherencePendingState();
    const operationOwner = {
      pid: process.pid,
      token: pendingState.launchToken,
    };
    const writeManagedState = vi.fn();

    writeCoherenceLifecycleState(pendingState.port, pendingState, {
      operationOwner,
      operationOwnerMatches: vi.fn(() => true),
      writeManagedState,
    });
    expect(writeManagedState).toHaveBeenCalledExactlyOnceWith(
      pendingState.port,
      pendingState,
    );
    expect(
      coherenceLifecycleStateMatchesManager(
        pendingState,
        {
          hostname: pendingState.hostname,
          launchToken: pendingState.launchToken,
          port: pendingState.port,
          publisherPreview: false,
        },
        pendingState.managerPid,
        "pending",
      ),
    ).toBe(true);
    expect(
      coherenceLifecycleProposalPath(pendingState.launchToken),
    ).not.toContain(pendingState.launchToken);
    expect(() =>
      writeCoherenceLifecycleState(
        pendingState.port,
        { ...pendingState, serverPid: 41_002 },
        {
          operationOwner,
          operationOwnerMatches: vi.fn(() => true),
          writeManagedState,
        },
      )
    ).toThrow("lifecycle write is not owned");
  });

  it("promotes only the exact owned pending ordinary lifecycle", () => {
    const pendingState = coherencePendingState();
    const proposal = { ...pendingState, serverPid: 41_002 };
    const operationOwner = {
      pid: process.pid,
      token: pendingState.launchToken,
    };
    let currentState = pendingState;
    const replaceManagedState = vi.fn((_port, value) => {
      expect(currentState).toBe(pendingState);
      currentState = value;
    });

    expect(
      promoteCoherenceLifecycleState(pendingState, proposal, {
        authenticateManager: vi.fn(() => true),
        operationOwner,
        operationOwnerMatches: vi.fn(() => true),
        processIsAlive: vi.fn(() => true),
        readManagedState: () => currentState,
        replaceManagedState,
      }),
    ).toEqual(proposal);
    expect(currentState).toBe(proposal);
    expect(replaceManagedState).toHaveBeenCalledExactlyOnceWith(
      pendingState.port,
      proposal,
    );

    const replacementState = coherencePendingState({
      launchToken: "2".repeat(64),
      managerPid: 41_011,
    });
    const blockedReplace = vi.fn();
    expect(() =>
      promoteCoherenceLifecycleState(pendingState, proposal, {
        authenticateManager: vi.fn(() => true),
        operationOwner,
        operationOwnerMatches: vi.fn(() => true),
        processIsAlive: vi.fn(() => true),
        readManagedState: () => replacementState,
        replaceManagedState: blockedReplace,
      })
    ).toThrow("not the exact owned promotion");
    expect(blockedReplace).not.toHaveBeenCalled();
  });

  it.each([
    ["identity drift", (proposal) => ({ ...proposal, branch: "changed" })],
    ["missing server", (proposal) => ({ ...proposal, serverPid: null })],
    ["manager drift", (proposal) => ({ ...proposal, managerPid: 41_011 })],
    ["extra field", (proposal) => ({ ...proposal, extra: true })],
  ])("rejects ordinary lifecycle proposal %s", (_label, mutate) => {
    const pendingState = coherencePendingState();
    const proposal = mutate({ ...pendingState, serverPid: 41_002 });
    const replaceManagedState = vi.fn();

    expect(() =>
      promoteCoherenceLifecycleState(pendingState, proposal, {
        authenticateManager: vi.fn(() => true),
        operationOwner: {
          pid: process.pid,
          token: pendingState.launchToken,
        },
        operationOwnerMatches: vi.fn(() => true),
        processIsAlive: vi.fn(() => true),
        readManagedState: () => pendingState,
        replaceManagedState,
      })
    ).toThrow("not the exact owned promotion");
    expect(replaceManagedState).not.toHaveBeenCalled();
  });

  it("cleans a pending launch before a delayed manager can survive parent death", async () => {
    const pendingState = coherencePendingState();
    const proposal = { ...pendingState, serverPid: 41_002 };
    const operationOwner = {
      pid: process.pid,
      token: "2".repeat(64),
    };
    let currentState = pendingState;
    let proposalExists = true;
    const dependencies = stopDependencies({
      command: exactManagerCommand(pendingState),
      listening: false,
    });
    dependencies.readCoherenceProposal.mockReturnValue(proposal);
    dependencies.discardCoherenceProposal.mockImplementation(() => {
      proposalExists = false;
    });
    dependencies.discardCoherenceState.mockImplementation(
      (expectedState, targetPort, operation) => {
        return discardCoherenceLifecycleStateIfExact(
          expectedState,
          targetPort,
          {
            beforeDiscard: operation.beforeDiscard,
            discardState: () => {
              currentState = null;
            },
            operationOwner: operation.operationOwner,
            operationOwnerMatches: operation.operationOwnerMatches,
            readManagedState: () => currentState,
          },
        );
      },
    );

    await expect(
      stopManagedPreviewState(
        pendingState,
        {
          hostname: pendingState.hostname,
          port: pendingState.port,
          publisherOperationOwner: operationOwner,
        },
        dependencies,
      ),
    ).resolves.toEqual({ authenticated: true, discarded: true });
    expect(dependencies.signal).toHaveBeenCalledExactlyOnceWith(
      pendingState.managerPid,
    );
    expect(dependencies.waitForExit).toHaveBeenCalledExactlyOnceWith([
      proposal.serverPid,
      pendingState.managerPid,
    ]);
    expect(currentState).toBeNull();
    expect(proposalExists).toBe(false);
    const delayedSpawn = vi.fn();
    await expect(
      (async () => {
        await waitForCoherencePendingLifecycleState(
          {
            hostname: pendingState.hostname,
            launchToken: pendingState.launchToken,
            port: pendingState.port,
            publisherPreview: false,
          },
          {
            managerPid: pendingState.managerPid,
            operationOwnsLaunch: vi.fn(() => false),
            readManagedState: () => currentState,
          },
        );
        delayedSpawn();
      })(),
    ).rejects.toThrow(
      "start ownership ended before pending lifecycle state was published",
    );
    expect(delayedSpawn).not.toHaveBeenCalled();
    await expect(
      waitForCoherenceLifecyclePromotion(
        {
          hostname: pendingState.hostname,
          launchToken: pendingState.launchToken,
          port: pendingState.port,
          publisherPreview: false,
        },
        proposal,
        {
          operationOwnsLaunch: vi.fn(() => false),
          readManagedState: () => currentState,
        },
      ),
    ).rejects.toThrow("state changed before promotion");
  });

  it("preserves pending ownership while an exact proposed server remains alive", async () => {
    const pendingState = coherencePendingState();
    const proposal = { ...pendingState, serverPid: 41_002 };
    const dependencies = stopDependencies({
      command: exactManagerCommand(pendingState),
      listening: false,
    });
    dependencies.readCoherenceProposal.mockReturnValue(proposal);
    dependencies.waitForExit.mockResolvedValue(false);

    await expect(
      stopManagedPreviewState(
        pendingState,
        {
          hostname: pendingState.hostname,
          port: pendingState.port,
          publisherOperationOwner: {
            pid: process.pid,
            token: "2".repeat(64),
          },
        },
        dependencies,
      ),
    ).rejects.toThrow("Preview processes did not stop");
    expect(
      coherenceLifecycleProposalMatchesPending(pendingState, proposal),
    ).toBe(true);
    expect(dependencies.waitForExit).toHaveBeenCalledExactlyOnceWith([
      proposal.serverPid,
      pendingState.managerPid,
    ]);
    expect(dependencies.portIsListening).not.toHaveBeenCalled();
    expect(dependencies.discardCoherenceState).not.toHaveBeenCalled();
    expect(dependencies.discardCoherenceProposal).not.toHaveBeenCalled();
  });

  it("keeps the manager and pending ownership when an unproposed server has not exited", async () => {
    const pendingState = coherencePendingState();
    const server = { pid: 41_002 };
    const signalServer = vi.fn();
    const waitForServerExit = vi.fn().mockResolvedValue(false);
    await expect(
      shutdownManagedPreviewServer(server, {
        signalServer,
        waitForExit: waitForServerExit,
      }),
    ).resolves.toBe(false);
    expect(signalServer).toHaveBeenCalledExactlyOnceWith(server.pid);
    expect(waitForServerExit).toHaveBeenCalledExactlyOnceWith([server.pid]);

    const dependencies = stopDependencies({
      command: exactManagerCommand(pendingState),
      listening: false,
    });
    dependencies.waitForExit.mockResolvedValue(false);
    await expect(
      stopManagedPreviewState(
        pendingState,
        {
          hostname: pendingState.hostname,
          port: pendingState.port,
          publisherOperationOwner: {
            pid: process.pid,
            token: "2".repeat(64),
          },
        },
        dependencies,
      ),
    ).rejects.toThrow("Preview processes did not stop");
    expect(dependencies.readCoherenceProposal).toHaveBeenCalledExactlyOnceWith(
      pendingState.launchToken,
    );
    expect(dependencies.waitForExit).toHaveBeenCalledExactlyOnceWith([
      pendingState.managerPid,
    ]);
    expect(dependencies.discardCoherenceState).not.toHaveBeenCalled();
  });

  it("rejects a nonexact pending proposal before signaling or discard", async () => {
    const pendingState = coherencePendingState();
    const dependencies = stopDependencies({
      command: exactManagerCommand(pendingState),
      listening: false,
    });
    dependencies.readCoherenceProposal.mockReturnValue({
      ...pendingState,
      branch: "changed",
      serverPid: 41_002,
    });

    await expect(
      stopManagedPreviewState(
        pendingState,
        {
          hostname: pendingState.hostname,
          port: pendingState.port,
          publisherOperationOwner: {
            pid: process.pid,
            token: "2".repeat(64),
          },
        },
        dependencies,
      ),
    ).rejects.toThrow("pending lifecycle proposal is not exact");
    expect(dependencies.signal).not.toHaveBeenCalled();
    expect(dependencies.waitForExit).not.toHaveBeenCalled();
    expect(dependencies.discardCoherenceState).not.toHaveBeenCalled();
  });

  it("preserves unauthenticated pending state without a proposal", async () => {
    const pendingState = coherencePendingState();
    const dependencies = stopDependencies({ listening: false });

    await expect(
      stopManagedPreviewState(
        pendingState,
        {
          hostname: pendingState.hostname,
          port: pendingState.port,
          publisherOperationOwner: {
            pid: process.pid,
            token: "2".repeat(64),
          },
        },
        dependencies,
      ),
    ).rejects.toThrow("has no authenticated quiescence proof");
    expect(dependencies.readCoherenceProposal).toHaveBeenCalledExactlyOnceWith(
      pendingState.launchToken,
    );
    expect(dependencies.portIsListening).toHaveBeenCalledExactlyOnceWith(
      pendingState.hostname,
      pendingState.port,
    );
    expect(dependencies.signal).not.toHaveBeenCalled();
    expect(dependencies.discardCoherenceState).not.toHaveBeenCalled();
    expect(dependencies.discardCoherenceProposal).not.toHaveBeenCalled();
  });

  it("preserves unauthenticated pending state with an exact live-server proposal", async () => {
    const pendingState = coherencePendingState();
    const proposal = { ...pendingState, serverPid: 41_002 };
    const dependencies = stopDependencies({ listening: false });
    dependencies.readCoherenceProposal.mockReturnValue(proposal);
    dependencies.processIsAlive.mockImplementation(
      (pid) => pid === proposal.serverPid,
    );

    await expect(
      stopManagedPreviewState(
        pendingState,
        {
          hostname: pendingState.hostname,
          port: pendingState.port,
          publisherOperationOwner: {
            pid: process.pid,
            token: "2".repeat(64),
          },
        },
        dependencies,
      ),
    ).rejects.toThrow("has no authenticated quiescence proof");
    expect(dependencies.processIsAlive).toHaveBeenCalledExactlyOnceWith(
      proposal.serverPid,
    );
    expect(dependencies.signal).not.toHaveBeenCalled();
    expect(dependencies.discardCoherenceState).not.toHaveBeenCalled();
    expect(dependencies.discardCoherenceProposal).not.toHaveBeenCalled();
  });

  it("discards unauthenticated pending state only after its exact proposed server is dead", async () => {
    const pendingState = coherencePendingState();
    const proposal = { ...pendingState, serverPid: 41_002 };
    const operationOwner = {
      pid: process.pid,
      token: "2".repeat(64),
    };
    let currentState = pendingState;
    let proposalExists = true;
    const dependencies = stopDependencies({ listening: false });
    dependencies.readCoherenceProposal.mockReturnValue(proposal);
    dependencies.discardCoherenceProposal.mockImplementation(() => {
      proposalExists = false;
    });
    dependencies.discardCoherenceState.mockImplementation(
      (expectedState, targetPort, operation) => {
        return discardCoherenceLifecycleStateIfExact(
          expectedState,
          targetPort,
          {
            beforeDiscard: operation.beforeDiscard,
            discardState: () => {
              currentState = null;
            },
            operationOwner: operation.operationOwner,
            operationOwnerMatches: operation.operationOwnerMatches,
            readManagedState: () => currentState,
          },
        );
      },
    );

    await expect(
      stopManagedPreviewState(
        pendingState,
        {
          hostname: pendingState.hostname,
          port: pendingState.port,
          publisherOperationOwner: operationOwner,
        },
        dependencies,
      ),
    ).resolves.toEqual({ authenticated: false, discarded: true });
    expect(dependencies.processIsAlive).toHaveBeenCalledExactlyOnceWith(
      proposal.serverPid,
    );
    expect(dependencies.signal).not.toHaveBeenCalled();
    expect(currentState).toBeNull();
    expect(proposalExists).toBe(false);
  });

  it.each([
    "ordinary start and Publisher start",
    "ordinary stop and Publisher start before readiness",
  ])(
    "fails concurrent %s while the full async operation remains locked",
    async () => {
      const directory = mkdtempSync(
        path.join(os.tmpdir(), "coherence-preview-lock-"),
      );
      temporaryDirectories.push(directory);
      const port = await unusedUdpPort();
      let releaseFirst;
      let firstOwner;
      let secondEntered = false;
      const firstGate = new Promise((resolve) => {
        releaseFirst = resolve;
      });
      let markFirstEntered;
      const firstEntered = new Promise((resolve) => {
        markFirstEntered = resolve;
      });

      const first = withManagedPreviewMutation(
        port,
        async (owner) => {
          firstOwner = owner;
          markFirstEntered();
          await firstGate;
          expect(
            readPublisherPreviewOperationOwner(port, { directory }),
          ).toEqual(owner);
        },
        {
          createToken: () => "1".repeat(64),
          directory,
          ownerPid: process.pid,
        },
      );
      await firstEntered;
      await expect(
        withManagedPreviewMutation(
        port,
        async () => {
          secondEntered = true;
        },
        {
          createToken: () => "2".repeat(64),
          directory,
          ownerPid: process.pid,
        },
        ),
      ).rejects.toThrow(`operation is busy for port ${port}`);
      expect(secondEntered).toBe(false);
      await expect(publisherPreviewOperationIsBusy(port)).resolves.toBe(true);
      expect(
        publisherOperationOwnsLaunch(port, firstOwner.token, {
          readOwner: (targetPort) => {
            return readPublisherPreviewOperationOwner(targetPort, {
              directory,
            });
          },
        }),
      ).toBe(true);

      releaseFirst();
      await first;
      await expect(publisherPreviewOperationIsBusy(port)).resolves.toBe(false);
      expect(
        readPublisherPreviewOperationOwner(port, { directory }),
      ).toBeNull();
    },
  );

  it("keeps a delayed ordinary stop from deleting a later Publisher start", async () => {
    const directory = mkdtempSync(
      path.join(os.tmpdir(), "coherence-preview-cross-stop-"),
    );
    temporaryDirectories.push(directory);
    const destination = path.join(directory, "dev-55087.json");
    const port = await unusedUdpPort();
    const ordinaryState = {
      ...managedState({
        launchToken: "1".repeat(64),
        mode: "coherence",
        port,
      }),
      branch: "main",
      candidateDigest: "a".repeat(64),
      dirty: false,
      gitSha: "b".repeat(40),
    };
    writeJsonExclusively(destination, ordinaryState);
    let releaseStop;
    const stopGate = new Promise((resolve) => {
      releaseStop = resolve;
    });
    let markStopEntered;
    const stopEntered = new Promise((resolve) => {
      markStopEntered = resolve;
    });

    const ordinaryStop = withManagedPreviewMutation(
      port,
      async () => {
        expect(JSON.parse(readFileSync(destination, "utf8"))).toEqual(
          ordinaryState,
        );
        markStopEntered();
        await stopGate;
        rmSync(destination);
      },
      { directory, ownerPid: process.pid },
    );
    await stopEntered;
    await expect(
      withManagedPreviewMutation(port, vi.fn(), {
        directory,
        ownerPid: process.pid,
      }),
    ).rejects.toThrow("operation is busy");
    releaseStop();
    await ordinaryStop;

    let publisherState;
    await withManagedPreviewMutation(
      port,
      async (operationOwner) => {
        publisherState = createManagedPreviewState(
          {
            hostname: "127.0.0.1",
            launchToken: operationOwner.token,
            port,
            publisherPreview: true,
          },
          null,
          {
            managerPid: 41_011,
            startedAt: "2026-08-31T12:00:01.000Z",
          },
        );
        writePublisherLifecycleState(port, publisherState, {
          operationOwner,
          operationOwnerMatches: () => true,
          writeManagedState: (_targetPort, value) => {
            writeJsonExclusively(destination, value);
          },
        });
      },
      { directory, ownerPid: process.pid },
    );
    expect(JSON.parse(readFileSync(destination, "utf8"))).toEqual(
      publisherState,
    );
  });

  it("recovers metadata left after a crashed lock owner", async () => {
    const directory = mkdtempSync(
      path.join(os.tmpdir(), "coherence-preview-stale-lock-"),
    );
    temporaryDirectories.push(directory);
    const port = await unusedUdpPort();
    const ownerPath = path.join(
      directory,
      `publisher-operation-${port}.json`,
    );
    writeFileSync(
      ownerPath,
      `${JSON.stringify({ pid: 41_001, token: "1".repeat(64) })}\n`,
    );

    await expect(
      withPublisherPreviewOperationLock(
        port,
        async (owner) => {
          expect(owner).toEqual({
            pid: 41_002,
            token: "2".repeat(64),
          });
        },
        {
          createToken: () => "2".repeat(64),
          directory,
          ownerPid: 41_002,
          processIsAlive: (pid) => pid === 41_002,
        },
      ),
    ).resolves.toBeUndefined();
    expect(
      readPublisherPreviewOperationOwner(port, { directory }),
    ).toBeNull();
  });

  it("does not wedge when acquisition crashes before owner metadata is written", async () => {
    const directory = mkdtempSync(
      path.join(os.tmpdir(), "coherence-preview-owner-write-"),
    );
    temporaryDirectories.push(directory);
    const port = await unusedUdpPort();

    await expect(
      withPublisherPreviewOperationLock(port, vi.fn(), {
        createToken: () => "1".repeat(64),
        directory,
        ownerPid: process.pid,
        writeFile: () => {
          throw new Error("simulated crash before owner write");
        },
      }),
    ).rejects.toThrow("simulated crash before owner write");
    await expect(publisherPreviewOperationIsBusy(port)).resolves.toBe(false);
    expect(
      readPublisherPreviewOperationOwner(port, { directory }),
    ).toBeNull();
    await expect(
      withPublisherPreviewOperationLock(port, async () => "recovered", {
        createToken: () => "2".repeat(64),
        directory,
        ownerPid: process.pid,
      }),
    ).resolves.toBe("recovered");
  });

  it("lets only one contender replace stale metadata", async () => {
    const directory = mkdtempSync(
      path.join(os.tmpdir(), "coherence-preview-two-contender-"),
    );
    temporaryDirectories.push(directory);
    const port = await unusedUdpPort();
    const ownerPath = path.join(
      directory,
      `publisher-operation-${port}.json`,
    );
    writeFileSync(
      ownerPath,
      `${JSON.stringify({ pid: 41_001, token: "1".repeat(64) })}\n`,
    );
    let releaseWinner;
    const winnerGate = new Promise((resolve) => {
      releaseWinner = resolve;
    });
    let winnerOwner;
    let markWinnerEntered;
    const winnerEntered = new Promise((resolve) => {
      markWinnerEntered = resolve;
    });
    const winner = withPublisherPreviewOperationLock(
      port,
      async (owner) => {
        winnerOwner = owner;
        markWinnerEntered();
        await winnerGate;
      },
      {
        createToken: () => "2".repeat(64),
        directory,
        ownerPid: process.pid,
        processIsAlive: (pid) => pid === process.pid,
      },
    );
    await winnerEntered;
    await expect(
      withPublisherPreviewOperationLock(port, vi.fn(), {
        createToken: () => "3".repeat(64),
        directory,
        ownerPid: process.pid,
      }),
    ).rejects.toThrow("operation is busy");
    expect(readPublisherPreviewOperationOwner(port, { directory })).toEqual(
      winnerOwner,
    );
    releaseWinner();
    await winner;
  });

  it("fails on unrelated UDP ownership without touching metadata", async () => {
    const directory = mkdtempSync(
      path.join(os.tmpdir(), "coherence-preview-udp-conflict-"),
    );
    temporaryDirectories.push(directory);
    const unrelatedSocket = await bindUdpPort();
    const { port } = unrelatedSocket.address();
    try {
      await expect(
        withPublisherPreviewOperationLock(port, vi.fn(), {
          directory,
        }),
      ).rejects.toThrow(`operation is busy for port ${port}`);
      expect(
        readPublisherPreviewOperationOwner(port, { directory }),
      ).toBeNull();
    } finally {
      await closeUdpPort(unrelatedSocket);
    }
  });

  it("blocks live stale metadata and releases only an exact owner token", async () => {
    const directory = mkdtempSync(
      path.join(os.tmpdir(), "coherence-preview-exact-owner-"),
    );
    temporaryDirectories.push(directory);
    const port = await unusedUdpPort();
    const ownerPath = path.join(
      directory,
      `publisher-operation-${port}.json`,
    );
    const activeOwner = { pid: process.pid, token: "1".repeat(64) };
    writeFileSync(ownerPath, `${JSON.stringify(activeOwner)}\n`);
    await expect(
      withPublisherPreviewOperationLock(port, vi.fn(), {
        createToken: () => "2".repeat(64),
        directory,
        ownerPid: process.pid,
      }),
    ).rejects.toThrow("metadata has a live owner");
    expect(readPublisherPreviewOperationOwner(port, { directory })).toEqual(
      activeOwner,
    );

    rmSync(ownerPath);
    await expect(
      withPublisherPreviewOperationLock(
        port,
        async () => {
          writeFileSync(
            ownerPath,
            `${JSON.stringify({ pid: 41_002, token: "3".repeat(64) })}\n`,
          );
        },
        {
          createToken: () => "2".repeat(64),
          directory,
          ownerPid: 41_002,
        },
      ),
    ).rejects.toThrow("lock owner changed");
    expect(
      readPublisherPreviewOperationOwner(port, { directory }),
    ).toEqual({ pid: 41_002, token: "3".repeat(64) });
    await expect(publisherPreviewOperationIsBusy(port)).resolves.toBe(false);
  });

  it("persists full evidence while leaving manager lifecycle state immutable", async () => {
    const root = createRepository();
    const identity = await capturePublisherPreviewCandidateIdentity(root);
    const state = managedState();
    const expected = {
      hostname: state.hostname,
      launchToken: state.launchToken,
      managerPid: state.managerPid,
      mode: state.mode,
      port: state.port,
    };
    let storedState = cloneJson(state);
    let storedEvidence = null;
    const authenticateManager = vi.fn(() => true);
    const matchesLaunch = vi.fn(() => true);

    await expect(
      persistPublisherPreviewCandidateIdentity(state, expected, {
        authenticateManager,
        captureCandidate: vi.fn().mockResolvedValue(identity),
        hostRoot: root,
        matchesLaunch,
        readCandidateEvidence: () => cloneJson(storedEvidence),
        readManagedState: () => cloneJson(storedState),
        removeCandidateEvidence: vi.fn(),
        writeCandidateEvidence: (_currentState, evidence) => {
          storedEvidence = cloneJson(evidence);
        },
      }),
    ).resolves.toEqual(identity);
    expect(storedState).toEqual(state);
    expect(storedState).not.toHaveProperty("branch");
    expect(storedState).not.toHaveProperty("publisherCandidateIdentity");
    expect(storedEvidence).toEqual(identity);
    expect(storedEvidence.candidate.entries).toHaveLength(2);
    expect(authenticateManager).toHaveBeenCalledTimes(3);
    expect(matchesLaunch).toHaveBeenCalledTimes(3);
  });

  it("fails before saving when lifecycle ownership changes during capture", async () => {
    const root = createRepository();
    const identity = await capturePublisherPreviewCandidateIdentity(root);
    const state = managedState();
    const replacementState = managedState({
      launchToken: "2".repeat(64),
      managerPid: state.managerPid + 10,
      serverPid: state.serverPid + 10,
    });
    const writeCandidateEvidence = vi.fn();
    const removeCandidateEvidence = vi.fn();

    await expect(
      persistPublisherPreviewCandidateIdentity(
        state,
        {
          hostname: state.hostname,
          launchToken: state.launchToken,
          managerPid: state.managerPid,
          mode: state.mode,
          port: state.port,
        },
        {
          authenticateManager: vi.fn(() => true),
          captureCandidate: vi.fn().mockResolvedValue(identity),
          matchesLaunch: vi.fn(() => true),
          readManagedState: () => replacementState,
          removeCandidateEvidence,
          writeCandidateEvidence,
        },
      ),
    ).rejects.toThrow("manager identity changed before candidate evidence");
    expect(writeCandidateEvidence).not.toHaveBeenCalled();
    expect(removeCandidateEvidence).not.toHaveBeenCalled();
  });

  it("removes captured evidence when the server disappears before ready", async () => {
    const root = createRepository();
    const identity = await capturePublisherPreviewCandidateIdentity(root);
    const state = managedState({ serverPid: null });
    const expected = {
      hostname: state.hostname,
      launchToken: state.launchToken,
      managerPid: state.managerPid,
      mode: state.mode,
      port: state.port,
    };
    let evidenceSaved = false;

    await persistPublisherPreviewCandidateIdentity(state, expected, {
      authenticateManager: vi.fn(() => true),
      captureCandidate: vi.fn().mockResolvedValue(identity),
      matchesLaunch: vi.fn(() => true),
      readCandidateEvidence: () => identity,
      readManagedState: () => state,
      removeCandidateEvidence: () => {
        evidenceSaved = false;
      },
      writeCandidateEvidence: () => {
        evidenceSaved = true;
      },
    });
    expect(evidenceSaved).toBe(true);

    let readinessError;
    try {
      await verifyPublisherPreviewReadyAfterCapture(state, expected, {
        authenticateManager: vi.fn(() => true),
        matchesLaunch: vi.fn(() => true),
        portIsListening: vi.fn().mockResolvedValue(false),
        readManagedState: () => state,
      });
    } catch (error) {
      readinessError = error;
    }
    expect(readinessError).toBeInstanceOf(Error);
    expect(readinessError.message).toContain(
      "server stopped listening during candidate capture",
    );

    const options = {
      hostname: state.hostname,
      port: state.port,
      publisherOperationOwner: {
        pid: process.pid,
        token: state.launchToken,
      },
    };
    const dependencies = stopDependencies({
      command: exactManagerCommand(state),
      listening: false,
    });
    dependencies.discardPublisherEvidence.mockImplementation(() => {
      evidenceSaved = false;
    });

    await expect(
      failAfterManagedPreviewCleanup(
        readinessError,
        state,
        options,
        (failedState, failedOptions) => {
          return stopManagedPreviewState(
            failedState,
            failedOptions,
            dependencies,
          );
        },
      ),
    ).rejects.toBe(readinessError);
    expect(evidenceSaved).toBe(false);
    expect(dependencies.signal).toHaveBeenCalledExactlyOnceWith(
      state.managerPid,
    );
    expect(dependencies.waitForExit).toHaveBeenCalledExactlyOnceWith([
      state.managerPid,
    ]);
  });

  it("keeps T2 lifecycle state when a stopped T1 completes a late evidence rename", async () => {
    const root = createRepository();
    const evidenceDirectory = mkdtempSync(
      path.join(os.tmpdir(), "coherence-preview-race-"),
    );
    temporaryDirectories.push(evidenceDirectory);
    const identity = await capturePublisherPreviewCandidateIdentity(root);
    const firstState = managedState({ launchToken: "1".repeat(64) });
    const secondState = managedState({
      launchToken: "2".repeat(64),
      managerPid: firstState.managerPid + 10,
      serverPid: firstState.serverPid + 10,
    });
    const expected = {
      hostname: firstState.hostname,
      launchToken: firstState.launchToken,
      managerPid: firstState.managerPid,
      mode: firstState.mode,
      port: firstState.port,
    };
    const firstEvidencePath = publisherCandidateEvidencePath(
      firstState.launchToken,
      evidenceDirectory,
    );
    let lifecycleState = cloneJson(firstState);

    await expect(
      persistPublisherPreviewCandidateIdentity(firstState, expected, {
        authenticateManager: (candidate) => {
          return candidate.launchToken === lifecycleState.launchToken;
        },
        captureCandidate: vi.fn().mockResolvedValue(identity),
        matchesLaunch: (candidate) => {
          return candidate.launchToken === expected.launchToken;
        },
        readCandidateEvidence: () => {
          return JSON.parse(readFileSync(firstEvidencePath, "utf8"));
        },
        readManagedState: () => cloneJson(lifecycleState),
        removeCandidateEvidence: () => {
          rmSync(firstEvidencePath, { force: true });
        },
        writeCandidateEvidence: (_currentState, evidence) => {
          rmSync(firstEvidencePath, { force: true });
          lifecycleState = cloneJson(secondState);
          writeJsonAtomically(firstEvidencePath, evidence);
        },
      }),
    ).rejects.toThrow("manager identity changed after candidate evidence");
    expect(lifecycleState).toEqual(secondState);
    expect(
      managerCommandMatchesLaunch(
        secondState,
        exactManagerCommand(secondState),
      ),
    ).toBe(true);
    expect(() => readFileSync(firstEvidencePath, "utf8")).toThrow();
  });
});

describe("Publisher preview status authority", () => {
  it("verifies public evidence, redacts inventory, and ignores summary tampering", async () => {
    const root = createRepository();
    const identity = await capturePublisherPreviewCandidateIdentity(root);
    const state = managedState({
      branch: "forged",
      candidateInventory: ["must-not-leak-either"],
      candidateDigest: "forged",
      dirty: true,
      gitSha: "forged",
      publisherCandidateIdentity: {
        candidate: { entries: ["must-not-leak"] },
      },
    });
    const authenticateManager = vi.fn(() => true);
    const processIsAlive = vi.fn(() => true);

    const report = await createPreviewStatusReport(state, {
      authenticateManager,
      hostRoot: root,
      operationIsBusy: vi.fn(() => false),
      portIsListening: vi.fn().mockResolvedValue(true),
      processIsAlive,
      publisherPreview: true,
      readCandidateEvidence: () => identity,
      readManagedState: () => state,
      requestedPort: state.port,
    });

    expect(report).toMatchObject({
      branch: identity.branch,
      candidateDigest: identity.candidate.digest,
      candidateMatchesStartedPreview: true,
      candidateMismatches: [],
      dirty: identity.dirty,
      gitSha: identity.commit,
      managerAuthenticated: true,
      managerAlive: true,
      publisherCandidateIdentity: {
        identityDigest: identity.identityDigest,
        schemaVersion: "1.0",
        worktreeRoot: root,
      },
      serverAlive: true,
    });
    expect(isPublisherPreviewStatusReady(report)).toBe(true);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(defaultLaunchToken);
    expect(serialized).not.toContain('"entries"');
    expect(serialized).not.toContain("must-not-leak");
    expect(authenticateManager.mock.calls).toEqual([
      [state, state.port],
      [state, state.port],
      [state, state.port],
    ]);
  });

  it("rejects copied mode or port state before identity work", async () => {
    const state = managedState();
    const authenticateManager = vi.fn(() => true);
    const legacyIdentity = vi.fn();
    const readCandidateEvidence = vi.fn();
    const verifyPublisherCandidate = vi.fn();

    await expect(
      createPreviewStatusReport(state, {
        authenticateManager,
        legacyIdentity,
        publisherPreview: false,
        requestedPort: state.port,
      }),
    ).rejects.toThrow("exact coherence managed state");
    await expect(
      createPreviewStatusReport(state, {
        authenticateManager,
        publisherPreview: true,
        readCandidateEvidence,
        requestedPort: state.port + 1,
        verifyPublisherCandidate,
      }),
    ).rejects.toThrow(`exact publisher managed state for port ${state.port + 1}`);
    expect(authenticateManager).not.toHaveBeenCalled();
    expect(legacyIdentity).not.toHaveBeenCalled();
    expect(readCandidateEvidence).not.toHaveBeenCalled();
    expect(verifyPublisherCandidate).not.toHaveBeenCalled();
  });

  it("never derives or reads evidence for unauthenticated state", async () => {
    const state = managedState();
    const readCandidateEvidence = vi.fn();
    const verifyPublisherCandidate = vi.fn();

    await expect(
      createPreviewStatusReport(state, {
        authenticateManager: vi.fn(() => false),
        operationIsBusy: vi.fn(() => false),
        publisherPreview: true,
        readCandidateEvidence,
        readManagedState: () => state,
        requestedPort: state.port,
        verifyPublisherCandidate,
      }),
    ).rejects.toThrow("not the exact authenticated manager state");
    expect(readCandidateEvidence).not.toHaveBeenCalled();
    expect(verifyPublisherCandidate).not.toHaveBeenCalled();
  });

  it("fails busy before Publisher status reads lifecycle or evidence", async () => {
    const readManagedState = vi.fn();
    const markFailure = vi.fn();

    await expect(
      statusPreview(
        {
          hostname: "127.0.0.1",
          port: 55_087,
          publisherPreview: true,
        },
        {
          markFailure,
          operationIsBusy: vi.fn(() => true),
          readManagedState,
          stateFileExists: vi.fn(),
        },
      ),
    ).rejects.toThrow("operation is busy for port 55087");
    expect(markFailure).toHaveBeenCalledOnce();
    expect(readManagedState).not.toHaveBeenCalled();
  });

  it.each([
    ["manager", false, true],
    ["listener", true, false],
  ])(
    "reports a dead %s as nonready",
    async (_label, managerAlive, portListening) => {
    const root = createRepository();
    const identity = await capturePublisherPreviewCandidateIdentity(root);
    const state = managedState();
    const report = await createPreviewStatusReport(state, {
      authenticateManager: vi.fn(() => true),
      hostRoot: root,
      operationIsBusy: vi.fn(() => false),
      portIsListening: vi.fn().mockResolvedValue(portListening),
      processIsAlive: () => managerAlive,
      publisherPreview: true,
      readCandidateEvidence: () => identity,
      readManagedState: () => state,
      requestedPort: state.port,
    });

    expect(report.managerAlive).toBe(managerAlive);
    expect(report.portListening).toBe(portListening);
    expect(report.serverAlive).toBe(portListening);
    expect(isPublisherPreviewStatusReady(report)).toBe(false);
    },
  );

  it("redacts Publisher evidence from an ordinary status report", async () => {
    const currentIdentity = {
      branch: "main",
      candidateDigest: "current",
      dirty: false,
      gitSha: "1".repeat(40),
    };
    const state = managedState({
      candidateDigest: "started",
      mode: "coherence",
      publisherCandidateIdentity: {
        candidate: { entries: ["must-not-leak"] },
      },
    });

    const report = await createPreviewStatusReport(state, {
      authenticateManager: vi.fn(() => true),
      legacyIdentity: vi.fn(() => currentIdentity),
      processIsAlive: vi.fn(() => true),
      publisherPreview: false,
      requestedPort: state.port,
    });

    expect(report).not.toHaveProperty("launchToken");
    expect(report).not.toHaveProperty("publisherCandidateIdentity");
    expect(JSON.stringify(report)).not.toContain("must-not-leak");
    expect(report.currentIdentity).toEqual(currentIdentity);
  });

  it("makes missing and malformed Publisher CLI state nonzero only in Publisher mode", async () => {
    const publisherOptions = {
      hostname: "127.0.0.1",
      port: 55_087,
      publisherPreview: true,
    };
    const output = vi.fn();
    const markMissingFailure = vi.fn();

    await expect(
      statusPreview(publisherOptions, {
        markFailure: markMissingFailure,
        operationIsBusy: vi.fn(() => false),
        output,
        readManagedState: () => null,
        stateFileExists: () => false,
      }),
    ).resolves.toBeNull();
    expect(markMissingFailure).toHaveBeenCalledOnce();
    expect(output).toHaveBeenCalledWith(
      "No preview state found for port 55087.",
    );

    const markMalformedFailure = vi.fn();
    await expect(
      statusPreview(publisherOptions, {
        markFailure: markMalformedFailure,
        operationIsBusy: vi.fn(() => false),
        output: vi.fn(),
        readManagedState: () => null,
        stateFileExists: () => true,
      }),
    ).rejects.toThrow("Publisher preview state for port 55087 is unreadable");
    expect(markMalformedFailure).toHaveBeenCalledOnce();

    const ordinaryFailure = vi.fn();
    await expect(
      statusPreview(
        { ...publisherOptions, publisherPreview: false },
        {
          markFailure: ordinaryFailure,
          output: vi.fn(),
          readManagedState: () => null,
          stateFileExists: () => true,
        },
      ),
    ).resolves.toBeNull();
    expect(ordinaryFailure).not.toHaveBeenCalled();
  });

  it("propagates Publisher verification failure without cleanup or output", async () => {
    const state = managedState();
    const markFailure = vi.fn();
    const output = vi.fn();
    const failure = new Error("malformed authenticated evidence");

    await expect(
      statusPreview(
        {
          hostname: state.hostname,
          port: state.port,
          publisherPreview: true,
        },
        {
          createReport: vi.fn().mockRejectedValue(failure),
          markFailure,
          operationIsBusy: vi.fn(() => false),
          output,
          readManagedState: () => state,
          stateFileExists: () => true,
        },
      ),
    ).rejects.toBe(failure);
    expect(markFailure).toHaveBeenCalledOnce();
    expect(output).not.toHaveBeenCalled();
  });
});

describe("managed Publisher preview boundary", () => {
  it("exposes the dedicated managed commands", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(projectRoot, "package.json"), "utf8"),
    );

    expect(packageJson.scripts).toMatchObject({
      pretypecheck: "npm run manuscripts:prepare",
      "preview:dev:publisher":
        "node scripts/dev/preview.mjs start --publisher",
      "preview:dev:publisher:status":
        "node scripts/dev/preview.mjs status --publisher",
      "preview:dev:publisher:stop":
        "node scripts/dev/preview.mjs stop --publisher",
      typecheck: "next typegen && tsc --noEmit",
    });
    expect(
      readFileSync(path.join(projectRoot, ".gitignore"), "utf8").split(/\r?\n/u),
    ).toContain("/next-env.d.ts");
    expect(
      execFileSync("git", ["ls-files", "--", "next-env.d.ts"], {
        cwd: projectRoot,
        encoding: "utf8",
      }),
    ).toBe("");
    expect(
      readFileSync(path.join(projectRoot, "next.config.ts"), "utf8"),
    ).toContain('? ".next-publisher-preview"');
    expect(
      readFileSync(path.join(projectRoot, "next.config.ts"), "utf8"),
    ).toContain('process.env.NODE_ENV === "development"');
    expect(
      readFileSync(path.join(projectRoot, ".gitignore"), "utf8"),
    ).toContain("/.next-publisher-preview/");
  });

  it("uses separate default ports and records the explicit mode", () => {
    expect(parseArgs(["start"])).toEqual({
      command: "start",
      hostname: "127.0.0.1",
      launchToken: null,
      port: 55082,
      publisherPreview: false,
    });
    expect(parseArgs(["start", "--publisher"])).toEqual({
      command: "start",
      hostname: "127.0.0.1",
      launchToken: null,
      port: 55087,
      publisherPreview: true,
    });
    expect(
      parseArgs(["status", "--publisher", "--port", "55123"]),
    ).toMatchObject({
      command: "status",
      port: 55123,
      publisherPreview: true,
    });

    expect(() =>
      parseArgs(["run", "--port", "55087", "--token", "forged"]),
    ).toThrow("Managed preview requires a valid launch token.");
    expect(
      parseArgs([
        "run",
        "--port",
        "55087",
        "--token",
        defaultLaunchToken,
        "--publisher",
      ]),
    ).toMatchObject({
      command: "run",
      launchToken: defaultLaunchToken,
      port: 55_087,
      publisherPreview: true,
    });
  });

  it("fails closed on malformed or public internal arguments", () => {
    expect(() => parseArgs(["start", "--publisher", "--port"])).toThrow(
      "Missing value for --port.",
    );
    expect(() => parseArgs(["start", "--hostname"])).toThrow(
      "Missing value for --hostname.",
    );
    expect(() => parseArgs(["run", "--token"])).toThrow(
      "Missing value for --token.",
    );
    expect(() => parseArgs(["start", "--publiser"])).toThrow(
      "Unknown preview argument: --publiser",
    );
    expect(() => parseArgs(["start", "--port", "65536"])).toThrow(
      "Invalid preview port: 65536",
    );
    expect(() =>
      parseArgs(["start", "--token", defaultLaunchToken]),
    ).toThrow("The launch token is reserved for the internal run command.");
    expect(() =>
      parseArgs(["status", "--token", defaultLaunchToken]),
    ).toThrow("The launch token is reserved for the internal run command.");
    expect(() =>
      parseArgs(["stop", "--token", defaultLaunchToken]),
    ).toThrow("The launch token is reserved for the internal run command.");
  });

  it("creates a deterministic 256 bit token from injected random bytes", () => {
    const randomBytesFactory = vi.fn(() => Buffer.alloc(32, 0xab));

    expect(createLaunchToken(randomBytesFactory)).toBe("ab".repeat(32));
    expect(randomBytesFactory).toHaveBeenCalledExactlyOnceWith(32);
  });

  it("restricts Publisher preview hosts to proven IPv4 loopback names", () => {
    for (const hostname of [
      "0.0.0.0",
      "192.168.1.10",
      "preview.example",
      "127.0.0.1.example",
      "::1",
      "[::1]",
    ]) {
      expect(() =>
        parseArgs(["start", "--publisher", "--hostname", hostname]),
      ).toThrow("Publisher preview requires a loopback hostname.");
    }

    for (const hostname of ["127.0.0.1", "localhost"]) {
      expect(
        parseArgs(["start", "--publisher", "--hostname", hostname]),
      ).toMatchObject({ hostname, publisherPreview: true });
    }
  });

  it("overrides inherited Publisher mode in normal previews", () => {
    expect(
      previewServerEnvironment(
        false,
        {
          COHERENCE_PUBLISHER_PREVIEW: "1",
          NEXT_E2E_FAST: "1",
          PATH: "/system/bin",
          PRESERVED: "yes",
        },
        "/runtime/node/bin/node",
      ),
    ).toMatchObject({
      COHERENCE_PUBLISHER_PREVIEW: "0",
      NEXT_E2E_FAST: "0",
      NEXT_TELEMETRY_DISABLED: "1",
      NODE_ENV: "development",
      PATH: `/runtime/node/bin${path.delimiter}/system/bin`,
      PRESERVED: "yes",
    });
    expect(
      previewServerEnvironment(true, {}, "/runtime/node/bin/node"),
    ).toMatchObject({
      COHERENCE_PUBLISHER_PREVIEW: "1",
      NEXT_E2E_FAST: "0",
      NEXT_TELEMETRY_DISABLED: "1",
      NODE_ENV: "development",
      PATH: "/runtime/node/bin",
    });
  });

  it("accepts readiness only from the manager that was just launched", () => {
    const current = {
      hostname: "127.0.0.1",
      launchToken: defaultLaunchToken,
      managerPid: process.pid,
      mode: "publisher",
      port: 55_087,
      serverPid: null,
    };
    const expected = {
      hostname: current.hostname,
      launchToken: current.launchToken,
      managerPid: current.managerPid,
      mode: current.mode,
      port: current.port,
    };

    expect(previewStateMatchesLaunch(current, expected)).toBe(true);
    expect(
      previewStateMatchesLaunch(
        { ...current, serverPid: process.pid },
        expected,
      ),
    ).toBe(false);
    expect(
      previewStateMatchesLaunch(current, {
        ...expected,
        launchToken: "b".repeat(64),
      }),
    ).toBe(false);
    expect(
      previewStateMatchesLaunch(current, {
        ...expected,
        managerPid: process.pid + 1,
      }),
    ).toBe(false);
    expect(
      previewStateMatchesLaunch(current, {
        ...expected,
        mode: "coherence",
      }),
    ).toBe(false);
    expect(previewStateMatchesLaunch(null, expected)).toBe(false);
  });

  it("refuses a port that already has an unmanaged listener", async () => {
    const connection = (event) => () => {
      const socket = new EventEmitter();
      socket.destroy = vi.fn();
      socket.setTimeout = vi.fn();
      queueMicrotask(() => socket.emit(event));
      return socket;
    };

    await expect(
      previewPortIsListening(
        "127.0.0.1",
        55087,
        500,
        connection("connect"),
      ),
    ).resolves.toBe(true);
    await expect(
      previewPortIsListening(
        "127.0.0.1",
        55087,
        500,
        connection("error"),
      ),
    ).resolves.toBe(false);
  });
});

describe("managed preview lifecycle ownership", () => {
  const options = {
    hostname: "127.0.0.1",
    port: 55_087,
    publisherOperationOwner: {
      pid: 41_000,
      token: "c".repeat(64),
    },
  };

  it("matches only the exact tokenized manager launch command", () => {
    const state = managedState();

    expect(managerCommandMatchesLaunch(state, exactManagerCommand(state))).toBe(
      true,
    );
    expect(
      managerCommandMatchesLaunch(
        state,
        exactManagerCommand(state, { launchToken: "b".repeat(64) }),
      ),
    ).toBe(false);
    expect(
      managerCommandMatchesLaunch(
        state,
        exactManagerCommand(state, { hostname: "localhost" }),
      ),
    ).toBe(false);
    expect(
      managerCommandMatchesLaunch(
        state,
        exactManagerCommand(state, { port: 55_088 }),
      ),
    ).toBe(false);
    expect(
      managerCommandMatchesLaunch(
        state,
        exactManagerCommand(state, { publisherPreview: false }),
      ),
    ).toBe(false);
    expect(
      managerCommandMatchesLaunch(state, [
        "/runtime/node/bin/node",
        "/other/preview.mjs",
        "run",
      ]),
    ).toBe(false);
    expect(
      managerCommandMatchesLaunch(state, [
        "/runtime/node/bin/node",
        "/other/launcher.mjs",
        ...managerCommandArguments({
          hostname: state.hostname,
          launchToken: state.launchToken,
          port: state.port,
          publisherPreview: true,
        }),
      ]),
    ).toBe(false);
  });

  it("stops an exactly authenticated manager without signaling its server pid", async () => {
    const state = managedState({ hostname: "localhost" });
    const dependencies = stopDependencies({
      command: exactManagerCommand(state),
    });

    await expect(
      stopManagedPreviewState(state, options, dependencies),
    ).resolves.toEqual({ authenticated: true, discarded: true });
    expect(dependencies.commandReader).toHaveBeenCalledExactlyOnceWith(
      state.managerPid,
    );
    expect(dependencies.signal).toHaveBeenCalledExactlyOnceWith(
      state.managerPid,
    );
    expect(dependencies.signal).not.toHaveBeenCalledWith(state.serverPid);
    expect(dependencies.signal).not.toHaveBeenCalledWith(-state.serverPid);
    expect(dependencies.waitForExit).toHaveBeenCalledExactlyOnceWith([
      state.serverPid,
      state.managerPid,
    ]);
    expect(dependencies.portIsListening).toHaveBeenCalledExactlyOnceWith(
      state.hostname,
      state.port,
    );
    expect(
      dependencies.discardPublisherEvidence,
    ).toHaveBeenCalledExactlyOnceWith(state);
    expect(dependencies.discardPublisherState).toHaveBeenCalledExactlyOnceWith(
      state,
      state.port,
      expect.objectContaining({
        operationOwner: options.publisherOperationOwner,
      }),
    );
    expect(dependencies.discardState).not.toHaveBeenCalled();
  });

  it("treats a reused manager pid with a different command as stale", async () => {
    const state = managedState({ serverPid: process.pid });
    const dependencies = stopDependencies({
      command: ["/usr/bin/node", "/unrelated/service.mjs"],
    });

    await expect(
      stopManagedPreviewState(state, options, dependencies),
    ).resolves.toEqual({ authenticated: false, discarded: true });
    expect(dependencies.signal).not.toHaveBeenCalled();
    expect(dependencies.waitForExit).not.toHaveBeenCalled();
    expect(dependencies.discardPublisherState).toHaveBeenCalledExactlyOnceWith(
      state,
      state.port,
      expect.objectContaining({
        operationOwner: options.publisherOperationOwner,
      }),
    );
    expect(dependencies.discardState).not.toHaveBeenCalled();
  });

  it("preserves a not-yet-listening T2 state during late T1 cleanup", async () => {
    const firstState = managedState({ launchToken: "1".repeat(64) });
    const secondState = managedState({
      launchToken: "2".repeat(64),
      managerPid: firstState.managerPid + 10,
      serverPid: firstState.serverPid + 10,
    });
    let currentState = secondState;
    const dependencies = stopDependencies({
      command: ["/usr/bin/node", "/unrelated/service.mjs"],
      listening: false,
    });
    dependencies.discardPublisherState.mockImplementation(
      (expectedState, targetPort, operation) => {
        return discardPublisherLifecycleStateIfExact(
          expectedState,
          targetPort,
          {
            beforeDiscard: operation.beforeDiscard,
            discardState: () => {
              currentState = null;
            },
            operationOwner: operation.operationOwner,
            operationOwnerMatches: operation.operationOwnerMatches,
            readManagedState: () => currentState,
          },
        );
      },
    );

    await expect(
      stopManagedPreviewState(firstState, options, dependencies),
    ).resolves.toEqual({ authenticated: false, discarded: false });
    expect(currentState).toBe(secondState);
    expect(dependencies.portIsListening).toHaveBeenCalledExactlyOnceWith(
      firstState.hostname,
      firstState.port,
    );
    expect(dependencies.discardPublisherEvidence).not.toHaveBeenCalled();
    expect(
      managerCommandMatchesLaunch(
        secondState,
        exactManagerCommand(secondState),
      ),
    ).toBe(true);
  });

  it("checks both safe loopback names before discarding stale state", async () => {
    const state = managedState({ hostname: "localhost" });
    const dependencies = stopDependencies({
      command: ["/usr/bin/node", "/unrelated/service.mjs"],
    });
    dependencies.portIsListening.mockImplementation(async (hostname) => {
      return hostname === "localhost";
    });

    await expect(
      stopManagedPreviewState(state, options, dependencies),
    ).rejects.toThrow(
      "Preview state for port 55087 is unauthenticated while the port is listening.",
    );
    expect(dependencies.portIsListening.mock.calls).toEqual([
      ["127.0.0.1", state.port],
      ["localhost", state.port],
    ]);
    expect(dependencies.signal).not.toHaveBeenCalled();
    expect(dependencies.discardState).not.toHaveBeenCalled();
    expect(dependencies.discardPublisherState).not.toHaveBeenCalled();
  });

  it("discards forged state only when its target port is inactive", async () => {
    const forgedState = managedState({
      launchToken: "corrupt",
      repoRoot: "/forged/worktree",
    });
    const inactive = stopDependencies({ listening: false });
    let currentState = forgedState;
    const removeEvidence = vi.fn();
    inactive.discardPublisherEvidence.mockImplementation((candidate) => {
      return removePublisherCandidateEvidenceIfValid(
        candidate,
        removeEvidence,
      );
    });
    inactive.discardPublisherState.mockImplementation(
      (expectedState, targetPort, operation) => {
        return discardPublisherLifecycleStateIfExact(
          expectedState,
          targetPort,
          {
            beforeDiscard: operation.beforeDiscard,
            discardState: () => {
              currentState = null;
            },
            operationOwner: operation.operationOwner,
            operationOwnerMatches: operation.operationOwnerMatches,
            readManagedState: () => currentState,
          },
        );
      },
    );

    await expect(
      stopManagedPreviewState(forgedState, options, inactive),
    ).resolves.toEqual({ authenticated: false, discarded: true });
    expect(currentState).toBeNull();
    expect(removeEvidence).not.toHaveBeenCalled();
    expect(inactive.commandReader).not.toHaveBeenCalled();
    expect(inactive.signal).not.toHaveBeenCalled();
    expect(inactive.discardPublisherState).toHaveBeenCalledExactlyOnceWith(
      forgedState,
      forgedState.port,
      expect.objectContaining({
        operationOwner: options.publisherOperationOwner,
      }),
    );
    expect(inactive.discardState).not.toHaveBeenCalled();

    const listening = stopDependencies({ listening: true });
    await expect(
      stopManagedPreviewState(forgedState, options, listening),
    ).rejects.toThrow(
      "Preview state for port 55087 is unauthenticated while the port is listening.",
    );
    expect(listening.signal).not.toHaveBeenCalled();
    expect(listening.discardState).not.toHaveBeenCalled();
    expect(listening.discardPublisherState).not.toHaveBeenCalled();
  });

  it("never probes a malformed or forged state hostname", async () => {
    const hostileConversion = vi.fn(() => "localhost");
    const malformedState = managedState({
      hostname: { toString: hostileConversion },
    });
    const malformedDependencies = stopDependencies({ listening: false });

    await expect(
      stopManagedPreviewState(
        malformedState,
        options,
        malformedDependencies,
      ),
    ).resolves.toEqual({ authenticated: false, discarded: true });
    expect(hostileConversion).not.toHaveBeenCalled();
    expect(malformedDependencies.portIsListening.mock.calls).toEqual([
      ["127.0.0.1", options.port],
    ]);

    const forgedState = managedState({ hostname: "preview.example" });
    const forgedDependencies = stopDependencies({ listening: false });
    await stopManagedPreviewState(forgedState, options, forgedDependencies);
    expect(forgedDependencies.portIsListening.mock.calls).toEqual([
      ["127.0.0.1", options.port],
    ]);

    const noSafeProbe = stopDependencies({ listening: false });
    await expect(
      stopManagedPreviewState(
        forgedState,
        {
          hostname: "also.example",
          port: options.port,
          publisherOperationOwner: options.publisherOperationOwner,
        },
        noSafeProbe,
      ),
    ).rejects.toThrow("has no safe loopback hostname to probe");
    expect(noSafeProbe.portIsListening).not.toHaveBeenCalled();
    expect(noSafeProbe.signal).not.toHaveBeenCalled();
    expect(noSafeProbe.discardState).not.toHaveBeenCalled();
    expect(noSafeProbe.discardPublisherState).not.toHaveBeenCalled();
  });

  it("never signals a manager or server when the launch token mismatches", async () => {
    const state = managedState({ serverPid: process.pid });
    const dependencies = stopDependencies({
      command: exactManagerCommand(state, {
        launchToken: "b".repeat(64),
      }),
    });

    await stopManagedPreviewState(state, options, dependencies);
    expect(dependencies.signal).not.toHaveBeenCalled();
    expect(dependencies.waitForExit).not.toHaveBeenCalled();
  });

  it("keeps ownership state when an authenticated stop leaves a listener", async () => {
    const state = managedState();
    const dependencies = stopDependencies({
      command: exactManagerCommand(state),
      listening: true,
    });

    await expect(
      stopManagedPreviewState(state, options, dependencies),
    ).rejects.toThrow(
      "Preview manager stopped but port 55087 is still listening.",
    );
    expect(dependencies.signal).toHaveBeenCalledExactlyOnceWith(
      state.managerPid,
    );
    expect(dependencies.discardState).not.toHaveBeenCalled();
    expect(dependencies.discardPublisherState).not.toHaveBeenCalled();
    expect(dependencies.discardPublisherEvidence).not.toHaveBeenCalled();
  });

  it("routes failed starts through the authenticated cleanup boundary", () => {
    const source = readFileSync(
      path.join(projectRoot, "scripts/dev/preview.mjs"),
      "utf8",
    );
    const managerLifecycle = source.slice(
      source.indexOf("function runManagedPreview"),
      source.indexOf("async function main"),
    );
    const publicMutationLifecycle = source.slice(
      source.indexOf("async function startPreview"),
      source.indexOf("export async function statusPreview"),
    );

    expect(source).toContain(
      "await failAfterManagedPreviewCleanup(error, launchState, {",
    );
    expect(source.indexOf("await verifyPublisherPreviewReadyAfterCapture(")).toBeLessThan(
      source.indexOf("console.log(`Preview ready: ${url}`)"),
    );
    expect(source).not.toContain("killProcess(child.pid)");
    expect(source).not.toContain("killProcessGroup(failedState.serverPid)");
    expect(
      publicMutationLifecycle.match(/withManagedPreviewMutation/gu),
    ).toHaveLength(2);
    expect(managerLifecycle).toContain(
      "state = await waitForCoherencePendingLifecycleState(options)",
    );
    expect(managerLifecycle).toContain(
      "writeCoherenceLifecycleProposal(proposal)",
    );
    expect(managerLifecycle).toContain(
      "waitForCoherenceLifecyclePromotion(options, proposal)",
    );
    expect(managerLifecycle).toContain(
      "serverStopped = await shutdownManagedPreviewServer(server)",
    );
    expect(
      managerLifecycle.indexOf(
        "serverStopped = await shutdownManagedPreviewServer(server)",
      ),
    ).toBeLessThan(managerLifecycle.indexOf("process.exit(exitCode)"));
    expect(managerLifecycle).not.toContain("removeState(options.port)");
  });
});
