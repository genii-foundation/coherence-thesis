#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "../..");
const buildIdPath = path.join(repoRoot, ".next", "BUILD_ID");

export const preparedValidationScripts = Object.freeze([
  "editorial:debt",
  "editorial:validate",
  "editorial:checkpoints",
  "editorial:protected-lines",
  // editorial:voice-exemplars was suspended on 2026-07-30 under CTD-0110, when the
  // cards had been prepared from shipped text and the gate validated the condensing
  // pass against itself. Re-enabled 2026-08-01: the cards were re-prepared from the
  // immutable baselines, adopted with the author's rulings, and the nine-volume
  // re-render landed every anchor. At re-enable the gate reported all 71 exemplar
  // anchors present and zero violations, which was the suspension comment's own
  // definition of done.
  "editorial:voice-exemplars",
  "editorial:semantic-links:validate",
  "manuscripts:validate",
  "audio:checkpoints",
  "audio:verify-manuscript-publication",
  "repository:validate-evidence-immutability",
  "repository:validate-layout",
  "repository:validate-agents",
  "repository:validate-admin-status",
  "repository:validate-links",
  "repository:source-boundary",
  "readme:check",
  "typecheck",
  "lint",
  "test",
  "build",
]);

export class ValidationCommandError extends Error {
  constructor(scriptName, exitCode) {
    super(`npm run ${scriptName} failed with exit code ${exitCode}.`);
    this.name = "ValidationCommandError";
    this.exitCode = exitCode;
  }
}

export function resolveRuntimeNpmExecPath({
  environment = process.env,
  execPath = process.execPath,
  pathExists = existsSync,
} = {}) {
  const executableDirectory = path.dirname(execPath);
  const candidates = [
    path.resolve(executableDirectory, "../lib/node_modules/npm/bin/npm-cli.js"),
    path.resolve(executableDirectory, "node_modules/npm/bin/npm-cli.js"),
    environment.npm_execpath,
  ].filter(Boolean);
  const npmExecPath = candidates.find((candidate) => pathExists(candidate));
  if (!npmExecPath) {
    throw new Error(
      "Unable to locate npm beside the active Node runtime. Run validation through an npm script.",
    );
  }
  return npmExecPath;
}

export function createNpmScriptRunner({
  npmExecPath = resolveRuntimeNpmExecPath(),
  run = spawnSync,
} = {}) {
  return function runNpmScript(
    scriptName,
    { environment = {}, ignoreLifecycle = false, scriptArguments = [] } = {},
  ) {
    const args = [npmExecPath, "run"];
    if (ignoreLifecycle) args.push("--ignore-scripts");
    args.push(scriptName);
    if (scriptArguments.length > 0) {
      args.push("--", ...scriptArguments);
    }

    const result = run(process.execPath, args, {
      cwd: repoRoot,
      env: { ...process.env, ...environment },
      stdio: "inherit",
    });

    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new ValidationCommandError(scriptName, result.status ?? 1);
    }
  };
}

export function runStaticValidation(runScript) {
  runScript("manuscripts:prepare");
  for (const scriptName of preparedValidationScripts) {
    runScript(scriptName, { ignoreLifecycle: true });
  }
}

export function findAvailablePort(hostname = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, hostname, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Unable to reserve a validation port."));
        return;
      }

      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

export async function runBuiltE2E(
  runScript,
  {
    allocatePort = findAvailablePort,
    buildExists = () => existsSync(buildIdPath),
    e2eArguments = [],
  } = {},
) {
  if (!buildExists()) {
    throw new Error(
      "No validated production build was found. Run npm run build first, or use npm run validate:ui for the combined gate.",
    );
  }

  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Running Playwright against the existing build at ${baseUrl}.`);
  runScript("test:e2e", {
    environment: {
      COHERENCE_UPDATES_SOURCE: "generated",
      PLAYWRIGHT_BASE_URL: baseUrl,
      PLAYWRIGHT_PREBUILT: "1",
    },
    ignoreLifecycle: true,
    scriptArguments: e2eArguments,
  });
}

export async function runValidation(
  { mode = "static", e2eArguments = [] } = {},
  {
    allocatePort,
    buildExists,
    runScript = createNpmScriptRunner(),
  } = {},
) {
  if (mode === "built-e2e") {
    await runBuiltE2E(runScript, {
      allocatePort,
      buildExists,
      e2eArguments,
    });
    return;
  }

  if (mode !== "static" && mode !== "ui") {
    throw new Error(`Unknown validation mode: ${mode}`);
  }

  runStaticValidation(runScript);
  if (mode === "ui") {
    await runBuiltE2E(runScript, {
      allocatePort,
      buildExists,
      e2eArguments,
    });
  }
}

function parseCommand(args) {
  if (args.length === 0) return { mode: "static", e2eArguments: [] };
  if (args.length === 1 && args[0] === "--ui") {
    return { mode: "ui", e2eArguments: [] };
  }
  if (args[0] === "--built-e2e") {
    return { mode: "built-e2e", e2eArguments: args.slice(1) };
  }
  throw new Error(
    "Usage: run-validation.mjs [--ui | --built-e2e [playwright arguments...]]",
  );
}

async function main() {
  await runValidation(parseCommand(process.argv.slice(2)));
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === scriptPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode =
      error instanceof ValidationCommandError ? error.exitCode : 1;
  });
}
