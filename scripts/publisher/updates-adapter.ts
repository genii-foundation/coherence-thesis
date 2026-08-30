import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  buildUpdatesEnvelope,
  resolvePublicationUpdates,
} from "@genii-foundation/publisher/node";
import { canonicalizeJson } from "@genii-foundation/publisher-content";
import {
  parseJsonWithUniqueObjectKeys,
  validateUpdatesCatalogShape,
  validateUpdatesEnvelopeShape,
  type JSONValue,
  type PublicationReaderEnvelope,
  type PublicationUpdatesRoute,
  type UpdatesCatalog,
  type UpdatesCatalogEntry,
  type UpdatesEnvelope,
  type ValidationResult,
} from "@genii-foundation/publisher-schema";

import {
  buildUpdateDays,
  parseUpdatesSnapshot,
  updateKindLabels,
  updatesRepositoryUrl,
  type UpdateEntry,
  type UpdatesSnapshot,
} from "../../src/lib/updates";
import {
  repoRoot,
  updatesSnapshotPath,
} from "../repository/paths";

const EXPECTED_PUBLICATION_ID = "coherence-thesis";
const EXPECTED_SNAPSHOT_RELATIVE_PATH =
  "publishing/updates/snapshot.json";
const EXPECTED_SNAPSHOT_BYTES = 99_570;
const EXPECTED_SNAPSHOT_SHA256 =
  "sha256:6c6e326b991980e1d64b5bdd37151917d19595de46a64efeff1500281ecfc63f";
const EXPECTED_SNAPSHOT_HEAD_SHA =
  "845a358b0e9659243781d60970895368da6ef770";
const EXPECTED_SNAPSHOT_COMMIT_COUNT = 240;
const EXPECTED_LITERARY_COMMIT_COUNT = 12;
const EXPECTED_LATEST_COMMIT_SHA =
  "845a358b0e9659243781d60970895368da6ef770";
const EXPECTED_EARLIEST_COMMIT_SHA =
  "4dd72208a5fefda31ac0d55ea82b2c6965caa345";
const GREAT_REVISION_SHA =
  "29ac0f92c261f3673f42d5fbac388c20de105cf6";
const EXPECTED_GREAT_REVISION_TITLE =
  "The Great Revision: Recasting All Nine Manuscripts of The Coherence Thesis";
const EXPECTED_GREAT_REVISION_COMMIT_URL =
  `${updatesRepositoryUrl}/commit/${GREAT_REVISION_SHA}`;
const EXPECTED_GREAT_REVISION_PULL_REQUEST_URL =
  `${updatesRepositoryUrl}/pull/112`;
const MAXIMUM_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const MAXIMUM_VIEW_ENTRIES = 10_000;
const UPDATES_PAGE_SIZE = 5;
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/u;

type UpdatesViewId = "all" | "literary";

export type CoherencePublisherUpdatesProof = Readonly<{
  reader: Readonly<{
    publicationId: string;
    buildId: string;
  }>;
  source: Readonly<{
    relativePath: typeof EXPECTED_SNAPSHOT_RELATIVE_PATH;
    bytes: typeof EXPECTED_SNAPSHOT_BYTES;
    sha256: typeof EXPECTED_SNAPSHOT_SHA256;
    headSha: typeof EXPECTED_SNAPSHOT_HEAD_SHA;
    commitCount: typeof EXPECTED_SNAPSHOT_COMMIT_COUNT;
    literaryCommitCount: typeof EXPECTED_LITERARY_COMMIT_COUNT;
    latestCommitSha: typeof EXPECTED_LATEST_COMMIT_SHA;
    earliestCommitSha: typeof EXPECTED_EARLIEST_COMMIT_SHA;
  }>;
  routes: readonly PublicationUpdatesRoute[];
  pagination: Readonly<{
    pageSize: typeof UPDATES_PAGE_SIZE;
    allPageCount: number;
    literaryPageCount: number;
  }>;
  catalog: UpdatesCatalog;
  catalogText: string;
  updatesData: UpdatesEnvelope;
  updatesDataText: string;
  greatRevision: Readonly<{
    sha: typeof GREAT_REVISION_SHA;
    title: typeof EXPECTED_GREAT_REVISION_TITLE;
    commitUrl: typeof EXPECTED_GREAT_REVISION_COMMIT_URL;
    pullRequestUrl: typeof EXPECTED_GREAT_REVISION_PULL_REQUEST_URL;
    primarySourceUrl: typeof EXPECTED_GREAT_REVISION_PULL_REQUEST_URL;
    presentInViews: readonly ["all", "literary"];
  }>;
  transition: Readonly<{
    coherenceUpdatesRoutesRemainVisible: true;
    publisherUpdatesRoutesActivated: false;
    sourceLinksRenderedByPublisher: false;
    sourceLinksPreservedInSummaries: true;
  }>;
}>;

function fail(message: string): never {
  throw new TypeError(`Coherence Publisher Updates adapter: ${message}`);
}

function requireValid<T>(
  result: ValidationResult<T>,
  label: string,
): T {
  if (result.valid) return result.value;
  fail(
    `${label} failed: ${result.diagnostics
      .map((diagnostic) => `${diagnostic.code} ${diagnostic.path}`)
      .join(", ")}`,
  );
}

function sourceRelativePath(): typeof EXPECTED_SNAPSHOT_RELATIVE_PATH {
  const relativePath = path
    .relative(repoRoot, updatesSnapshotPath)
    .split(path.sep)
    .join("/");
  if (relativePath !== EXPECTED_SNAPSHOT_RELATIVE_PATH) {
    fail(
      `the checked snapshot path moved from ${EXPECTED_SNAPSHOT_RELATIVE_PATH} to ${relativePath}.`,
    );
  }
  return EXPECTED_SNAPSHOT_RELATIVE_PATH;
}

function snapshotSha256(text: string): string {
  return `sha256:${createHash("sha256")
    .update(text, "utf8")
    .digest("hex")}`;
}

function readCheckedSnapshotText(): string {
  const stat = fs.lstatSync(updatesSnapshotPath);
  if (!stat.isFile()) {
    fail("the checked snapshot authority is not a regular file.");
  }
  if (stat.size > MAXIMUM_SNAPSHOT_BYTES) {
    fail(
      `the checked snapshot exceeds the ${MAXIMUM_SNAPSHOT_BYTES.toLocaleString("en-US")} byte read cap.`,
    );
  }
  if (stat.size !== EXPECTED_SNAPSHOT_BYTES) {
    fail(
      `the checked snapshot byte identity drifted from ${EXPECTED_SNAPSHOT_BYTES.toLocaleString("en-US")} to ${stat.size.toLocaleString("en-US")}.`,
    );
  }
  return fs.readFileSync(updatesSnapshotPath, "utf8");
}

function parseBoundSnapshot(text: string): UpdatesSnapshot {
  const byteLength = Buffer.byteLength(text, "utf8");
  if (byteLength > MAXIMUM_SNAPSHOT_BYTES) {
    fail(
      `the supplied snapshot exceeds the ${MAXIMUM_SNAPSHOT_BYTES.toLocaleString("en-US")} byte parse cap.`,
    );
  }
  if (byteLength !== EXPECTED_SNAPSHOT_BYTES) {
    fail(
      `the supplied snapshot byte identity drifted from ${EXPECTED_SNAPSHOT_BYTES.toLocaleString("en-US")} to ${byteLength.toLocaleString("en-US")}.`,
    );
  }
  const textSha256 = snapshotSha256(text);
  if (textSha256 !== EXPECTED_SNAPSHOT_SHA256) {
    fail(
      `the supplied snapshot text identity drifted from ${EXPECTED_SNAPSHOT_SHA256} to ${textSha256}.`,
    );
  }
  const json = requireValid(
    parseJsonWithUniqueObjectKeys(text),
    "strict snapshot parsing",
  );
  const snapshot = parseUpdatesSnapshot(json);
  const literaryCommitCount = snapshot.commits.filter(
    ({ isLiterary }) => isLiterary,
  ).length;
  if (
    snapshot.headSha !== EXPECTED_SNAPSHOT_HEAD_SHA ||
    snapshot.commits.length !== EXPECTED_SNAPSHOT_COMMIT_COUNT ||
    literaryCommitCount !== EXPECTED_LITERARY_COMMIT_COUNT ||
    snapshot.commits[0]?.sha !== EXPECTED_LATEST_COMMIT_SHA ||
    snapshot.commits.at(-1)?.sha !== EXPECTED_EARLIEST_COMMIT_SHA
  ) {
    fail("the checked snapshot semantic identity drifted.");
  }
  return snapshot;
}

function sourceSummary(entry: UpdateEntry): string {
  if (!Number.isSafeInteger(entry.linesChanged)) {
    fail(`commit ${entry.sha} has an unsafe changed line total.`);
  }
  const pullRequest =
    entry.pullRequestNumber === undefined ||
    entry.pullRequestUrl === undefined
      ? ""
      : ` Pull request #${entry.pullRequestNumber.toLocaleString("en-US")}: ${entry.pullRequestUrl}.`;
  const deployment =
    entry.deploymentUrl === undefined
      ? ""
      : ` Published version: ${entry.deploymentUrl}.`;
  const fileUnit = entry.filesChanged === 1 ? "file" : "files";
  const lineUnit = entry.linesChanged === 1 ? "line" : "lines";
  return `${updateKindLabels[entry.kind]}.${pullRequest} Commit ${entry.shortSha}: ${entry.commitUrl}.${deployment} ${entry.filesChanged.toLocaleString("en-US")} ${fileUnit} changed, ${entry.linesChanged.toLocaleString("en-US")} ${lineUnit} changed.`;
}

function catalogEntry(
  entry: UpdateEntry,
  viewId: UpdatesViewId,
): UpdatesCatalogEntry {
  return Object.freeze({
    id: entry.sha,
    title: entry.title,
    summary: sourceSummary(entry),
    publishedAt: entry.committedAt,
    href:
      viewId === "all"
        ? "/updates/"
        : "/updates/literary/",
  });
}

function viewEntries(
  snapshot: UpdatesSnapshot,
  viewId: UpdatesViewId,
): readonly UpdatesCatalogEntry[] {
  const entries = buildUpdateDays(snapshot)
    .flatMap(({ entries }) => entries)
    .filter((entry) => viewId === "all" || entry.isLiterary)
    .map((entry) => catalogEntry(entry, viewId));
  if (entries.length > MAXIMUM_VIEW_ENTRIES) {
    fail(
      `view ${viewId} exceeds the ${MAXIMUM_VIEW_ENTRIES.toLocaleString("en-US")} entry cap.`,
    );
  }
  return Object.freeze(entries);
}

function createCatalog(snapshot: UpdatesSnapshot): UpdatesCatalog {
  const allEntries = viewEntries(snapshot, "all");
  const literaryEntries = viewEntries(snapshot, "literary");
  return requireValid(
    validateUpdatesCatalogShape({
      $schema:
        "https://publisher.genii.foundation/schemas/updates-catalog.schema.json",
      schemaVersion: "1.0",
      publicationId: EXPECTED_PUBLICATION_ID,
      views: Object.freeze([
        Object.freeze({
          id: "all",
          title: "Updates",
          description:
            "Every change to the thesis, and its reader interface.",
          emptyMessage: "No updates have been published.",
          entries: allEntries,
        }),
        Object.freeze({
          id: "literary",
          title: "Literary updates",
          description:
            "Every manuscript change to The Coherence Thesis.",
          emptyMessage: "No literary updates have been published.",
          entries: literaryEntries,
        }),
      ]),
    }),
    "Publisher Updates catalog validation",
  );
}

function createRoutes(): readonly PublicationUpdatesRoute[] {
  return Object.freeze([
    Object.freeze({
      id: "all",
      path: "/updates/",
      pagination: Object.freeze({
        path: "/updates/{page}/",
        pageSize: UPDATES_PAGE_SIZE,
      }),
    }),
    Object.freeze({
      id: "literary",
      path: "/updates/literary/",
      pagination: Object.freeze({
        path: "/updates/literary/{page}/",
        pageSize: UPDATES_PAGE_SIZE,
      }),
    }),
  ]);
}

function assertGreatRevision(
  catalog: UpdatesCatalog,
): CoherencePublisherUpdatesProof["greatRevision"] {
  const matches = catalog.views.map((view) => ({
    viewId: view.id,
    entry: view.entries.find(({ id }) => id === GREAT_REVISION_SHA),
  }));
  for (const { viewId, entry } of matches) {
    if (
      entry === undefined ||
      entry.title !== EXPECTED_GREAT_REVISION_TITLE ||
      entry.publishedAt !== "2026-08-01T17:56:44.000Z" ||
      !entry.summary?.includes(EXPECTED_GREAT_REVISION_COMMIT_URL) ||
      !entry.summary.includes(EXPECTED_GREAT_REVISION_PULL_REQUEST_URL)
    ) {
      fail(`the Great Revision identity drifted in view ${viewId}.`);
    }
  }
  if (
    matches.length !== 2 ||
    matches[0]?.viewId !== "all" ||
    matches[1]?.viewId !== "literary"
  ) {
    fail("the Great Revision view membership drifted.");
  }
  return Object.freeze({
    sha: GREAT_REVISION_SHA,
    title: EXPECTED_GREAT_REVISION_TITLE,
    commitUrl: EXPECTED_GREAT_REVISION_COMMIT_URL,
    pullRequestUrl: EXPECTED_GREAT_REVISION_PULL_REQUEST_URL,
    primarySourceUrl: EXPECTED_GREAT_REVISION_PULL_REQUEST_URL,
    presentInViews: Object.freeze(["all", "literary"] as const),
  });
}

export function adaptCoherencePublisherUpdatesSnapshot(
  reader: Pick<PublicationReaderEnvelope, "publicationId" | "buildId">,
  snapshotText: string,
): CoherencePublisherUpdatesProof {
  if (reader.publicationId !== EXPECTED_PUBLICATION_ID) {
    fail(
      `Reader publication ${reader.publicationId} does not match ${EXPECTED_PUBLICATION_ID}.`,
    );
  }
  if (!SHA256_DIGEST.test(reader.buildId)) {
    fail(`Reader build identity ${reader.buildId} is not a SHA-256 digest.`);
  }
  const relativePath = sourceRelativePath();
  const snapshot = parseBoundSnapshot(snapshotText);
  const catalog = createCatalog(snapshot);
  const routes = createRoutes();
  const resolved = requireValid(
    resolvePublicationUpdates({
      catalog,
      declaredCatalogPath: relativePath,
      publicationId: reader.publicationId,
      routes: {
        home: "/",
        work: "/manuscripts/{workId}/",
        updates: routes,
      },
    }),
    "Publisher Updates route resolution",
  );
  const built = requireValid(
    buildUpdatesEnvelope({
      updates: resolved,
      adapter: {
        package: EXPECTED_PUBLICATION_ID,
        config: {
          kind: "checked-updates-snapshot",
          schemaVersion: 1,
          snapshotHeadSha: EXPECTED_SNAPSHOT_HEAD_SHA,
          snapshotSha256: EXPECTED_SNAPSHOT_SHA256,
        },
      },
      publicationId: reader.publicationId,
      buildId: reader.buildId,
      catalogText: snapshotText,
    }),
    "Publisher Updates envelope construction",
  );
  const updatesData = requireValid(
    validateUpdatesEnvelopeShape(built.envelope),
    "Publisher Updates envelope validation",
  );
  if (
    updatesData.publicationId !== reader.publicationId ||
    updatesData.buildId !== reader.buildId ||
    updatesData.source.catalogPath !== relativePath ||
    updatesData.source.catalogSha256 !== EXPECTED_SNAPSHOT_SHA256
  ) {
    fail("the Publisher Updates envelope lost its Reader or source binding.");
  }
  const allEntryCount = catalog.views[0]?.entries.length ?? 0;
  const literaryEntryCount = catalog.views[1]?.entries.length ?? 0;
  const greatRevision = assertGreatRevision(catalog);

  return Object.freeze({
    reader: Object.freeze({
      publicationId: reader.publicationId,
      buildId: reader.buildId,
    }),
    source: Object.freeze({
      relativePath,
      bytes: EXPECTED_SNAPSHOT_BYTES,
      sha256: EXPECTED_SNAPSHOT_SHA256,
      headSha: EXPECTED_SNAPSHOT_HEAD_SHA,
      commitCount: EXPECTED_SNAPSHOT_COMMIT_COUNT,
      literaryCommitCount: EXPECTED_LITERARY_COMMIT_COUNT,
      latestCommitSha: EXPECTED_LATEST_COMMIT_SHA,
      earliestCommitSha: EXPECTED_EARLIEST_COMMIT_SHA,
    }),
    routes,
    pagination: Object.freeze({
      pageSize: UPDATES_PAGE_SIZE,
      allPageCount: Math.max(
        1,
        Math.ceil(allEntryCount / UPDATES_PAGE_SIZE),
      ),
      literaryPageCount: Math.max(
        1,
        Math.ceil(literaryEntryCount / UPDATES_PAGE_SIZE),
      ),
    }),
    catalog,
    catalogText: `${canonicalizeJson(catalog as unknown as JSONValue)}\n`,
    updatesData,
    updatesDataText: built.text,
    greatRevision,
    transition: Object.freeze({
      coherenceUpdatesRoutesRemainVisible: true,
      publisherUpdatesRoutesActivated: false,
      sourceLinksRenderedByPublisher: false,
      sourceLinksPreservedInSummaries: true,
    }),
  });
}

export function loadCoherencePublisherUpdatesData(
  reader: Pick<PublicationReaderEnvelope, "publicationId" | "buildId">,
): CoherencePublisherUpdatesProof {
  return adaptCoherencePublisherUpdatesSnapshot(
    reader,
    readCheckedSnapshotText(),
  );
}
