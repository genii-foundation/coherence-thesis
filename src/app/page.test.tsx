import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const publisherPreview = vi.hoisted(() => ({
  application: null as null | Readonly<{
    RootPage: () => Promise<ReactNode>;
  }>,
}));

vi.mock("next/font/google", () => ({
  Bellefair: () => ({ className: "hero-stats-font" }),
}));
vi.mock("next/image", () => ({
  default: () => <span data-cover-image="" />,
}));
vi.mock("@/components/CoherenceSiteFrame", () => ({
  CoherenceSiteFrame: ({ children }: { children: ReactNode }) => (
    <div data-coherence-site-frame="">{children}</div>
  ),
}));
vi.mock("@/components/HeroActionsIsland", () => ({
  HeroActionsIsland: () => <div data-hero-actions="" />,
}));
vi.mock("@/components/HeroStats", () => ({
  HeroStats: () => <div data-hero-stats="" />,
}));
vi.mock("@/components/ManuscriptCoverFlowIsland", () => ({
  ManuscriptCoverFlowIsland: () => <div data-cover-flow="" />,
}));
vi.mock("@/lib/manuscript-data", () => ({
  catalog: {
    sections: [
      {
        href: "/manuscripts/1/first/",
        readerHref: "/manuscripts/1/first/",
        volumeId: "volume-1",
      },
    ],
    volumes: [{ href: "/manuscripts/1/", volumeId: "volume-1" }],
  },
}));
vi.mock("@/publisher/preview-mode", () => ({
  loadCoherencePublisherPreviewApplication: async () =>
    publisherPreview.application,
}));

import Home from "./page";

describe("home route transition boundary", () => {
  beforeEach(() => {
    publisherPreview.application = null;
  });

  it("keeps the current Coherence home authoritative by default", async () => {
    const markup = renderToStaticMarkup(await Home());

    expect(markup).toContain("data-coherence-site-frame");
    expect(markup).toContain("Follow the common thread.");
    expect(markup).toContain("data-cover-flow");
    expect(markup).not.toContain("data-publisher-root");
  });

  it("uses Publisher's root page only in the explicit preview process", async () => {
    publisherPreview.application = {
      RootPage: async () => <div data-publisher-root="">Publisher home</div>,
    };

    const markup = renderToStaticMarkup(await Home());

    expect(markup).toContain("data-publisher-root");
    expect(markup).not.toContain("data-coherence-site-frame");
    expect(markup).not.toContain("Follow the common thread.");
  });
});
