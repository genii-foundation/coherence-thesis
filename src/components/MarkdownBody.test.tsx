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

    expect(markup.replace(/<[^>]+>/g, "")).toBe("Read this safely.");
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

  it("marks eligible words for focus mode without changing the text", () => {
    const markup = renderToStaticMarkup(
      <MarkdownBody markdown="Alpha, beta 123 and `code`." />,
    );

    expect(markup).toContain("focus-emphasis-light");
    expect(markup).toContain("focus-emphasis-normal");
    expect(markup).toContain("focus-emphasis-strong");
    expect(markup).not.toMatch(/<code>.*focus-emphasis.*<\/code>/);
    expect(markup.replace(/<[^>]+>/g, "")).toBe("Alpha, beta 123 and code.");
  });

  it("renders admin documents without focus spans and with ordered lists", () => {
    const markup = renderToStaticMarkup(
      <MarkdownBody
        markdown={"Use this order:\n\n1. Meaning.\n2. Clarity."}
        focusWords={false}
        orderedLists
      />,
    );

    expect(markup).toContain("<ol><li>Meaning.</li><li>Clarity.</li></ol>");
    expect(markup).not.toContain("focus-word");
  });

  it("places an optional action beside its matching heading", () => {
    const markup = renderToStaticMarkup(
      <MarkdownBody
        markdown={"## 1. Editorial aim\n\nKeep the voice."}
        headingActions={{
          "1. Editorial aim": <button type="button">History</button>,
        }}
      />,
    );

    expect(markup).toContain('class="markdown-heading-row"');
    expect(markup).toContain("<h2>");
    expect(markup).toContain('<button type="button">History</button>');
  });
});
