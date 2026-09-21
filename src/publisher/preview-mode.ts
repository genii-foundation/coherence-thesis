import "server-only";
import { isCanonicalRoutePath } from "@genii-foundation/publisher-schema/routes";
import type { CoherencePublisherApplicationRedirect } from "@/publisher/application";
import type { CoherencePublisherTransitionPreviewRuntime } from "@/publisher/transition-preview-application";

export const coherencePublisherPreviewEnvironmentVariable =
  "COHERENCE_PUBLISHER_PREVIEW";

type PublisherPreviewEnvironment = Readonly<{
  COHERENCE_PUBLISHER_PREVIEW?: string;
  NODE_ENV?: string;
}>;

export type CoherencePublisherPreviewSearchParams = Readonly<
  Record<string, string | string[] | undefined>
>;

export function isCoherencePublisherPreviewEnabled(
  environment: PublisherPreviewEnvironment = process.env,
): boolean {
  return (
    environment.NODE_ENV === "development" &&
    environment.COHERENCE_PUBLISHER_PREVIEW === "1"
  );
}

export async function loadCoherencePublisherPreviewRuntime(): Promise<
  CoherencePublisherTransitionPreviewRuntime | null
> {
  if (!isCoherencePublisherPreviewEnabled()) return null;
  const { loadCoherencePublisherApplicationRuntime } = await import(
    "@/publisher/application"
  );
  return loadCoherencePublisherApplicationRuntime();
}

export async function resolveCoherencePublisherPreviewRedirect(
  sourceHref: string,
): Promise<CoherencePublisherApplicationRedirect | null> {
  if (!isCoherencePublisherPreviewEnabled()) return null;
  const { resolveCoherencePublisherApplicationRedirect } = await import(
    "@/publisher/application"
  );
  return resolveCoherencePublisherApplicationRedirect(sourceHref);
}

export function coherencePublisherPreviewRedirectDestination(
  targetHref: string,
  searchParams: CoherencePublisherPreviewSearchParams,
): string {
  if (!isCanonicalRoutePath(targetHref)) {
    throw new TypeError(
      "Coherence Publisher preview redirect target must be an internal path without a query or fragment.",
    );
  }

  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) query.append(name, item);
    } else {
      query.append(name, value);
    }
  }
  const encoded = query.toString();
  return encoded.length === 0 ? targetHref : `${targetHref}?${encoded}`;
}
