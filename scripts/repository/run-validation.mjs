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
  "manuscripts:validate",
  "repository:validate-layout",
  "repository:validate-agents",
  "repository:source-boundary",
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

export function createNpmScriptRunner({
  npmExecPath = process.env.npm_execpath,
  run = spawnSync,
} = {}) {
  if (!npmExecPath) {
    throw new Error(
      "Unable to locate npm. Run validation through an npm script.",
    );
  }

  return function runNpmScript(
    scriptName,
    { environment = {}, ignoreLifecycle = false } = {},
  ) {
    const args = [npmExecPath];
    if (ignoreLifecycle) args.push("--ignore-scripts");
    args.push("run", scriptName);

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
      PLAYWRIGHT_BASE_URL: baseUrl,
      PLAYWRIGHT_PREBUILT: "1",
    },
    ignoreLifecycle: true,
  });
}

export async function runValidation(
  { mode = "static" } = {},
  {
    allocatePort,
    buildExists,
    runScript = createNpmScriptRunner(),
  } = {},
) {
  if (mode === "built-e2e") {
    await runBuiltE2E(runScript, { allocatePort, buildExists });
    return;
  }

  if (mode !== "static" && mode !== "ui") {
    throw new Error(`Unknown validation mode: ${mode}`);
  }

  runStaticValidation(runScript);
  if (mode === "ui") {
    await runBuiltE2E(runScript, { allocatePort, buildExists });
  }
}

function parseMode(args) {
  if (args.length === 0) return "static";
  if (args.length === 1 && args[0] === "--ui") return "ui";
  if (args.length === 1 && args[0] === "--built-e2e") return "built-e2e";
  throw new Error("Usage: run-validation.mjs [--ui | --built-e2e]");
}

async function main() {
  await runValidation({ mode: parseMode(process.argv.slice(2)) });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === scriptPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode =
      error instanceof ValidationCommandError ? error.exitCode : 1;
  });
}
