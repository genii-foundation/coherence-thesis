import { createHash } from "node:crypto";
import type { PublisherExtensionDataEnvelope } from "@genii-foundation/publisher/node";

import {
  COHERENCE_READER_STATE_MIGRATION_EXTENSION_CAPABILITIES,
  COHERENCE_READER_STATE_MIGRATION_EXTENSION_ID,
  COHERENCE_READER_STATE_MIGRATION_EXTENSION_PACKAGE,
  COHERENCE_READER_STATE_MIGRATION_EXTENSION_VERSION,
  assertCoherenceReaderStateMigrationProjection,
  type CoherenceReaderStateMigrationProjection,
} from "./reader-state-migration-extension-contract";
import {
  parseCoherenceReaderStateMigrationArtifact,
  type CoherenceReaderStateMigrationArtifact,
} from "./reader-state-migration-schema";

type JsonRecord = Record<string, unknown>;

export type CoherencePublisherRuntimeMigrationBinding = Readonly<{
  extensionData: PublisherExtensionDataEnvelope;
  projection: CoherenceReaderStateMigrationProjection;
  migrationArtifact: CoherenceReaderStateMigrationArtifact;
}>;

function fail(message: string): never {
  throw new TypeError(`Coherence Publisher runtime artifacts: ${message}`);
}

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index]);
}

function exactStringArray(
  value: unknown,
  expected: readonly string[],
): boolean {
  return Array.isArray(value) && value.length === expected.length &&
    value.every((item, index) => item === expected[index]);
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      fail("an artifact contains a nonfinite number.");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const object = record(value);
  if (object === null) {
    fail("an artifact is not finite canonical JSON.");
  }
  return `{${Object.keys(object).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(object[key])}`
  ).join(",")}}`;
}

function sha256Text(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function canonicalHash(value: unknown): string {
  return sha256Text(canonicalJson(value));
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function validateCoherencePublisherRuntimeMigrationArtifacts(input: Readonly<{
  reader: unknown;
  extensionData: unknown;
  migrationText: string;
}>): CoherencePublisherRuntimeMigrationBinding {
  const reader = record(input.reader);
  if (
    reader === null ||
    typeof reader.publicationId !== "string" ||
    typeof reader.engineVersion !== "string" ||
    typeof reader.buildId !== "string"
  ) {
    fail("the Reader identity is invalid.");
  }

  const extensionData = record(input.extensionData);
  if (
    extensionData === null ||
    !exactKeys(extensionData, [
      "buildId",
      "engineVersion",
      "extensions",
      "publicationId",
      "readerBuildId",
      "schemaVersion",
    ]) ||
    extensionData.schemaVersion !== "1.0" ||
    extensionData.publicationId !== reader.publicationId ||
    extensionData.engineVersion !== reader.engineVersion ||
    extensionData.readerBuildId !== reader.buildId ||
    typeof extensionData.buildId !== "string" ||
    !Array.isArray(extensionData.extensions) ||
    extensionData.extensions.length !== 1
  ) {
    fail("the extension envelope does not match the exact Reader build.");
  }
  const extensionBasis = Object.freeze({
    schemaVersion: extensionData.schemaVersion,
    publicationId: extensionData.publicationId,
    engineVersion: extensionData.engineVersion,
    readerBuildId: extensionData.readerBuildId,
    extensions: extensionData.extensions,
  });
  if (canonicalHash(extensionBasis) !== extensionData.buildId) {
    fail("the extension envelope build identity is invalid.");
  }

  const extension = record(extensionData.extensions[0]);
  if (
    extension === null ||
    !exactKeys(extension, [
      "capabilities",
      "clientData",
      "config",
      "id",
      "offlineResources",
      "package",
      "version",
    ]) ||
    extension.id !== COHERENCE_READER_STATE_MIGRATION_EXTENSION_ID ||
    extension.package !== COHERENCE_READER_STATE_MIGRATION_EXTENSION_PACKAGE ||
    extension.version !== COHERENCE_READER_STATE_MIGRATION_EXTENSION_VERSION ||
    !exactStringArray(
      extension.capabilities,
      COHERENCE_READER_STATE_MIGRATION_EXTENSION_CAPABILITIES,
    ) ||
    record(extension.config) === null ||
    Object.keys(extension.config as JsonRecord).length !== 0
  ) {
    fail("the migration extension entry is invalid.");
  }

  assertCoherenceReaderStateMigrationProjection(extension.clientData);
  const projection = extension.clientData;
  if (
    projection.publicationId !== reader.publicationId ||
    projection.artifact.readerBuildId !== reader.buildId
  ) {
    fail("the migration projection does not match the exact Reader build.");
  }
  const offlineResources = extension.offlineResources;
  const offlineResource = Array.isArray(offlineResources)
    ? record(offlineResources[0])
    : null;
  if (
    !Array.isArray(offlineResources) ||
    offlineResources.length !== 1 ||
    offlineResource === null ||
    !exactKeys(offlineResource, ["byteSize", "href", "kind"]) ||
    offlineResource.href !== projection.artifact.href ||
    offlineResource.kind !== "data" ||
    offlineResource.byteSize !== projection.artifact.byteSize
  ) {
    fail("the migration extension offline resource is invalid.");
  }

  if (typeof input.migrationText !== "string") {
    fail("the migration artifact text is invalid.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.migrationText) as unknown;
  } catch {
    fail("the migration artifact is not JSON.");
  }
  const migrationArtifact = parseCoherenceReaderStateMigrationArtifact(parsed);
  if (migrationArtifact === null) {
    fail("the migration artifact shape is invalid.");
  }
  const { buildId: migrationBuildId, ...migrationBasis } = migrationArtifact;
  if (
    canonicalJson(migrationArtifact) !== input.migrationText ||
    canonicalHash(migrationBasis) !== migrationBuildId ||
    migrationArtifact.publicationId !== reader.publicationId ||
    migrationArtifact.readerBuildId !== reader.buildId ||
    migrationArtifact.href !== projection.artifact.href ||
    migrationArtifact.buildId !== projection.artifact.buildId ||
    utf8ByteLength(input.migrationText) !== projection.artifact.byteSize ||
    sha256Text(input.migrationText) !== projection.artifact.sha256
  ) {
    fail("the migration artifact does not match its exact projection.");
  }

  return Object.freeze({
    extensionData:
      extensionData as unknown as PublisherExtensionDataEnvelope,
    projection,
    migrationArtifact,
  });
}
