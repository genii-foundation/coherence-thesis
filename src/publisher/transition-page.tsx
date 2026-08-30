import "server-only";
import type { ReactElement } from "react";
import { LegacyFragmentRedirectIsland } from "@/components/LegacyFragmentRedirectIsland";
import type { CoherencePublisherTransitionPreviewApplication } from "@/publisher/transition-preview-application";

type CoherencePublisherTransitionPage = Parameters<
  CoherencePublisherTransitionPreviewApplication["renderPage"]
>[0];

export async function renderCoherencePublisherTransitionPage(input: Readonly<{
  application: CoherencePublisherTransitionPreviewApplication;
  page: CoherencePublisherTransitionPage;
}>): Promise<ReactElement> {
  const renderedPage = await input.application.renderPage(input.page);

  return (
    <>
      <LegacyFragmentRedirectIsland />
      {renderedPage}
    </>
  );
}
