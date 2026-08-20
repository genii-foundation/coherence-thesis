import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PublicationNextApplication } from "@genii-foundation/publisher-next/server";
import { resolveDefaultPublisherNextTheme } from "@genii-foundation/publisher-next/theme/default";
import type { Diagnostic } from "@genii-foundation/publisher-schema";
import { coherenceReaderStateBootstrap } from "../../src/publisher/reader-state-bootstrap";
import {
  createPublisherReaderBuild,
  defaultPublisherReaderBuildPaths,
  type PublisherReaderBuildPaths,
} from "./reader-build";

export type PublisherApplicationProofOptions = {
  paths?: PublisherReaderBuildPaths;
};

export type PublisherApplicationProofSummary = {
  proofScope: "application assembly";
  contentParity: "not asserted";
  publicationId: string;
  readerBuildId: string;
  applicationBuildId: string;
  workCount: number;
  sectionCount: number;
  blockCount: number;
  wordCount: number;
  routeCount: number;
  staticParamCount: number;
  slashPolicy: PublicationNextApplication["slashPolicy"];
  themePackage: string;
  readerStateBootstrapPackage: string;
  integrations: {
    audio: false;
    extensions: false;
    sync: false;
    updates: false;
  };
};

export type PublisherApplicationProof = {
  readerBuild: Awaited<ReturnType<typeof createPublisherReaderBuild>>;
  application: PublicationNextApplication;
  summary: PublisherApplicationProofSummary;
};

const supportedOptionKeys = Object.freeze(new Set<PropertyKey>(["paths"]));

type CreatePublicationNextApplication =
  typeof import("@genii-foundation/publisher-next/server")["createPublicationNextApplication"];

async function loadCreatePublicationNextApplication(): Promise<CreatePublicationNextApplication> {
  try {
    const server = await import("@genii-foundation/publisher-next/server");
    return server.createPublicationNextApplication;
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("only be used from a Server Component")
    ) {
      throw error;
    }
    const server = await import(
      "../../node_modules/@genii-foundation/publisher-next/dist/server/application.js"
    );
    return server.createPublicationNextApplication;
  }
}

function resolvePaths(
  options: PublisherApplicationProofOptions,
): PublisherReaderBuildPaths {
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options)
  ) {
    throw new TypeError("Publisher application proof options must be an object.");
  }
  for (const key of Reflect.ownKeys(options)) {
    if (!supportedOptionKeys.has(key)) {
      throw new TypeError(
        `Publisher application proof refuses unsupported integration option ${String(key)}.`,
      );
    }
  }
  return options.paths ?? defaultPublisherReaderBuildPaths;
}

function diagnosticsText(diagnostics: readonly Diagnostic[]): string {
  return diagnostics
    .map(({ code, documentPath, path }) =>
      [code, documentPath, path].filter(Boolean).join(" "),
    )
    .join("\n");
}

function assertReaderSlice(
  readerBuild: Awaited<ReturnType<typeof createPublisherReaderBuild>>,
): void {
  const updatesRoute = readerBuild.built.reader.routes.active.find(
    ({ target }) => target.kind === "updates",
  );
  if (updatesRoute !== undefined) {
    throw new TypeError(
      `Publisher application proof refuses Updates route ${updatesRoute.path}.`,
    );
  }
}

function assertApplicationIdentity(
  readerBuild: Awaited<ReturnType<typeof createPublisherReaderBuild>>,
  application: PublicationNextApplication,
): void {
  const reader = readerBuild.built.reader;
  const source = application.manifest.source;
  if (
    application.manifest.publicationId !== reader.publicationId ||
    application.reader.publicationId !== reader.publicationId ||
    application.reader.buildId !== reader.buildId ||
    source.readerBuildId !== reader.buildId ||
    source.readerSchemaVersion !== reader.schemaVersion ||
    source.audience !== reader.audience ||
    application.offlineCatalog.publicationId !== reader.publicationId ||
    application.offlineCatalog.readerBuildId !== reader.buildId ||
    application.offlineCatalog.rendererBuildId !== application.manifest.buildId
  ) {
    throw new TypeError(
      "Publisher application proof produced a mismatched application identity.",
    );
  }
}

function assertNoOptionalIntegrations(
  application: PublicationNextApplication,
): void {
  const hasAudio = application.offlineCatalog.packages.some(
    ({ audioClipCount, resources }) =>
      audioClipCount !== 0 ||
      resources.some(({ kind }) => kind === "audio" || kind === "timing"),
  );
  if (
    hasAudio ||
    application.manifest.extensions !== null ||
    application.manifest.sync !== null ||
    application.manifest.updates !== null
  ) {
    throw new TypeError(
      "Publisher application proof refuses audio, sync, Updates, and extensions in its first assembly slice.",
    );
  }
}

function createSummary(
  application: PublicationNextApplication,
): PublisherApplicationProofSummary {
  const integrations = Object.freeze({
    audio: false as const,
    extensions: false as const,
    sync: false as const,
    updates: false as const,
  });
  return Object.freeze({
    proofScope: "application assembly" as const,
    contentParity: "not asserted" as const,
    publicationId: application.reader.publicationId,
    readerBuildId: application.reader.buildId,
    applicationBuildId: application.manifest.buildId,
    workCount: application.reader.statistics.workCount,
    sectionCount: application.reader.statistics.sectionCount,
    blockCount: application.reader.statistics.blockCount,
    wordCount: application.reader.statistics.wordCount,
    routeCount: application.reader.routes.active.length,
    staticParamCount: application.staticParams.length,
    slashPolicy: application.slashPolicy,
    themePackage: application.manifest.theme.package,
    readerStateBootstrapPackage:
      application.manifest.readerStateBootstrap?.package ?? "",
    integrations,
  });
}

export async function createPublisherApplicationProof(
  options: PublisherApplicationProofOptions = {},
): Promise<PublisherApplicationProof> {
  const paths = resolvePaths(options);
  const readerBuild = await createPublisherReaderBuild(paths);
  assertReaderSlice(readerBuild);
  const createPublicationNextApplication =
    await loadCreatePublicationNextApplication();
  const created = await createPublicationNextApplication({
    reader: readerBuild.built.reader,
    readerStateBootstrap: coherenceReaderStateBootstrap,
    theme: resolveDefaultPublisherNextTheme(),
  });
  if (!created.valid) {
    const detail = diagnosticsText(created.diagnostics);
    throw new TypeError(
      detail.length === 0
        ? "Publisher application proof failed without diagnostics."
        : `Publisher application proof failed:\n${detail}`,
    );
  }
  const application = created.value;
  assertApplicationIdentity(readerBuild, application);
  assertNoOptionalIntegrations(application);
  return Object.freeze({
    readerBuild,
    application,
    summary: createSummary(application),
  });
}

function assertNoCliArguments(args: readonly string[]): void {
  if (args.length !== 0) {
    throw new TypeError("Usage: application-proof.ts");
  }
}

async function main(): Promise<void> {
  assertNoCliArguments(process.argv.slice(2));
  const { summary } = await createPublisherApplicationProof();
  console.log(JSON.stringify(summary, null, 2));
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
