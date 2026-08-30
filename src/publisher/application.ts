import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createPublicationNextApplication } from "@genii-foundation/publisher-next/server";
import {
  PUBLISHER_NEXT_EXTENSION_DATA_PATH,
  PUBLISHER_NEXT_READER_DATA_PATH,
} from "@genii-foundation/publisher-next/host";
import { createCoherencePublisherApplicationOptions } from "@/publisher/application-config";
import { validateCoherencePublisherRuntimeMigrationArtifacts } from "@/publisher/runtime-artifact-validation";
import { COHERENCE_READER_STATE_MIGRATION_HREF } from "@/publisher/reader-state-migration-schema";
import {
  createCoherencePublisherTransitionPreviewApplication,
  type CoherencePublisherTransitionPreviewApplication,
} from "@/publisher/transition-preview-application";

let applicationPromise:
  | Promise<CoherencePublisherTransitionPreviewApplication>
  | undefined;

async function createCoherencePublisherApplication(): Promise<
  CoherencePublisherTransitionPreviewApplication
> {
  const hostRoot = path.join(process.cwd(), "generated", "publisher", "host");
  const reader = JSON.parse(
    fs.readFileSync(path.join(hostRoot, PUBLISHER_NEXT_READER_DATA_PATH), "utf8"),
  ) as unknown;
  const extensionData = JSON.parse(
    fs.readFileSync(
      path.join(hostRoot, PUBLISHER_NEXT_EXTENSION_DATA_PATH),
      "utf8",
    ),
  ) as unknown;
  const migrationText = fs.readFileSync(
    path.join(
      process.cwd(),
      "public",
      COHERENCE_READER_STATE_MIGRATION_HREF.slice(1),
    ),
    "utf8",
  );
  validateCoherencePublisherRuntimeMigrationArtifacts({
    reader,
    extensionData,
    migrationText,
  });
  const created = await createPublicationNextApplication(
    createCoherencePublisherApplicationOptions({ reader }),
  );
  if (!created.valid) {
    throw new TypeError(
      `Coherence Publisher application failed: ${created.diagnostics
        .map(({ code, path: diagnosticPath }) =>
          `${code}${diagnosticPath.length === 0 ? "" : ` ${diagnosticPath}`}`,
        )
        .join(", ")}`,
    );
  }
  return createCoherencePublisherTransitionPreviewApplication(created.value);
}

export function loadCoherencePublisherApplication(): Promise<
  CoherencePublisherTransitionPreviewApplication
> {
  applicationPromise ??= createCoherencePublisherApplication();
  return applicationPromise;
}
