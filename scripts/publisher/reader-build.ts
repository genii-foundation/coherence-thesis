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
  PUBLISHER_NEXT_PROGRESS_DATA_PATH,
  PUBLISHER_NEXT_PUBLIC_IDENTITY_DATA_PATH,
  PUBLISHER_NEXT_READER_DATA_PATH,
  PUBLISHER_NEXT_SEARCH_DATA_PATH,
} from "@genii-foundation/publisher-next/host";
import { createPublisherNextRoutePlan } from "@genii-foundation/publisher-next/config";
import type { PublisherNextRoutePlan } from "@genii-foundation/publisher-next/server";
import type {
  Diagnostic,
  JSONValue,
  PublicationReaderEnvelope,
} from "@genii-foundation/publisher-schema";
import {
  editorialRoot,
  generatedPublisherHostRoot,
  publisherConfigurationRoot,
  publishingRoot,
  repoRoot,
} from "../repository/paths";
import {
  createCoherenceReaderStateMigrationBootstrapExtensionRegistration,
} from "../../src/publisher/reader-state-migration-extension";

export type PublisherReaderBuildMode = "validate" | "write";

export type PublisherReaderBuildPaths = {
  publicationRoot: string;
  hostRoot: string;
  protectedRoots: readonly string[];
};

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
  hostRoot: generatedPublisherHostRoot,
  protectedRoots: [
    editorialRoot,
    publishingRoot,
    publisherConfigurationRoot,
  ],
};

const rendererManagedPaths: readonly string[] = Object.freeze([]);

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
  for (const protectedRoot of paths.protectedRoots) {
    if (
      isWithin(paths.hostRoot, protectedRoot) ||
      isWithin(protectedRoot, paths.hostRoot)
    ) {
      throw new TypeError(
        `Publisher Reader output must be disjoint from protected source root ${protectedRoot}.`,
      );
    }
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

export function createPublisherReaderArtifacts(
  input: Readonly<{
    reader: PublicationReaderEnvelope;
    search: ReaderSearchIndex;
    progress: ReaderProgressCatalog;
  }>,
): readonly PublisherReaderArtifact[] {
  const { progress, reader, search } = input;
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
  const homeRoutes = reader.routes.active.filter(
    ({ target }) => target.kind === "home",
  );
  if (homeRoutes.length !== 1) {
    throw new TypeError(
      "Publisher Reader artifacts require exactly one active home route.",
    );
  }
  const publicIdentity = Object.freeze({
    schemaVersion: "1.0" as const,
    publicationId: reader.publicationId,
    engineVersion: reader.engineVersion,
    buildId: reader.buildId,
    homePath: homeRoutes[0]!.path,
    publication: reader.publication,
  });
  return Object.freeze([
    Object.freeze({
      hostRelativePath: PUBLISHER_NEXT_READER_DATA_PATH,
      text: serializePublicationReaderEnvelope(reader),
    }),
    Object.freeze({
      hostRelativePath: PUBLISHER_NEXT_SEARCH_DATA_PATH,
      text: serializeReaderSearchIndex(search),
    }),
    Object.freeze({
      hostRelativePath: PUBLISHER_NEXT_PROGRESS_DATA_PATH,
      text: serializeReaderProgressCatalog(progress),
    }),
    Object.freeze({
      hostRelativePath: PUBLISHER_NEXT_PUBLIC_IDENTITY_DATA_PATH,
      text: `${canonicalizeJson(publicIdentity as unknown as JSONValue)}\n`,
    }),
  ]);
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
    }),
    summary: summarizeBuild(result.value, routePlan.value),
  });
}

export async function runPublisherReaderBuild({
  artifactWriter = writeHostArtifact,
  extensions = Object.freeze([]),
  mode = "validate",
  paths = defaultPublisherReaderBuildPaths,
}: {
  artifactWriter?: PublisherReaderArtifactWriter;
  extensions?: unknown;
  mode?: PublisherReaderBuildMode;
  paths?: PublisherReaderBuildPaths;
} = {}): Promise<PublisherReaderBuildResult> {
  if (mode === "write") assertOutputBoundary(paths);
  const created = await createPublisherReaderBuild(paths, extensions);
  const destinations =
    mode === "write"
      ? created.artifacts.map(({ hostRelativePath }) =>
          resolveArtifactDestination({
            hostRoot: paths.hostRoot,
            declaredArtifactPath: hostRelativePath,
            rendererManagedPaths,
          }),
        )
      : [];
  let writes: readonly ArtifactWriteResult[] = Object.freeze([]);
  if (mode === "write") {
    const originals = snapshotArtifactSet(destinations);
    const completed: ArtifactWriteResult[] = [];
    try {
      created.artifacts.forEach(({ text }, index) => {
        completed.push(
          artifactWriter({
            destination: destinations[index]!,
            text,
          }),
        );
      });
      writes = Object.freeze(completed);
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
  }

  return Object.freeze({ ...created, writes: Object.freeze(writes) });
}

function parseMode(args: readonly string[]): PublisherReaderBuildMode {
  if (args.length === 0) return "validate";
  if (args.length === 1 && args[0] === "--write") return "write";
  throw new Error("Usage: reader-build.ts [--write]");
}

async function main(): Promise<void> {
  const result = await runPublisherReaderBuild({
    extensions: [
      createCoherenceReaderStateMigrationBootstrapExtensionRegistration(
        "coherence-thesis",
      ),
    ],
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
