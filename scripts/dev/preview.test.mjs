import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLaunchToken,
  gitIdentity,
  managerCommandArguments,
  managerCommandMatchesLaunch,
  parseArgs,
  previewPortIsListening,
  previewServerEnvironment,
  previewStateMatchesLaunch,
  stopManagedPreviewState,
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
    discardState: vi.fn(),
    portIsListening: vi.fn().mockResolvedValue(listening),
    signal: vi.fn(() => true),
    waitForExit: vi.fn().mockResolvedValue(true),
  };
}

function runGit(cwd, ...args) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function createRepository() {
  const root = mkdtempSync(path.join(os.tmpdir(), "coherence-preview-"));
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
      serverPid: process.pid,
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
    expect(dependencies.discardState).toHaveBeenCalledExactlyOnceWith(
      state.port,
    );
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
    expect(dependencies.discardState).toHaveBeenCalledExactlyOnceWith(
      state.port,
    );
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
  });

  it("discards forged state only when its target port is inactive", async () => {
    const forgedState = managedState({
      launchToken: "corrupt",
      repoRoot: "/forged/worktree",
    });
    const inactive = stopDependencies({ listening: false });

    await expect(
      stopManagedPreviewState(forgedState, options, inactive),
    ).resolves.toEqual({ authenticated: false, discarded: true });
    expect(inactive.commandReader).not.toHaveBeenCalled();
    expect(inactive.signal).not.toHaveBeenCalled();
    expect(inactive.discardState).toHaveBeenCalledExactlyOnceWith(
      forgedState.port,
    );

    const listening = stopDependencies({ listening: true });
    await expect(
      stopManagedPreviewState(forgedState, options, listening),
    ).rejects.toThrow(
      "Preview state for port 55087 is unauthenticated while the port is listening.",
    );
    expect(listening.signal).not.toHaveBeenCalled();
    expect(listening.discardState).not.toHaveBeenCalled();
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
        { hostname: "also.example", port: options.port },
        noSafeProbe,
      ),
    ).rejects.toThrow("has no safe loopback hostname to probe");
    expect(noSafeProbe.portIsListening).not.toHaveBeenCalled();
    expect(noSafeProbe.signal).not.toHaveBeenCalled();
    expect(noSafeProbe.discardState).not.toHaveBeenCalled();
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

    expect(source).toContain(
      "await stopManagedPreviewState(launchState, options);",
    );
    expect(source).not.toContain("killProcess(child.pid)");
    expect(source).not.toContain("killProcessGroup(failedState.serverPid)");
    expect(managerLifecycle).not.toContain("removeState(options.port)");
  });
});
