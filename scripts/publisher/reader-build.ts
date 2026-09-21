import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { canonicalizeJson } from "@genii-foundation/publisher-content";
import {
  buildPublicationReader,
  resolveArtifactDestination,
  writeHostArtifact,
  type ArtifactDestination,
  type ArtifactWriteResult,
  type BuiltPublicationReader,
} from "@genii-foundation/publisher/node";
import { serializePublicationReaderEnvelope } from "@genii-foundation/publisher-reader";
import {
  createReaderProgressCatalog,
  serializeReaderProgressCatalog,
  type ReaderProgressCatalog,
} from "@genii-foundation/publisher-reader/progress-catalog";
import {
  createReaderSearchIndex,
  serializeReaderSearchIndex,
  type ReaderSearchIndex,
} from "@genii-foundation/publisher-reader/search";
import {
  PUBLISHER_NEXT_EXTENSION_DATA_PATH,
  PUBLISHER_NEXT_PROGRESS_DATA_PATH,
  PUBLISHER_NEXT_PUBLIC_IDENTITY_DATA_PATH,
  PUBLISHER_NEXT_READER_DATA_PATH,
  PUBLISHER_NEXT_SEARCH_DATA_PATH,
  PUBLISHER_NEXT_UPDATES_DATA_PATH,
} from "@genii-foundation/publisher-next/host";
import { createPublisherNextRoutePlan } from "@genii-foundation/publisher-next/config";
import type { PublisherNextRoutePlan } from "@genii-foundation/publisher-next/server";
import type {
  Diagnostic,
  JSONValue,
  PublicationReaderEnvelope,
  UpdatesEnvelope,
} from "@genii-foundation/publisher-schema";
import { validateUpdatesEnvelopeShape } from "@genii-foundation/publisher-schema";
import {
  editorialRoot,
  generatedPublisherExtensionDataPath,
  generatedPublisherPublicIdentityPath,
  generatedPublisherReaderPath,
  generatedPublisherUpdatesPath,
  publicPublisherReaderProgressPath,
  publicPublisherReaderSearchPath,
  publicPublisherStateMigrationPath,
  publisherConfigurationRoot,
  publishingRoot,
  repoRoot,
} from "../repository/paths";
import {
  adaptCoherencePublisherContent,
  loadCoherencePublisherContentAuthorities,
  type CoherencePublisherContentProof,
} from "./content-adapter";
import type {
  MaterializedCoherenceReaderStateMigrationArtifact,
} from "./reader-state-migration-artifact";
import {
  COHERENCE_READER_STATE_MIGRATION_HREF,
} from "../../src/publisher/reader-state-migration-schema";
import {
  validateCoherencePublisherRuntimeMigrationArtifacts,
} from "../../src/publisher/runtime-artifact-validation";
import { loadCoherencePublisherUpdatesData } from "./updates-adapter";

export type PublisherReaderBuildMode = "validate" | "write";
export type PublisherReaderBuildKind = "raw" | "coherence-adapted";

export type PublisherReaderBuildPaths = {
  publicationRoot: string;
  hostRoot: string;
  protectedRoots: readonly string[];
  artifactPaths?: PublisherReaderArtifactPaths;
};

export type PublisherReaderArtifactPaths = Readonly<{
  reader: string;
  search: string;
  progress: string;
  publicIdentity: string;
  extensionData?: string;
  stateMigration?: string;
  updatesData?: string;
}>;

export type PublisherReaderArtifact = {
  hostRelativePath: string;
  text: string;
};

export type PublisherReaderBuildSummary = {
  buildId: string;
  workCount: number;
  sectionCount: number;
  blockCount: number;
  wordCount: number;
  routeCount: number;
  staticParamCount: number;
  redirectCount: number;
  slashPolicy: PublisherNextRoutePlan["slashPolicy"];
};

export type PublisherReaderBuildResult = {
  built: BuiltPublicationReader;
  artifacts: readonly PublisherReaderArtifact[];
  summary: PublisherReaderBuildSummary;
  writes: readonly ArtifactWriteResult[];
};

export type PublisherReaderArtifactWriter = typeof writeHostArtifact;

export const defaultPublisherReaderBuildPaths: PublisherReaderBuildPaths = {
  publicationRoot: repoRoot,
  hostRoot: repoRoot,
  protectedRoots: [
    editorialRoot,
    publishingRoot,
    publisherConfigurationRoot,
  ],
  artifactPaths: Object.freeze({
    reader: hostRelativePath(generatedPublisherReaderPath),
    search: hostRelativePath(publicPublisherReaderSearchPath),
    progress: hostRelativePath(publicPublisherReaderProgressPath),
    publicIdentity: hostRelativePath(generatedPublisherPublicIdentityPath),
    extensionData: hostRelativePath(generatedPublisherExtensionDataPath),
    stateMigration: hostRelativePath(publicPublisherStateMigrationPath),
    updatesData: hostRelativePath(generatedPublisherUpdatesPath),
  }),
};

const rendererManagedPaths: readonly string[] = Object.freeze([]);

function hostRelativePath(absolutePath: string): string {
  return path
    .relative(repoRoot, absolutePath)
    .split(path.sep)
    .join("/");
}

function isWithin(candidate: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

function assertOutputBoundary(paths: PublisherReaderBuildPaths): void {
  if (!isWithin(paths.hostRoot, paths.publicationRoot)) {
    throw new TypeError(
      "Publisher Reader output must remain inside the publication root.",
    );
  }
  const relativeHostRoot = path.relative(
    path.resolve(paths.publicationRoot),
    path.resolve(paths.hostRoot),
  );
  let candidate = path.resolve(paths.publicationRoot);
  for (const segment of relativeHostRoot.split(path.sep).filter(Boolean)) {
    candidate = path.join(candidate, segment);
    if (!fs.existsSync(candidate)) continue;
    const stat = fs.lstatSync(candidate);
    if (stat.isSymbolicLink()) {
      throw new TypeError(
        `Publisher Reader output must not cross a symbolic link: ${candidate}.`,
      );
    }
    if (!stat.isDirectory()) {
      throw new TypeError(
        `Publisher Reader output ancestors must be directories: ${candidate}.`,
      );
    }
  }
}

function assertArtifactOutputBoundaries(
  paths: PublisherReaderBuildPaths,
  artifacts: readonly PublisherReaderArtifact[],
): void {
  for (const artifact of artifacts) {
    const absoluteArtifactPath = path.resolve(
      paths.hostRoot,
      artifact.hostRelativePath,
    );
    for (const protectedRoot of paths.protectedRoots) {
      if (isWithin(absoluteArtifactPath, protectedRoot)) {
        throw new TypeError(
          `Publisher Reader output must remain outside protected source root ${protectedRoot}.`,
        );
      }
    }
  }
}

export class PublisherReaderBuildError extends Error {
  readonly diagnostics: readonly Diagnostic[];

  constructor(diagnostics: readonly Diagnostic[]) {
    const summary = diagnostics
      .map(({ code, documentPath, path: diagnosticPath }) =>
        [code, documentPath, diagnosticPath].filter(Boolean).join(" "),
      )
      .join("\n");
    super(
      summary.length > 0
        ? `Publisher Reader build failed:\n${summary}`
        : "Publisher Reader build failed without diagnostics.",
    );
    this.name = "PublisherReaderBuildError";
    this.diagnostics = diagnostics;
  }
}

function createPublisherPublicIdentity(
  reader: PublicationReaderEnvelope,
): BuiltPublicationReader["publicIdentity"] {
  const homeRoutes = reader.routes.active.filter(
    ({ target }) => target.kind === "home",
  );
  if (homeRoutes.length !== 1) {
    throw new TypeError(
      "Publisher Reader artifacts require exactly one active home route.",
    );
  }
  const envelope = Object.freeze({
    schemaVersion: "1.0" as const,
    publicationId: reader.publicationId,
    engineVersion: reader.engineVersion,
    buildId: reader.buildId,
    homePath: homeRoutes[0]!.path,
    publication: reader.publication,
  });
  return Object.freeze({
    envelope,
    text: `${canonicalizeJson(envelope as unknown as JSONValue)}\n`,
  });
}

export function createPublisherReaderArtifacts(
  input: Readonly<{
    reader: PublicationReaderEnvelope;
    search: ReaderSearchIndex;
    progress: ReaderProgressCatalog;
    paths?: PublisherReaderArtifactPaths;
  }>,
): readonly PublisherReaderArtifact[] {
  const { progress, reader, search } = input;
  const artifactPaths = input.paths ?? Object.freeze({
    reader: PUBLISHER_NEXT_READER_DATA_PATH,
    search: PUBLISHER_NEXT_SEARCH_DATA_PATH,
    progress: PUBLISHER_NEXT_PROGRESS_DATA_PATH,
    publicIdentity: PUBLISHER_NEXT_PUBLIC_IDENTITY_DATA_PATH,
  });
  for (const [label, artifact] of [
    ["search", search],
    ["progress", progress],
  ] as const) {
    if (
      artifact.publicationId !== reader.publicationId ||
      artifact.readerBuildId !== reader.buildId
    ) {
      throw new TypeError(
        `Publisher Reader ${label} identity does not match the Reader envelope.`,
      );
    }
  }
  const expectedSearch = createReaderSearchIndex(reader);
  if (!isDeepStrictEqual(search, expectedSearch)) {
    throw new TypeError(
      "Publisher Reader search projection does not exactly match the Reader envelope.",
    );
  }
  const expectedProgress = createReaderProgressCatalog(reader);
  if (!isDeepStrictEqual(progress, expectedProgress)) {
    throw new TypeError(
      "Publisher Reader progress projection does not exactly match the Reader envelope.",
    );
  }
  const publicIdentity = createPublisherPublicIdentity(reader);
  return Object.freeze([
    Object.freeze({
      hostRelativePath: artifactPaths.reader,
      text: serializePublicationReaderEnvelope(reader),
    }),
    Object.freeze({
      hostRelativePath: artifactPaths.search,
      text: serializeReaderSearchIndex(search),
    }),
    Object.freeze({
      hostRelativePath: artifactPaths.progress,
      text: serializeReaderProgressCatalog(progress),
    }),
    Object.freeze({
      hostRelativePath: artifactPaths.publicIdentity,
      text: publicIdentity.text,
    }),
  ]);
}

export function createCoherencePublisherRuntimeArtifacts(input: Readonly<{
  built: BuiltPublicationReader;
  stateMigrationArtifact: MaterializedCoherenceReaderStateMigrationArtifact;
  updatesData: UpdatesEnvelope;
  updatesDataText: string;
  paths?: PublisherReaderArtifactPaths;
}>): readonly PublisherReaderArtifact[] {
  if (input.built.extensions === undefined) {
    throw new TypeError(
      "Coherence Publisher runtime artifacts require build-bound extension data.",
    );
  }
  const artifactPaths = input.paths ?? Object.freeze({
    reader: PUBLISHER_NEXT_READER_DATA_PATH,
    search: PUBLISHER_NEXT_SEARCH_DATA_PATH,
    progress: PUBLISHER_NEXT_PROGRESS_DATA_PATH,
    publicIdentity: PUBLISHER_NEXT_PUBLIC_IDENTITY_DATA_PATH,
    extensionData: PUBLISHER_NEXT_EXTENSION_DATA_PATH,
    stateMigration: `public${COHERENCE_READER_STATE_MIGRATION_HREF}`,
    updatesData: PUBLISHER_NEXT_UPDATES_DATA_PATH,
  });
  if (
    artifactPaths.extensionData === undefined ||
    artifactPaths.stateMigration === undefined ||
    artifactPaths.updatesData === undefined
  ) {
    throw new TypeError(
      "Coherence Publisher runtime artifact paths require extension, migration, and Updates destinations.",
    );
  }
  const expectedExtensionText = `${canonicalizeJson(
    input.built.extensions.envelope as unknown as JSONValue,
  )}\n`;
  if (input.built.extensions.text !== expectedExtensionText) {
    throw new TypeError(
      "Coherence Publisher extension text is not the exact canonical envelope.",
    );
  }
  const binding = validateCoherencePublisherRuntimeMigrationArtifacts({
    reader: input.built.reader,
    extensionData: input.built.extensions.envelope,
    migrationText: input.stateMigrationArtifact.text,
  });
  if (
    !isDeepStrictEqual(
      binding.migrationArtifact,
      input.stateMigrationArtifact.artifact,
    ) ||
    Buffer.byteLength(input.stateMigrationArtifact.text, "utf8") !==
      input.stateMigrationArtifact.byteSize ||
    binding.projection.artifact.sha256 !== input.stateMigrationArtifact.sha256
  ) {
    throw new TypeError(
      "Coherence Publisher migration materialization receipt is inconsistent.",
    );
  }
  const validatedUpdatesData = validateUpdatesEnvelopeShape(
    input.updatesData,
  );
  if (!validatedUpdatesData.valid) {
    throw new TypeError(
      `Coherence Publisher Updates runtime artifact is invalid: ${validatedUpdatesData.diagnostics
        .map(({ code, path: diagnosticPath }) =>
          `${code}${diagnosticPath.length === 0 ? "" : ` ${diagnosticPath}`}`
        )
        .join(", ")}`,
    );
  }
  const expectedUpdatesText = `${canonicalizeJson(
    validatedUpdatesData.value as unknown as JSONValue,
  )}\n`;
  if (
    validatedUpdatesData.value.publicationId !== input.built.reader.publicationId ||
    validatedUpdatesData.value.buildId !== input.built.reader.buildId ||
    !isDeepStrictEqual(validatedUpdatesData.value, input.updatesData) ||
    input.updatesDataText !== expectedUpdatesText
  ) {
    throw new TypeError(
      "Coherence Publisher Updates runtime artifact does not match the exact Reader build.",
    );
  }

  const standardArtifacts = createPublisherReaderArtifacts({
    reader: input.built.reader,
    search: input.built.search.index,
    progress: input.built.progress.catalog,
    paths: artifactPaths,
  });
  const [reader, search, progress, publicIdentity] = standardArtifacts;
  if (
    reader === undefined ||
    search === undefined ||
    progress === undefined ||
    publicIdentity === undefined
  ) {
    throw new TypeError(
      "Coherence Publisher runtime artifacts are incomplete.",
    );
  }
  const artifacts = Object.freeze([
    Object.freeze({
      hostRelativePath: artifactPaths.stateMigration,
      text: input.stateMigrationArtifact.text,
    }),
    search,
    progress,
    publicIdentity,
    Object.freeze({
      hostRelativePath: artifactPaths.extensionData,
      text: input.built.extensions.text,
    }),
    Object.freeze({
      hostRelativePath: artifactPaths.updatesData,
      text: input.updatesDataText,
    }),
    reader,
  ]);
  if (
    new Set(artifacts.map(({ hostRelativePath }) => hostRelativePath)).size !==
      artifacts.length
  ) {
    throw new TypeError(
      "Coherence Publisher runtime artifact destinations must be unique.",
    );
  }
  return artifacts;
}

type OriginalArtifactState = Readonly<{
  destination: ArtifactDestination;
  text: string | null;
}>;

function snapshotArtifactSet(
  destinations: readonly ArtifactDestination[],
): readonly OriginalArtifactState[] {
  return Object.freeze(
    destinations.map((destination) => {
      if (!fs.existsSync(destination.absolutePath)) {
        return Object.freeze({ destination, text: null });
      }
      const stat = fs.lstatSync(destination.absolutePath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new TypeError(
          `Publisher Reader artifact destination must be a regular file: ${destination.absolutePath}.`,
        );
      }
      return Object.freeze({
        destination,
        text: fs.readFileSync(destination.absolutePath, "utf8"),
      });
    }),
  );
}

function restoreArtifactSet(
  originals: readonly OriginalArtifactState[],
): void {
  const failures: string[] = [];
  for (const original of [...originals].reverse()) {
    try {
      if (original.text === null) {
        fs.rmSync(original.destination.absolutePath, { force: true });
      } else {
        writeHostArtifact({
          destination: original.destination,
          text: original.text,
        });
      }
    } catch (error) {
      failures.push(
        `${original.destination.hostRelativePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `Publisher Reader artifact rollback failed:\n${failures.join("\n")}`,
    );
  }
}

function summarizeBuild(
  built: BuiltPublicationReader,
  routePlan: PublisherNextRoutePlan,
): PublisherReaderBuildSummary {
  const { reader } = built;
  return Object.freeze({
    buildId: reader.buildId,
    workCount: reader.statistics.workCount,
    sectionCount: reader.statistics.sectionCount,
    blockCount: reader.statistics.blockCount,
    wordCount: reader.statistics.wordCount,
    routeCount: routePlan.activePaths.length,
    staticParamCount: routePlan.staticParams.length,
    redirectCount: reader.routes.redirects.length,
    slashPolicy: routePlan.slashPolicy,
  });
}

function createBuiltPublicationReaderFromAdaptedProof(
  proof: CoherencePublisherContentProof,
): BuiltPublicationReader {
  return Object.freeze({
    content: proof.content,
    reader: proof.reader,
    text: serializePublicationReaderEnvelope(proof.reader),
    search: Object.freeze({
      index: proof.search,
      text: serializeReaderSearchIndex(proof.search),
    }),
    progress: Object.freeze({
      catalog: proof.progress,
      text: serializeReaderProgressCatalog(proof.progress),
    }),
    publicIdentity: createPublisherPublicIdentity(proof.reader),
    extensions: Object.freeze({
      envelope: proof.extensionData,
      text: `${canonicalizeJson(
        proof.extensionData as unknown as JSONValue,
      )}\n`,
    }),
  });
}

export async function createPublisherReaderBuild(
  paths: PublisherReaderBuildPaths = defaultPublisherReaderBuildPaths,
  extensions: unknown = Object.freeze([]),
): Promise<Omit<PublisherReaderBuildResult, "writes">> {
  const result = await buildPublicationReader({
    publicationRoot: paths.publicationRoot,
    audience: "preview",
    extensions,
  });
  if (!result.valid) throw new PublisherReaderBuildError(result.diagnostics);
  const routePlan = createPublisherNextRoutePlan(result.value.reader);
  if (!routePlan.valid) {
    throw new PublisherReaderBuildError(routePlan.diagnostics);
  }

  return Object.freeze({
    built: result.value,
    artifacts: createPublisherReaderArtifacts({
      reader: result.value.reader,
      search: result.value.search.index,
      progress: result.value.progress.catalog,
      ...(paths.artifactPaths === undefined
        ? {}
        : { paths: paths.artifactPaths }),
    }),
    summary: summarizeBuild(result.value, routePlan.value),
  });
}

export async function createCoherencePublisherReaderBuild(
  paths: PublisherReaderBuildPaths = defaultPublisherReaderBuildPaths,
): Promise<Omit<PublisherReaderBuildResult, "writes">> {
  if (path.resolve(paths.publicationRoot) !== path.resolve(repoRoot)) {
    throw new TypeError(
      "The adapted Coherence Publisher build requires the canonical publication root.",
    );
  }
  const authorities = await loadCoherencePublisherContentAuthorities();
  const proof = await adaptCoherencePublisherContent(authorities);
  const built = createBuiltPublicationReaderFromAdaptedProof(proof);
  const updatesProof = loadCoherencePublisherUpdatesData(built.reader);
  const routePlan = createPublisherNextRoutePlan(
    built.reader,
    undefined,
    built.extensions?.envelope,
  );
  if (!routePlan.valid) {
    throw new PublisherReaderBuildError(routePlan.diagnostics);
  }
  if (
    routePlan.value.slashPolicy !== proof.routePlan.slashPolicy ||
    !isDeepStrictEqual(
      routePlan.value.activePaths,
      proof.routePlan.activePaths,
    ) ||
    !isDeepStrictEqual(
      routePlan.value.staticParams,
      proof.routePlan.staticParams,
    )
  ) {
    throw new TypeError(
      "The adapted Coherence Publisher route plan drifted during materialization.",
    );
  }
  return Object.freeze({
    built,
    artifacts: createCoherencePublisherRuntimeArtifacts({
      built,
      stateMigrationArtifact: proof.stateMigrationArtifact,
      updatesData: updatesProof.updatesData,
      updatesDataText: updatesProof.updatesDataText,
      ...(paths.artifactPaths === undefined
        ? {}
        : { paths: paths.artifactPaths }),
    }),
    summary: summarizeBuild(built, routePlan.value),
  });
}

export function writePublisherReaderArtifactSet(input: Readonly<{
  artifactWriter?: PublisherReaderArtifactWriter;
  artifacts: readonly PublisherReaderArtifact[];
  paths: PublisherReaderBuildPaths;
}>): readonly ArtifactWriteResult[] {
  const artifactWriter = input.artifactWriter ?? writeHostArtifact;
  assertOutputBoundary(input.paths);
  assertArtifactOutputBoundaries(input.paths, input.artifacts);
  const destinations = input.artifacts.map(({ hostRelativePath }) =>
    resolveArtifactDestination({
      hostRoot: input.paths.hostRoot,
      declaredArtifactPath: hostRelativePath,
      rendererManagedPaths,
      protectedRoots: input.paths.protectedRoots,
    })
  );
  const originals = snapshotArtifactSet(destinations);
  const completed: ArtifactWriteResult[] = [];
  try {
    input.artifacts.forEach(({ text }, index) => {
      completed.push(
        artifactWriter({
          destination: destinations[index]!,
          text,
        }),
      );
    });
  } catch (error) {
    try {
      restoreArtifactSet(originals);
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Publisher Reader artifact materialization and rollback both failed.",
      );
    }
    throw error;
  }
  return Object.freeze(completed);
}

export async function runPublisherReaderBuild({
  artifactWriter = writeHostArtifact,
  buildKind = "raw",
  extensions = Object.freeze([]),
  mode = "validate",
  paths = defaultPublisherReaderBuildPaths,
}: {
  artifactWriter?: PublisherReaderArtifactWriter;
  buildKind?: PublisherReaderBuildKind;
  extensions?: unknown;
  mode?: PublisherReaderBuildMode;
  paths?: PublisherReaderBuildPaths;
} = {}): Promise<PublisherReaderBuildResult> {
  if (mode === "write") assertOutputBoundary(paths);
  const created = buildKind === "coherence-adapted"
    ? await createCoherencePublisherReaderBuild(paths)
    : await createPublisherReaderBuild(paths, extensions);
  const writes = mode === "write"
    ? writePublisherReaderArtifactSet({
        artifactWriter,
        artifacts: created.artifacts,
        paths,
      })
    : Object.freeze([]);

  return Object.freeze({ ...created, writes: Object.freeze(writes) });
}

function parseMode(args: readonly string[]): PublisherReaderBuildMode {
  if (args.length === 0) return "validate";
  if (args.length === 1 && args[0] === "--write") return "write";
  throw new Error("Usage: reader-build.ts [--write]");
}

async function main(): Promise<void> {
  const result = await runPublisherReaderBuild({
    buildKind: "coherence-adapted",
    mode: parseMode(process.argv.slice(2)),
  });
  const { summary } = result;
  console.log(
    [
      `Publisher Reader ${summary.buildId}`,
      `${summary.workCount} works`,
      `${summary.sectionCount} sections`,
      `${summary.blockCount} blocks`,
      `${summary.wordCount} words`,
      `${summary.routeCount} routes`,
      `${summary.staticParamCount} static parameters`,
      `${summary.slashPolicy} slash policy`,
      `${summary.redirectCount} redirects`,
    ].join(", "),
  );
  for (const write of result.writes) {
    console.log(`${write.outcome}: ${write.hostRelativePath}`);
  }
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
