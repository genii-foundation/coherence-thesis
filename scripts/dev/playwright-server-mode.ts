import { createHash } from "node:crypto";
import path from "node:path";

export function resolvePlaywrightServerMode(
  environment: Readonly<Record<string, string | undefined>>,
): "fast" | "prebuilt" | "full" {
  if (environment.PLAYWRIGHT_PREBUILT === "1") return "prebuilt";
  if (environment.PLAYWRIGHT_FAST === "1") return "fast";
  return "full";
}

// Fast mode used a fixed port for every checkout. Combined with Playwright's
// reuseExistingServer, the first worktree to start a server served every other
// worktree's tests, so a run in one worktree silently exercised another
// checkout's code and neither run reported anything wrong. Deriving the port
// from the checkout path gives each worktree its own server while repeated runs
// in one worktree still reuse it.
//
// This module stays free of import.meta and child_process so that Playwright can
// require it from a CommonJS transpile of playwright.config.ts. The process
// entry point lives in e2e-dev-server.ts.

// Ports stay inside one documented band so a stray listener is easy to reason
// about. 3100 is the production preview and sits deliberately outside it.
export const fastE2ePortBase = 3200;
export const fastE2ePortCount = 100;

// Every npm script in this repository runs from the package root, which is the
// checkout root, so the working directory identifies the checkout for both the
// Playwright config and the server entry point.
export function resolveFastE2ePort(rootDir: string = process.cwd()): number {
  const digest = createHash("sha256").update(path.resolve(rootDir)).digest();
  return fastE2ePortBase + (digest.readUInt16BE(0) % fastE2ePortCount);
}

export function resolveFastE2eAddress(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  rootDir: string = process.cwd(),
): { hostname: string; port: number } {
  const configuredUrl = environment.PLAYWRIGHT_BASE_URL?.trim();
  if (!configuredUrl) {
    return { hostname: "127.0.0.1", port: resolveFastE2ePort(rootDir) };
  }

  const url = new URL(configuredUrl);
  if (url.protocol !== "http:") {
    throw new Error("Fast browser suite URLs must use http.");
  }

  const port = Number(url.port || 80);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid fast browser suite port: ${url.port}`);
  }

  return { hostname: url.hostname, port };
}

export function resolveFastE2eBaseUrl(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  rootDir: string = process.cwd(),
): string {
  const { hostname, port } = resolveFastE2eAddress(environment, rootDir);
  return `http://${hostname}:${port}`;
}
