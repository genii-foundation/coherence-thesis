import type { CreatePublicationNextApplicationOptions } from "@genii-foundation/publisher-next/server";
import { coherencePublisherTheme } from "@/publisher/coherence-theme";
import { coherenceReaderStateBootstrap } from "@/publisher/reader-state-bootstrap";

export type CoherencePublisherApplicationArtifacts = Readonly<{
  reader: unknown;
}>;

export function createCoherencePublisherApplicationOptions(
  artifacts: CoherencePublisherApplicationArtifacts,
): CreatePublicationNextApplicationOptions {
  return Object.freeze({
    reader: artifacts.reader,
    readerStateBootstrap: coherenceReaderStateBootstrap,
    theme: coherencePublisherTheme,
  });
}
