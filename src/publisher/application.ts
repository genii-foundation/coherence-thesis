import "server-only";
import fs from "node:fs";
import path from "node:path";
import {
  createPublicationNextApplication,
  type PublicationNextApplication,
} from "@genii-foundation/publisher-next/server";
import {
  PUBLISHER_NEXT_EXTENSION_DATA_PATH,
  PUBLISHER_NEXT_READER_DATA_PATH,
} from "@genii-foundation/publisher-next/host";
import { createCoherencePublisherApplicationOptions } from "@/publisher/application-config";
import { createCoherencePublisherEmbeddedOfflineAuthority } from "@/publisher/embedded-offline-authority";
import { projectCoherencePublisherEmbeddedAppearance } from "@/publisher/embedded-reader-appearance";
import { createCoherencePublisherAudioWordAuthority } from "@/publisher/legacy-audio-word-bridge";
import { validateCoherencePublisherRuntimeMigrationArtifacts } from "@/publisher/runtime-artifact-validation";
import { COHERENCE_READER_STATE_MIGRATION_HREF } from "@/publisher/reader-state-migration-schema";
import {
  createCoherencePublisherTransitionPreviewApplication,
  type CoherencePublisherTransitionPreviewRuntime,
} from "@/publisher/transition-preview-application";

export type CoherencePublisherApplicationRedirect = Readonly<{
  status: 308;
  targetHref: string;
}>;

type CoherencePublisherApplicationRuntime = Readonly<{
  previewRuntime: CoherencePublisherTransitionPreviewRuntime;
  redirectBySourceHref: ReadonlyMap<
    string,
    CoherencePublisherApplicationRedirect
  >;
}>;

let applicationRuntimePromise:
  | Promise<CoherencePublisherApplicationRuntime>
  | undefined;

function createCoherencePublisherRedirectIndex(
  application: PublicationNextApplication,
): ReadonlyMap<string, CoherencePublisherApplicationRedirect> {
  const redirectBySourceHref = new Map<
    string,
    CoherencePublisherApplicationRedirect
  >();
  for (const redirect of application.reader.routes.redirects) {
    if (redirectBySourceHref.has(redirect.from)) {
      throw new TypeError(
        `Coherence Publisher application has a duplicate explicit redirect source: ${redirect.from}`,
      );
    }
    if (redirect.status !== 308) {
      throw new TypeError(
        `Coherence Publisher application preview supports only explicit 308 redirects: ${redirect.from}`,
      );
    }
    redirectBySourceHref.set(
      redirect.from,
      Object.freeze({ status: 308, targetHref: redirect.to }),
    );
  }
  return redirectBySourceHref;
}

async function createCoherencePublisherApplicationRuntime(): Promise<
  CoherencePublisherApplicationRuntime
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
  const legacyCatalog = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "generated", "manuscripts", "catalog.json"),
      "utf8",
    ),
  ) as unknown;
  const audioManifest = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "publishing", "audio", "manifest.json"),
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
  const migrationBinding = validateCoherencePublisherRuntimeMigrationArtifacts({
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
  const application =
    createCoherencePublisherTransitionPreviewApplication(created.value);
  const themeAppearance = projectCoherencePublisherEmbeddedAppearance(
    created.value.theme,
  );
  const narrationWordAuthority = createCoherencePublisherAudioWordAuthority({
    audioManifest,
    legacyCatalog,
    migrationArtifact: migrationBinding.migrationArtifact,
    reader: created.value.reader,
  });
  const offlineAuthority = createCoherencePublisherEmbeddedOfflineAuthority({
    application: created.value,
    extensionBuildId: migrationBinding.extensionData.buildId,
    migrationBuildId: migrationBinding.migrationArtifact.buildId,
    narrationBuildId: narrationWordAuthority.buildId,
    themeAppearance,
  });
  return Object.freeze({
    previewRuntime: Object.freeze({
      application,
      migrationArtifact: migrationBinding.migrationArtifact,
      narrationWordAuthority,
      offlineAuthority,
      themeAppearance,
    }),
    redirectBySourceHref: createCoherencePublisherRedirectIndex(created.value),
  });
}

function loadCoherencePublisherApplicationRuntimeInternal(): Promise<
  CoherencePublisherApplicationRuntime
> {
  applicationRuntimePromise ??=
    createCoherencePublisherApplicationRuntime();
  return applicationRuntimePromise;
}

export async function loadCoherencePublisherApplicationRuntime(): Promise<
  CoherencePublisherTransitionPreviewRuntime
> {
  return (await loadCoherencePublisherApplicationRuntimeInternal()).previewRuntime;
}

export async function resolveCoherencePublisherApplicationRedirect(
  sourceHref: string,
): Promise<CoherencePublisherApplicationRedirect | null> {
  return (
    (await loadCoherencePublisherApplicationRuntimeInternal()).redirectBySourceHref.get(
      sourceHref,
    ) ?? null
  );
}
