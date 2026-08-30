import type { CreatePublicationNextApplicationOptions } from "@genii-foundation/publisher-next/server";
import { coherencePublisherTheme } from "@/publisher/coherence-theme";
import { coherenceReaderStateBootstrap } from "@/publisher/reader-state-bootstrap";
import {
  createCoherenceReaderStateMigrationExtensionRegistration,
  type CoherenceReaderStateMigrationProjection,
} from "@/publisher/reader-state-migration-extension";
import type { PublisherExtensionDataEnvelope } from "@genii-foundation/publisher/node";

export type CoherencePublisherApplicationArtifacts = Readonly<{
  reader: unknown;
  extensionData: PublisherExtensionDataEnvelope;
  stateMigrationProjection: CoherenceReaderStateMigrationProjection;
}>;

export function createCoherencePublisherApplicationOptions(
  artifacts: CoherencePublisherApplicationArtifacts,
): CreatePublicationNextApplicationOptions {
  const migrationExtension =
    createCoherenceReaderStateMigrationExtensionRegistration(
      artifacts.stateMigrationProjection,
    );
  return Object.freeze({
    reader: artifacts.reader,
    extensionData: artifacts.extensionData,
    extensions: Object.freeze([migrationExtension]),
    readerStateBootstrap: coherenceReaderStateBootstrap,
    theme: coherencePublisherTheme,
  });
}
