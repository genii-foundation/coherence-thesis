import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const publisherPreview = vi.hoisted(() => ({
  enabled: false,
}));

vi.mock("@/components/CoherenceSiteFrame", () => ({
  CoherenceSiteFrame: ({ children }: { children: ReactNode }) => (
    <div data-coherence-site-frame="">{children}</div>
  ),
}));
vi.mock("@/publisher/preview-mode", () => ({
  loadCoherencePublisherPreviewApplication: async () =>
    publisherPreview.enabled ? {} : null,
}));

import PublisherManuscriptLayout from "./layout";

describe("manuscript layout transition boundary", () => {
  beforeEach(() => {
    publisherPreview.enabled = false;
  });

  it("retains the Coherence shell by default", async () => {
    const markup = renderToStaticMarkup(
      await PublisherManuscriptLayout({
        children: <article>Coherence manuscript</article>,
      }),
    );

    expect(markup).toContain("data-coherence-site-frame");
    expect(markup).toContain("Coherence manuscript");
  });

  it("does not nest the Coherence shell around a Publisher preview", async () => {
    publisherPreview.enabled = true;

    const markup = renderToStaticMarkup(
      await PublisherManuscriptLayout({
        children: <article data-publisher-root="">Publisher manuscript</article>,
      }),
    );

    expect(markup).toContain("data-publisher-root");
    expect(markup).not.toContain("data-coherence-site-frame");
  });
});
