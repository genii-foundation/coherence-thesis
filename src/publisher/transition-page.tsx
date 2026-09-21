import "server-only";
import type { CSSProperties, ReactElement } from "react";
import type { PublisherNextThemeAppearanceProjection } from "@genii-foundation/publisher-next/theme";
import { LegacyFragmentRedirectIsland } from "@/components/LegacyFragmentRedirectIsland";
import { ReaderEngagementIsland } from "@/components/ReaderEngagementIsland";
import { allSections } from "@/lib/manuscript-data";
import {
  coherencePublisherEmbeddedCanvasProperties,
  coherencePublisherEmbeddedCanvasProperty,
} from "@/publisher/embedded-reader-appearance";
import { CoherencePublisherAudioWordBridgeClient } from "@/publisher/legacy-audio-word-bridge-client";
import {
  createCoherencePublisherAudioWordRouteModel,
  type CoherencePublisherAudioWordAuthority,
} from "@/publisher/legacy-audio-word-bridge";
import { CoherencePublisherBookmarkBridgeClient } from "@/publisher/legacy-reader-bookmark-bridge-client";
import { createCoherencePublisherBookmarkRouteModel } from "@/publisher/legacy-reader-bookmark-bridge";
import { createCoherencePublisherLegacyFragmentModel } from "@/publisher/legacy-fragment-continuity";
import { createCoherencePublisherLegacyProgressModel } from "@/publisher/legacy-reader-progress-bridge";
import type { CoherenceReaderStateMigrationArtifact } from "@/publisher/reader-state-migration-schema";
import type { CoherencePublisherTransitionPreviewApplication } from "@/publisher/transition-preview-application";

type CoherencePublisherTransitionPage = Parameters<
  CoherencePublisherTransitionPreviewApplication["renderEmbeddedPage"]
>[0];

type CoherencePublisherCanvasStyle = CSSProperties &
  Record<
    (typeof coherencePublisherEmbeddedCanvasProperties)[keyof typeof coherencePublisherEmbeddedCanvasProperties],
    string
  >;

export async function renderCoherencePublisherTransitionPage(input: Readonly<{
  application: CoherencePublisherTransitionPreviewApplication;
  migrationArtifact: CoherenceReaderStateMigrationArtifact;
  narrationWordAuthority: CoherencePublisherAudioWordAuthority;
  offlineAuthorityBuildId: string;
  page: CoherencePublisherTransitionPage;
  themeAppearance: PublisherNextThemeAppearanceProjection;
}>): Promise<ReactElement> {
  const renderedPage = await input.application.renderEmbeddedPage(input.page);
  const narrationWordModel = createCoherencePublisherAudioWordRouteModel(
    input.page,
    input.narrationWordAuthority,
  );
  const publisherFragmentModel =
    createCoherencePublisherLegacyFragmentModel(
      input.page,
      input.migrationArtifact,
    );
  const legacyProgressModel = createCoherencePublisherLegacyProgressModel(
    input.page,
    input.migrationArtifact,
  );
  const bookmarkModel = createCoherencePublisherBookmarkRouteModel(
    input.page,
    input.migrationArtifact,
    allSections(),
  );
  const canvasStyle: CoherencePublisherCanvasStyle = {
    [coherencePublisherEmbeddedCanvasProperties.base]:
      input.themeAppearance.base.canvas,
    [coherencePublisherEmbeddedCanvasProperties.light]:
      input.themeAppearance.light.canvas,
    [coherencePublisherEmbeddedCanvasProperties.dark]:
      input.themeAppearance.dark.canvas,
    [coherencePublisherEmbeddedCanvasProperties.black]:
      input.themeAppearance.black.canvas,
    backgroundColor: `var(${coherencePublisherEmbeddedCanvasProperty}, ${input.themeAppearance.base.canvas})`,
  };

  return (
    <div className="page-frame reader-layout">
      <div
        className="reader-main coherence-publisher-transition-canvas"
        data-coherence-publisher-runtime-build-id={input.offlineAuthorityBuildId}
        data-coherence-publisher-transition-root="true"
        style={canvasStyle}
      >
        {publisherFragmentModel.sections.length === 0
          ? null
          : (
              <LegacyFragmentRedirectIsland
                publisherFragmentModel={publisherFragmentModel}
              />
            )}
        {renderedPage}
        {legacyProgressModel.sections.length === 0
          ? null
          : (
              <ReaderEngagementIsland
                domContract="publisher-embedded"
                initialFragmentPolicy="inert"
                key={`progress:${input.page.path}`}
                sections={legacyProgressModel.sections}
              />
            )}
        {bookmarkModel.sections.length === 0
          ? null
          : (
              <CoherencePublisherBookmarkBridgeClient
                key={input.page.path}
                model={bookmarkModel}
              />
            )}
        {narrationWordModel.sections.length === 0
          ? null
          : (
              <CoherencePublisherAudioWordBridgeClient
                model={narrationWordModel}
              />
            )}
      </div>
    </div>
  );
}
