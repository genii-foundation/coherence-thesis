import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadCoherencePublisherPreviewRuntime: vi.fn(),
}));

vi.mock("@/components/CoherenceSiteFrame", () => ({
  CoherenceSiteFrame: ({
    children,
    publisherOfflineAuthorityBuildId,
  }: {
    children: ReactNode;
    publisherOfflineAuthorityBuildId?: string | null;
  }) => (
    <div
      data-coherence-site-frame=""
      data-publisher-offline-authority={
        publisherOfflineAuthorityBuildId ?? "unavailable"
      }
    >
      {children}
    </div>
  ),
}));
vi.mock("@/publisher/preview-mode", () => ({
  loadCoherencePublisherPreviewRuntime:
    mocks.loadCoherencePublisherPreviewRuntime,
}));
import PublisherManuscriptLayout from "./layout";

const publisherOfflineAuthorityBuildId =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("manuscript layout transition boundary", () => {
  beforeEach(() => {
    mocks.loadCoherencePublisherPreviewRuntime.mockReset();
    mocks.loadCoherencePublisherPreviewRuntime.mockResolvedValue(null);
  });

  it("retains the Coherence shell and fails closed without authority", async () => {
    const markup = renderToStaticMarkup(
      await PublisherManuscriptLayout({
        children: <article>Coherence manuscript</article>,
      }),
    );

    expect(markup).toContain("data-coherence-site-frame");
    expect(markup).toContain('data-publisher-offline-authority="unavailable"');
    expect(markup).toContain("Coherence manuscript");
  });

  it("passes exact authority through the retained shell", async () => {
    mocks.loadCoherencePublisherPreviewRuntime.mockResolvedValue({
      offlineAuthority: { buildId: publisherOfflineAuthorityBuildId },
    });
    const markup = renderToStaticMarkup(
      await PublisherManuscriptLayout({
        children: (
          <article data-publisher-page="section">Publisher manuscript</article>
        ),
      }),
    );

    expect(markup).toContain("data-publisher-page=\"section\"");
    expect(markup).toContain("data-coherence-site-frame");
    expect(markup).toContain(
      `data-publisher-offline-authority="${publisherOfflineAuthorityBuildId}"`,
    );
  });
});
