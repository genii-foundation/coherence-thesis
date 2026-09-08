import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "font-cormorant" }),
  Fraunces: () => ({ variable: "font-fraunces" }),
  Literata: () => ({ variable: "font-literata" }),
  Newsreader: () => ({ variable: "font-newsreader" }),
  Source_Serif_4: () => ({ variable: "font-source-serif" }),
}));

import RootLayout from "./layout";

describe("root document layout", () => {
  it("keeps Publisher state out of the document", () => {
    const markup = renderToStaticMarkup(
      RootLayout({ children: <main>Reader content</main> }),
    );
    const head = markup.slice(markup.indexOf("<head>"), markup.indexOf("</head>"));
    const body = markup.slice(markup.indexOf("<body>"));

    expect(head.match(/data-coherence-reader-prepaint/gu)).toHaveLength(1);
    expect(head).not.toContain("data-publisher-reader-state-bootstrap");
    expect(head).not.toContain("data-publisher-reader-prepaint");
    expect(body).not.toContain("reader-prepaint");
    expect(body).not.toContain("reader-state-bootstrap");
    expect(body).toContain("Reader content");
  });

  it("retains Coherence prepaint around an embedded Publisher page", () => {
    const markup = renderToStaticMarkup(
      RootLayout({
        children: (
          <main>
            <div data-publisher-page="section">Publisher manuscript</div>
          </main>
        ),
      }),
    );
    const head = markup.slice(markup.indexOf("<head>"), markup.indexOf("</head>"));
    const body = markup.slice(markup.indexOf("<body>"));

    expect(head.match(/data-coherence-reader-prepaint/gu)).toHaveLength(1);
    expect(head).not.toContain("data-publisher-reader-state-bootstrap");
    expect(head).not.toContain("data-publisher-reader-prepaint");
    expect(body).not.toContain("reader-prepaint");
    expect(body).not.toContain("reader-state-bootstrap");
    expect(body).toContain("data-publisher-page=\"section\"");
    expect(body).toContain("Publisher manuscript");
  });
});
