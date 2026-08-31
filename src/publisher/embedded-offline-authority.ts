import "server-only";

import { createHash } from "node:crypto";
import type { PublicationNextApplication } from "@genii-foundation/publisher-next/server";
import type { PublisherNextThemeAppearanceProjection } from "@genii-foundation/publisher-next/theme";
import trackedCandidate from "./embedded-offline-candidate.json";
import { coherencePublisherEmbeddedHostSourcesBuildId } from "./embedded-offline-host-identity";
import {
  coherencePublisherEmbeddedCanvasProperties,
  coherencePublisherEmbeddedSchemeByTheme,
} from "./embedded-reader-appearance";

const SHA256 = /^sha256:[0-9a-f]{64}$/u;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const object = record(value);
  if (object === null) {
    throw new TypeError("Embedded offline authority is not canonical JSON.");
  }
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

function hashCanonicalJson(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(canonicalJson(value), "utf8")
    .digest("hex")}`;
}

function requireSha256(value: string, label: string): void {
  if (!SHA256.test(value)) {
    throw new TypeError(`${label} must be one lowercase SHA-256 identity.`);
  }
}

const { buildId: trackedCandidateBuildId, ...trackedCandidateIdentity } =
  trackedCandidate;

if (hashCanonicalJson(trackedCandidateIdentity) !== trackedCandidateBuildId) {
  throw new TypeError("Tracked Publisher candidate identity is invalid.");
}

export const coherencePublisherEmbeddedCandidateBuildId =
  trackedCandidateBuildId;

export type CoherencePublisherEmbeddedOfflineAuthorityBasis = Readonly<{
  applicationArtifactBuildId: string;
  applicationBuildId: string;
  appearanceBuildId: string;
  candidateBuildId: string;
  extensionBuildId: string;
  hostSourcesBuildId: string;
  migrationBuildId: string;
  narrationBuildId: string;
  offlineCatalogBuildId: string;
  publicationId: string;
  readerBuildId: string;
  schemaVersion: "1.0";
}>;

export type CoherencePublisherEmbeddedOfflineAuthority =
  CoherencePublisherEmbeddedOfflineAuthorityBasis & Readonly<{
    buildId: string;
  }>;

export function createCoherencePublisherEmbeddedOfflineAuthorityBuildId(
  basis: CoherencePublisherEmbeddedOfflineAuthorityBasis,
): string {
  for (const [label, value] of Object.entries(basis)) {
    if (label === "publicationId" || label === "schemaVersion") continue;
    requireSha256(value, label);
  }
  if (basis.schemaVersion !== "1.0" || basis.publicationId.length === 0) {
    throw new TypeError("Embedded offline authority identity is invalid.");
  }
  return hashCanonicalJson(basis);
}

export function createCoherencePublisherEmbeddedOfflineAuthority(input: Readonly<{
  application: Pick<
    PublicationNextApplication,
    "artifact" | "manifest" | "offlineCatalog" | "reader"
  >;
  extensionBuildId: string;
  migrationBuildId: string;
  narrationBuildId: string;
  themeAppearance: PublisherNextThemeAppearanceProjection;
}>): CoherencePublisherEmbeddedOfflineAuthority {
  const { application } = input;
  if (
    application.manifest.publicationId !== application.reader.publicationId ||
    application.manifest.source.readerBuildId !== application.reader.buildId ||
    application.artifact.manifest.buildId !== application.manifest.buildId ||
    application.offlineCatalog.publicationId !== application.reader.publicationId ||
    application.offlineCatalog.readerBuildId !== application.reader.buildId ||
    application.offlineCatalog.rendererBuildId !== application.manifest.buildId
  ) {
    throw new TypeError(
      "Publisher application and offline catalog identities do not match.",
    );
  }

  const basis: CoherencePublisherEmbeddedOfflineAuthorityBasis = Object.freeze({
    applicationArtifactBuildId: application.artifact.hash,
    applicationBuildId: application.manifest.buildId,
    appearanceBuildId: hashCanonicalJson({
      canvasProperties: coherencePublisherEmbeddedCanvasProperties,
      schemeByTheme: coherencePublisherEmbeddedSchemeByTheme,
      themeAppearance: input.themeAppearance,
    }),
    candidateBuildId: coherencePublisherEmbeddedCandidateBuildId,
    extensionBuildId: input.extensionBuildId,
    hostSourcesBuildId: coherencePublisherEmbeddedHostSourcesBuildId,
    migrationBuildId: input.migrationBuildId,
    narrationBuildId: input.narrationBuildId,
    offlineCatalogBuildId: hashCanonicalJson(application.offlineCatalog),
    publicationId: application.reader.publicationId,
    readerBuildId: application.reader.buildId,
    schemaVersion: "1.0",
  });
  return Object.freeze({
    ...basis,
    buildId: createCoherencePublisherEmbeddedOfflineAuthorityBuildId(basis),
  });
}
