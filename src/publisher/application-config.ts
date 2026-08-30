import type { CreatePublicationNextApplicationOptions } from "@genii-foundation/publisher-next/server";
import { coherencePublisherTheme } from "@/publisher/coherence-theme";
import { coherenceReaderStateBootstrap } from "@/publisher/reader-state-bootstrap";

export function createCoherencePublisherApplicationOptions(
  reader: unknown,
): CreatePublicationNextApplicationOptions {
  return Object.freeze({
    reader,
    readerStateBootstrap: coherenceReaderStateBootstrap,
    theme: coherencePublisherTheme,
  });
}
