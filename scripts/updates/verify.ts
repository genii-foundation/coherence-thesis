import fs from "node:fs";
import { parseUpdatesSnapshot } from "../../src/lib/updates";
import {
  generatedUpdatesSnapshotPath,
  updatesSnapshotPath,
} from "../repository/paths";
import { getRequiredUpdatesHeadSha } from "./generator";

const args = process.argv.slice(2);
const useGenerated = args[0] === "--generated";
if (useGenerated) args.shift();
if (args.length > 1) {
  throw new Error("Updates verification accepts one expected revision.");
}
const snapshotPath = useGenerated
  ? generatedUpdatesSnapshotPath
  : updatesSnapshotPath;
const requiredHeadSha =
  args[0]?.trim() || getRequiredUpdatesHeadSha(process.env);

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
