import type { PublicationNextApplication } from "@genii-foundation/publisher-next/server";

export type CoherencePublisherTransitionPreviewApplication = Readonly<
  Pick<
    PublicationNextApplication,
    "ReaderPrepaint" | "RootPage" | "renderPage" | "resolveRoute"
  >
>;

export type CoherencePublisherTransitionPreviewBoundary = Readonly<{
  applicationOptionKeys: readonly ["reader", "readerStateBootstrap", "theme"];
  absentApplicationOptionKeys: readonly [
    "audioData",
    "extensionData",
    "extensions",
    "syncData",
    "updates",
    "updatesData",
  ];
  exposedApplicationKeys: readonly [
    "ReaderPrepaint",
    "RootPage",
    "renderPage",
    "resolveRoute",
  ];
  readerProvidersExposed: false;
  rootLayoutExposed: false;
}>;

export const coherencePublisherTransitionPreviewBoundary = Object.freeze({
  applicationOptionKeys: Object.freeze([
    "reader",
    "readerStateBootstrap",
    "theme",
  ] as const),
  absentApplicationOptionKeys: Object.freeze([
    "audioData",
    "extensionData",
    "extensions",
    "syncData",
    "updates",
    "updatesData",
  ] as const),
  exposedApplicationKeys: Object.freeze([
    "ReaderPrepaint",
    "RootPage",
    "renderPage",
    "resolveRoute",
  ] as const),
  readerProvidersExposed: false as const,
  rootLayoutExposed: false as const,
}) satisfies CoherencePublisherTransitionPreviewBoundary;

export function createCoherencePublisherTransitionPreviewApplication(
  application: PublicationNextApplication,
): CoherencePublisherTransitionPreviewApplication {
  /* The reviewed Publisher application exposes these as closure-based,
     receiver-independent functions. Reverify that contract before updating the
     pinned Publisher candidate because calls through this facade use the
     facade, not the full application, as their JavaScript receiver. */
  return Object.freeze({
    ReaderPrepaint: application.ReaderPrepaint,
    RootPage: application.RootPage,
    renderPage: application.renderPage,
    resolveRoute: application.resolveRoute,
  });
}
