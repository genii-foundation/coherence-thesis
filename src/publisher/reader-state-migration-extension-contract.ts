import {
  COHERENCE_READER_STATE_MIGRATION_HREF,
  COHERENCE_READER_STATE_MIGRATION_SCHEMA_VERSION,
} from "./reader-state-migration-schema";

export const COHERENCE_READER_STATE_MIGRATION_EXTENSION_ID =
  "coherence-reader-state-migration";
export const COHERENCE_READER_STATE_MIGRATION_EXTENSION_PACKAGE =
  "coherence-reader-state-migration";
export const COHERENCE_READER_STATE_MIGRATION_EXTENSION_VERSION = "1.0.0";
export const COHERENCE_READER_STATE_MIGRATION_EXTENSION_CAPABILITIES =
  Object.freeze(["content.project", "renderer.client"] as const);

export type CoherenceReaderStateMigrationProjection = Readonly<{
  schemaVersion: typeof COHERENCE_READER_STATE_MIGRATION_SCHEMA_VERSION;
  publicationId: string;
  artifact: Readonly<{
    href: typeof COHERENCE_READER_STATE_MIGRATION_HREF;
    readerBuildId: string;
    buildId: string;
    byteSize: number;
    sha256: string;
  }>;
}>;

const SHA256 = /^sha256:[0-9a-f]{64}$/u;

export function createCoherenceReaderStateMigrationBootstrapProjection(
  publicationId: string,
): CoherenceReaderStateMigrationProjection {
  const placeholderSha256 = `sha256:${"0".repeat(64)}`;
  const projection: CoherenceReaderStateMigrationProjection = Object.freeze({
    schemaVersion: COHERENCE_READER_STATE_MIGRATION_SCHEMA_VERSION,
    publicationId,
    artifact: Object.freeze({
      href: COHERENCE_READER_STATE_MIGRATION_HREF,
      readerBuildId: placeholderSha256,
      buildId: placeholderSha256,
      byteSize: 1,
      sha256: placeholderSha256,
    }),
  });
  assertCoherenceReaderStateMigrationProjection(projection);
  return projection;
}

export function assertCoherenceReaderStateMigrationProjection(
  value: unknown,
): asserts value is CoherenceReaderStateMigrationProjection {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Coherence Reader state migration projection is invalid.");
  }
  const projection = value as Record<string, unknown>;
  const artifact = projection.artifact;
  if (
    JSON.stringify(Object.keys(projection).sort()) !==
      JSON.stringify(["artifact", "publicationId", "schemaVersion"]) ||
    projection.schemaVersion !== COHERENCE_READER_STATE_MIGRATION_SCHEMA_VERSION ||
    typeof projection.publicationId !== "string" ||
    projection.publicationId.length === 0 ||
    projection.publicationId.length > 512 ||
    artifact === null || typeof artifact !== "object" || Array.isArray(artifact)
  ) {
    throw new TypeError("Coherence Reader state migration projection is invalid.");
  }
  const identity = artifact as Record<string, unknown>;
  if (
    JSON.stringify(Object.keys(identity).sort()) !==
      JSON.stringify(["buildId", "byteSize", "href", "readerBuildId", "sha256"]) ||
    identity.href !== COHERENCE_READER_STATE_MIGRATION_HREF ||
    typeof identity.readerBuildId !== "string" ||
    !SHA256.test(identity.readerBuildId) ||
    typeof identity.buildId !== "string" ||
    !SHA256.test(identity.buildId) ||
    !Number.isSafeInteger(identity.byteSize) ||
    (identity.byteSize as number) < 1 ||
    (identity.byteSize as number) > 8_388_608 ||
    typeof identity.sha256 !== "string" ||
    !SHA256.test(identity.sha256)
  ) {
    throw new TypeError("Coherence Reader state migration artifact identity is invalid.");
  }
}
