import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const publisherPreview = vi.hoisted(() => ({
  application: null as null | Readonly<{
    ReaderPrepaint: () => React.ReactNode;
  }>,
}));
const loadPreviewApplication = vi.hoisted(() => vi.fn());

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "font-cormorant" }),
  Fraunces: () => ({ variable: "font-fraunces" }),
  Literata: () => ({ variable: "font-literata" }),
  Newsreader: () => ({ variable: "font-newsreader" }),
  Source_Serif_4: () => ({ variable: "font-source-serif" }),
}));

vi.mock("@/publisher/preview-mode", () => ({
  loadCoherencePublisherPreviewApplication: async () => {
    loadPreviewApplication();
    return publisherPreview.application;
  },
}));

import RootLayout from "./layout";

describe("root document layout", () => {
  beforeEach(() => {
    publisherPreview.application = null;
    loadPreviewApplication.mockClear();
  });

  it("keeps Publisher state out of the default document", async () => {
    const markup = renderToStaticMarkup(
      await RootLayout({ children: <main>Reader content</main> }),
    );
    const head = markup.slice(markup.indexOf("<head>"), markup.indexOf("</head>"));
    const body = markup.slice(markup.indexOf("<body>"));

    expect(head.match(/data-coherence-reader-prepaint/gu)).toHaveLength(1);
    expect(head).not.toContain("data-publisher-reader-state-bootstrap");
    expect(head).not.toContain("data-publisher-reader-prepaint");
    expect(body).not.toContain("reader-prepaint");
    expect(body).not.toContain("reader-state-bootstrap");
    expect(body).toContain("Reader content");
    expect(loadPreviewApplication).toHaveBeenCalledOnce();
  });

  it("uses only Publisher prepaint state for explicit local review", async () => {
    publisherPreview.application = {
      ReaderPrepaint: () => (
        <>
          <script data-publisher-reader-state-bootstrap="" />
          <script data-publisher-reader-prepaint="" />
        </>
      ),
    };

    const markup = renderToStaticMarkup(
      await RootLayout({ children: <main>Reader content</main> }),
    );
    const head = markup.slice(markup.indexOf("<head>"), markup.indexOf("</head>"));
    const body = markup.slice(markup.indexOf("<body>"));

    expect(head).not.toContain("data-coherence-reader-prepaint");
    expect(head.match(/data-publisher-reader-state-bootstrap/gu)).toHaveLength(1);
    expect(head.match(/data-publisher-reader-prepaint/gu)).toHaveLength(1);
    expect(head.indexOf("data-publisher-reader-state-bootstrap")).toBeLessThan(
      head.indexOf("data-publisher-reader-prepaint"),
    );
    expect(body).not.toContain("reader-prepaint");
    expect(body).not.toContain("reader-state-bootstrap");
    expect(body).toContain("Reader content");
    expect(loadPreviewApplication).toHaveBeenCalledOnce();
  });
});
