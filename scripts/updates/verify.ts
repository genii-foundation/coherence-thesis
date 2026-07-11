import fs from "node:fs";
import path from "node:path";
import { parseUpdatesSnapshot } from "../../src/lib/updates";
import { repoRoot } from "../manuscripts/shared";
import { getRequiredUpdatesHeadSha } from "./generator";

const snapshotPath = path.join(repoRoot, "src/generated/updates.json");
const requiredHeadSha =
  process.argv[2]?.trim() || getRequiredUpdatesHeadSha(process.env);

if (!requiredHeadSha) {
  throw new Error(
    "Updates verification requires an expected main head SHA argument or deployment environment.",
  );
}

const snapshot = parseUpdatesSnapshot(
  JSON.parse(fs.readFileSync(snapshotPath, "utf8")) as unknown,
);

if (snapshot.headSha !== requiredHeadSha) {
  throw new Error(
    `Updates snapshot head ${snapshot.headSha} does not match expected main head ${requiredHeadSha}.`,
  );
}

console.log(`Verified Updates history through main commit ${requiredHeadSha}.`);
