import type { PublisherExtensionRegistration } from "@genii-foundation/publisher/node";

import { CoherenceReaderStateMigrationClient } from "./reader-state-migration-extension-client";
import {
  assertCoherenceReaderStateMigrationProjection,
  createCoherenceReaderStateMigrationBootstrapProjection,
  COHERENCE_READER_STATE_MIGRATION_EXTENSION_CAPABILITIES,
  COHERENCE_READER_STATE_MIGRATION_EXTENSION_ID,
  COHERENCE_READER_STATE_MIGRATION_EXTENSION_PACKAGE,
  COHERENCE_READER_STATE_MIGRATION_EXTENSION_VERSION,
  type CoherenceReaderStateMigrationProjection,
} from "./reader-state-migration-extension-contract";

export {
  assertCoherenceReaderStateMigrationProjection,
  createCoherenceReaderStateMigrationBootstrapProjection,
  COHERENCE_READER_STATE_MIGRATION_EXTENSION_CAPABILITIES,
  COHERENCE_READER_STATE_MIGRATION_EXTENSION_ID,
  COHERENCE_READER_STATE_MIGRATION_EXTENSION_PACKAGE,
  COHERENCE_READER_STATE_MIGRATION_EXTENSION_VERSION,
};
export type { CoherenceReaderStateMigrationProjection };

export function createCoherenceReaderStateMigrationExtensionRegistration(
  projection: CoherenceReaderStateMigrationProjection,
): PublisherExtensionRegistration {
  assertCoherenceReaderStateMigrationProjection(projection);
  return Object.freeze({
    id: COHERENCE_READER_STATE_MIGRATION_EXTENSION_ID,
    package: COHERENCE_READER_STATE_MIGRATION_EXTENSION_PACKAGE,
    version: COHERENCE_READER_STATE_MIGRATION_EXTENSION_VERSION,
    engineCompatibility: ">=0.1.0-alpha.0 <0.2.0",
    capabilities: COHERENCE_READER_STATE_MIGRATION_EXTENSION_CAPABILITIES,
    implementation: Object.freeze({
      kind: "genii.publisher.extension" as const,
      apiVersion: "1.0" as const,
      project({ content }: { content: { publicationId: string } }) {
        if (content.publicationId !== projection.publicationId) {
          throw new TypeError(
            "Coherence Reader state migration publication identity drifted.",
          );
        }
        return Object.freeze({
          valid: true as const,
          value: Object.freeze({
            clientData: projection,
            offlineResources: Object.freeze([
              Object.freeze({
                href: projection.artifact.href,
                kind: "data" as const,
                byteSize: projection.artifact.byteSize,
              }),
            ]),
          }),
          diagnostics: Object.freeze([]),
        });
      },
    }),
    renderer: Object.freeze({
      kind: "genii.publisher.next-extension" as const,
      apiVersion: "1.0" as const,
      rendererCompatibility: ">=0.1.0-alpha.0 <0.2.0",
      Client: CoherenceReaderStateMigrationClient,
    }),
  });
}

export function createCoherenceReaderStateMigrationBootstrapExtensionRegistration(
  publicationId: string,
): PublisherExtensionRegistration {
  return createCoherenceReaderStateMigrationExtensionRegistration(
    createCoherenceReaderStateMigrationBootstrapProjection(publicationId),
  );
}
