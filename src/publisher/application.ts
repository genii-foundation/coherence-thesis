import "server-only";
import fs from "node:fs";
import path from "node:path";
import {
  createPublicationNextApplication,
  type PublicationNextApplication,
} from "@genii-foundation/publisher-next/server";
import { createCoherencePublisherApplicationOptions } from "@/publisher/application-config";

let applicationPromise: Promise<PublicationNextApplication> | undefined;

async function createCoherencePublisherApplication(): Promise<PublicationNextApplication> {
  const readerPath = path.join(
    process.cwd(),
    "generated",
    "publisher",
    "host",
    "publication-reader.json",
  );
  const reader = JSON.parse(fs.readFileSync(readerPath, "utf8")) as unknown;
  const created = await createPublicationNextApplication(
    createCoherencePublisherApplicationOptions(reader),
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
  return created.value;
}

export function loadCoherencePublisherApplication(): Promise<PublicationNextApplication> {
  applicationPromise ??= createCoherencePublisherApplication();
  return applicationPromise;
}
