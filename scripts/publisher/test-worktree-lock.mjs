import path from "node:path";

import { acquireInstallLock } from "../repository/ensure-node-modules.mjs";
import { generatedPublisherRoot } from "../repository/paths.ts";

const publisherRepositorySourceTestLockPath = path.join(
  generatedPublisherRoot,
  ".repository-source-test-lock",
);

export function acquirePublisherRepositorySourceTestLock() {
  return acquireInstallLock({
    graceMilliseconds: 5_000,
    lockPath: publisherRepositorySourceTestLockPath,
    log: () => {},
    pollMilliseconds: 25,
    timeoutMilliseconds: 150_000,
  });
}
