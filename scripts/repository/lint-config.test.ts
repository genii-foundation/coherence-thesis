import path from "node:path";
import { ESLint } from "eslint";
import { expect, it } from "vitest";
import { repoRoot } from "./paths";

it("excludes each Next build output without excluding publication source", async () => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const directory of [".next", ".next-e2e", ".next-publisher-preview"]) {
    expect(await eslint.isPathIgnored(
      path.join(repoRoot, directory, "dev", "types", "validator.ts"),
    )).toBe(true);
  }
  for (const source of [
    "src/publisher/coherence-theme.ts",
    "scripts/publisher/theme-host-proof.ts",
    "scripts/repository/lint-config.test.ts",
  ]) {
    expect(await eslint.isPathIgnored(path.join(repoRoot, source))).toBe(false);
  }
});
