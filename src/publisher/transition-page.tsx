import "server-only";
import type { ReactElement } from "react";
import { LegacyFragmentRedirectIsland } from "@/components/LegacyFragmentRedirectIsland";
import { coherencePublisherThemeCanvas } from "@/publisher/coherence-theme-contract";
import { coherencePublisherEmbeddedCanvasProperty } from "@/publisher/embedded-reader-appearance";
import { createCoherencePublisherLegacyFragmentModel } from "@/publisher/legacy-fragment-continuity";
import type { CoherenceReaderStateMigrationArtifact } from "@/publisher/reader-state-migration-schema";
import type { CoherencePublisherTransitionPreviewApplication } from "@/publisher/transition-preview-application";

type CoherencePublisherTransitionPage = Parameters<
  CoherencePublisherTransitionPreviewApplication["renderEmbeddedPage"]
>[0];

export async function renderCoherencePublisherTransitionPage(input: Readonly<{
  application: CoherencePublisherTransitionPreviewApplication;
  migrationArtifact: CoherenceReaderStateMigrationArtifact;
  page: CoherencePublisherTransitionPage;
}>): Promise<ReactElement> {
  const renderedPage = await input.application.renderEmbeddedPage(input.page);
  const publisherFragmentModel =
    createCoherencePublisherLegacyFragmentModel(
      input.page,
      input.migrationArtifact,
    );

  return (
    <div className="page-frame reader-layout">
      <div
        className="reader-main"
        style={{
          backgroundColor: `var(${coherencePublisherEmbeddedCanvasProperty}, ${coherencePublisherThemeCanvas})`,
        }}
      >
        <LegacyFragmentRedirectIsland
          publisherFragmentModel={publisherFragmentModel}
        />
        {renderedPage}
      </div>
    </div>
  );
}
