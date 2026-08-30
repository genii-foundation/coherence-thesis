import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/SiteShell", () => ({
  SiteShell: ({ children }: { children: ReactNode }) => (
    <div data-site-shell="">{children}</div>
  ),
}));

import {
  CoherenceReaderPrepaint,
  CoherenceSiteFrame,
} from "./CoherenceSiteFrame";

describe("Coherence site frame", () => {
  it("exposes the preferences bootstrap as one explicit head prepaint", () => {
    const markup = renderToStaticMarkup(<CoherenceReaderPrepaint />);

    expect(markup).toContain("data-coherence-reader-prepaint");
    expect(markup.match(/<script/gu)).toHaveLength(1);
    expect(markup).toContain("localStorage.getItem");
  });

  it("does not emit a body prepaint from the reusable site frame", () => {
    const markup = renderToStaticMarkup(
      <CoherenceSiteFrame>
        <p>Reader content</p>
      </CoherenceSiteFrame>,
    );

    expect(markup).not.toContain("data-coherence-reader-prepaint");
    expect(markup).not.toContain("localStorage.getItem");
    expect(markup).toContain("Reader content");
  });
});
