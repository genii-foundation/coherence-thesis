import "server-only";
import type { CoherencePublisherTransitionPreviewApplication } from "@/publisher/transition-preview-application";

export const coherencePublisherPreviewEnvironmentVariable =
  "COHERENCE_PUBLISHER_PREVIEW";

type PublisherPreviewEnvironment = Readonly<{
  COHERENCE_PUBLISHER_PREVIEW?: string;
  NODE_ENV?: string;
}>;

export function isCoherencePublisherPreviewEnabled(
  environment: PublisherPreviewEnvironment = process.env,
): boolean {
  return (
    environment.NODE_ENV === "development" &&
    environment.COHERENCE_PUBLISHER_PREVIEW === "1"
  );
}

export async function loadCoherencePublisherPreviewApplication(): Promise<
  CoherencePublisherTransitionPreviewApplication | null
> {
  if (!isCoherencePublisherPreviewEnabled()) return null;
  const { loadCoherencePublisherApplication } = await import(
    "@/publisher/application"
  );
  return loadCoherencePublisherApplication();
}
