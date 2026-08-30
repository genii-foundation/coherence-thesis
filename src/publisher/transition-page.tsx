import "server-only";
import type { ReactElement } from "react";
import { LegacyFragmentRedirectIsland } from "@/components/LegacyFragmentRedirectIsland";
import { coherencePublisherThemeCanvas } from "@/publisher/coherence-theme-contract";
import { coherencePublisherEmbeddedCanvasProperty } from "@/publisher/embedded-reader-appearance";
import type { CoherencePublisherTransitionPreviewApplication } from "@/publisher/transition-preview-application";

type CoherencePublisherTransitionPage = Parameters<
  CoherencePublisherTransitionPreviewApplication["renderEmbeddedPage"]
>[0];

export async function renderCoherencePublisherTransitionPage(input: Readonly<{
  application: CoherencePublisherTransitionPreviewApplication;
  page: CoherencePublisherTransitionPage;
}>): Promise<ReactElement> {
  const renderedPage = await input.application.renderEmbeddedPage(input.page);

  return (
    <div className="page-frame reader-layout">
      <div
        className="reader-main"
        style={{
          backgroundColor: `var(${coherencePublisherEmbeddedCanvasProperty}, ${coherencePublisherThemeCanvas})`,
        }}
      >
        <LegacyFragmentRedirectIsland />
        {renderedPage}
      </div>
    </div>
  );
}
