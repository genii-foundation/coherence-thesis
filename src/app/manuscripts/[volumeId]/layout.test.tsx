import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/CoherenceSiteFrame", () => ({
  CoherenceSiteFrame: ({ children }: { children: ReactNode }) => (
    <div data-coherence-site-frame="">{children}</div>
  ),
}));
import PublisherManuscriptLayout from "./layout";

describe("manuscript layout transition boundary", () => {
  it("retains the Coherence shell", () => {
    const markup = renderToStaticMarkup(
      PublisherManuscriptLayout({
        children: <article>Coherence manuscript</article>,
      }),
    );

    expect(markup).toContain("data-coherence-site-frame");
    expect(markup).toContain("Coherence manuscript");
  });

  it("retains the Coherence shell around an embedded Publisher page", () => {
    const markup = renderToStaticMarkup(
      PublisherManuscriptLayout({
        children: (
          <article data-publisher-page="section">Publisher manuscript</article>
        ),
      }),
    );

    expect(markup).toContain("data-publisher-page=\"section\"");
    expect(markup).toContain("data-coherence-site-frame");
  });
});
