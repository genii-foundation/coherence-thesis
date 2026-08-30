import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

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
import Home from "./page";

describe("home route transition boundary", () => {
  it("keeps the current Coherence home authoritative", () => {
    const markup = renderToStaticMarkup(Home());

    expect(markup).toContain("data-coherence-site-frame");
    expect(markup).toContain("Follow the common thread.");
    expect(markup).toContain("data-cover-flow");
    expect(markup).not.toContain("data-publisher-root");
  });
});
