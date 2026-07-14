import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownBody } from "./MarkdownBody";

describe("MarkdownBody inline links", () => {
  it("renders nested emphasis and safe links on the server", () => {
    const markup = renderToStaticMarkup(
      <MarkdownBody
        markdown="Read **[the *Seed*](/manuscripts/1/the-seed/)** next."
      />,
    );

    expect(markup).toContain(
      '<strong><a href="/manuscripts/1/the-seed/">the <em>Seed</em></a></strong>',
    );
  });

  it("renders unsafe link labels as prose without a navigable anchor", () => {
    const markup = renderToStaticMarkup(
      <MarkdownBody markdown="Read [this](javascript:alert(1)) safely." />,
    );

    expect(markup).toContain("Read this safely.");
    expect(markup).not.toContain("javascript:");
    expect(markup).not.toContain("<a");
  });

  it("keeps audio word indexes and character offsets continuous across links", () => {
    const markup = renderToStaticMarkup(
      <MarkdownBody
        markdown="Before **[Seed](/manuscripts/1/the-seed/)** after."
        sectionId="v01-example"
      />,
    );

    expect(markup).toContain('id="audio-word-v01-example-0"');
    expect(markup).toContain('id="audio-word-v01-example-1"');
    expect(markup).toContain('id="audio-word-v01-example-2"');
    expect(markup).toContain('data-audio-char-start="0"');
    expect(markup).toContain('data-audio-char-start="7"');
    expect(markup).toContain('data-audio-char-start="12"');
    expect(markup).toContain(
      '<a href="/manuscripts/1/the-seed/"><span id="audio-word-v01-example-1"',
    );
  });
});
