import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "../manuscripts/shared";
import {
  enrichUpdatesSnapshotDeployments,
  generateUpdatesSnapshot,
  getRequiredUpdatesHeadSha,
  shouldRefreshUpdateDeployments,
} from "./generator";

const outputPath = path.join(repoRoot, "src/generated/updates.json");

function readExistingSnapshot(): unknown {
  if (!fs.existsSync(outputPath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(outputPath, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function writeSnapshot(value: unknown): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
    fs.renameSync(temporaryPath, outputPath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const unexpectedArgs = args.filter(
    (arg) => arg !== "--refresh-deployments",
  );
  if (unexpectedArgs.length > 0) {
    throw new Error(`Unknown updates option: ${unexpectedArgs.join(", ")}`);
  }

  const authToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const existingSnapshot = readExistingSnapshot();
  const generated = await generateUpdatesSnapshot({
    authToken,
    existingSnapshot,
    requiredHeadSha: getRequiredUpdatesHeadSha(process.env),
  });
  const result = {
    ...generated,
    snapshot: await enrichUpdatesSnapshotDeployments(generated.snapshot, {
      authToken,
      existingSnapshot,
      environment: process.env,
      refreshDeployments: shouldRefreshUpdateDeployments(
        process.env,
        args.includes("--refresh-deployments"),
      ),
    }),
  };

  if (result.source !== "snapshot") {
    writeSnapshot(result.snapshot);
  } else {
    console.warn(
      `[updates:generate] Using the existing snapshot because Git and GitHub refreshes failed.`,
    );
    for (const failure of result.failures) {
      console.warn(`[updates:generate] ${failure.message}`);
    }
  }

  console.log(
    `Generated ${result.snapshot.commits.length.toLocaleString()} updates from ${result.source}.`,
  );
}

main().catch((error: unknown) => {
  console.error("Failed to generate the updates snapshot.");
  console.error(error);
  process.exitCode = 1;
});
