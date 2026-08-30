import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "font-cormorant" }),
  Fraunces: () => ({ variable: "font-fraunces" }),
  Literata: () => ({ variable: "font-literata" }),
  Newsreader: () => ({ variable: "font-newsreader" }),
  Source_Serif_4: () => ({ variable: "font-source-serif" }),
}));

vi.mock("@/publisher/application", () => ({
  loadCoherencePublisherApplication: async () => ({
    ReaderPrepaint: () => (
      <>
        <script data-publisher-reader-state-bootstrap="" />
        <script data-publisher-reader-prepaint="" />
      </>
    ),
  }),
}));

import RootLayout from "./layout";

describe("root document layout", () => {
  it("places both Reader prepaints exactly once in the document head", async () => {
    const markup = renderToStaticMarkup(
      await RootLayout({ children: <main>Reader content</main> }),
    );
    const head = markup.slice(markup.indexOf("<head>"), markup.indexOf("</head>"));
    const body = markup.slice(markup.indexOf("<body>"));

    expect(head.match(/data-coherence-reader-prepaint/gu)).toHaveLength(1);
    expect(head.match(/data-publisher-reader-state-bootstrap/gu)).toHaveLength(1);
    expect(head.match(/data-publisher-reader-prepaint/gu)).toHaveLength(1);
    expect(head.indexOf("data-publisher-reader-state-bootstrap")).toBeLessThan(
      head.indexOf("data-publisher-reader-prepaint"),
    );
    expect(body).not.toContain("reader-prepaint");
    expect(body).not.toContain("reader-state-bootstrap");
    expect(body).toContain("Reader content");
  });
});
