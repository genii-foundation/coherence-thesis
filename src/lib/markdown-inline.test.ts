import { describe, expect, it } from "vitest";
import {
  eligibleInlineTextSpans,
  inlineMarkdownVisibleText,
  inlineTextSpans,
  parseInlineMarkdown,
  safeMarkdownLinkHref,
  visitInlineMarkdown,
} from "./markdown-inline";

describe("inline Markdown parsing", () => {
  it("tracks exact raw and visible ranges through nested formatting", () => {
    const source =
      "Before **the *Seed***, [Soil](/soil/), \\*literal\\*, and `code`.";
    const nodes = parseInlineMarkdown(source);
    const visible = inlineMarkdownVisibleText(nodes);
    const spans = inlineTextSpans(nodes);
    const seed = spans.find((span) => span.text === "Seed");
    const soil = spans.find((span) => span.text === "Soil");
    const code = spans.find((span) => span.type === "code");

    expect(visible).toBe("Before the Seed, Soil, *literal*, and code.");
    expect(seed).toMatchObject({
      rawStart: source.indexOf("Seed"),
      rawEnd: source.indexOf("Seed") + "Seed".length,
      visibleStart: visible.indexOf("Seed"),
      visibleEnd: visible.indexOf("Seed") + "Seed".length,
      ancestors: ["strong", "emphasis"],
    });
    expect(soil?.ancestors).toEqual(["link"]);
    expect(code).toMatchObject({
      text: "code",
      ancestors: ["code"],
    });

    const escapedStar = spans.find(
      (span) =>
        span.text === "*" && source.slice(span.rawStart, span.rawEnd) === "\\*",
    );
    expect(escapedStar).toBeDefined();
  });

  it("enumerates eligible prose inside emphasis while excluding links and code", () => {
    const nodes = parseInlineMarkdown(
      "A **Seed** beside [Soil](/soil/) and `Stem`.",
    );
    const eligible = eligibleInlineTextSpans(nodes);

    expect(eligible.some((span) => span.text === "Seed")).toBe(true);
    expect(
      eligible.find((span) => span.text === "Seed")?.ancestors,
    ).toEqual(["strong"]);
    expect(eligible.some((span) => span.text === "Soil")).toBe(false);
    expect(eligible.some((span) => span.text === "Stem")).toBe(false);
  });

  it("exposes a depth first traversal for nested inline context", () => {
    const nodes = parseInlineMarkdown(
      "**[the *Seed*](/manuscripts/1/the-seed/)**",
    );
    const visited: Array<[string, readonly string[]]> = [];
    visitInlineMarkdown(nodes, (node, ancestors) => {
      visited.push([node.type, ancestors]);
    });

    expect(visited.map(([type]) => type)).toEqual([
      "strong",
      "link",
      "text",
      "emphasis",
      "text",
    ]);
    expect(visited.at(-1)?.[1]).toEqual(["strong", "link", "emphasis"]);
  });

  it("keeps malformed delimiters visible instead of dropping prose", () => {
    const source = "Broken **strong and [link](still broken";
    expect(inlineMarkdownVisibleText(parseInlineMarkdown(source))).toBe(source);
  });

  it("represents images without exposing alt text as eligible prose", () => {
    const nodes = parseInlineMarkdown("Before ![Seed](cover.png) after.");

    expect(inlineMarkdownVisibleText(nodes)).toBe("Before  after.");
    expect(eligibleInlineTextSpans(nodes).some((span) => span.text === "Seed"))
      .toBe(false);
    expect(nodes.some((node) => node.type === "image")).toBe(true);
  });
});

describe("safe Markdown destinations", () => {
  it.each([
    "/manuscripts/1/the-seed/",
    "#v01-the-seed",
    "../the-seed/",
    "https://example.com/reference",
    "http://example.com/reference",
    "mailto:reader@example.com",
  ])("accepts %s", (href) => {
    expect(safeMarkdownLinkHref(href)).toBe(href);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "vbscript:unsafe",
    "//example.com/path",
    "https://example.com/unsafe path",
    "https:\\example.com",
  ])("rejects %s", (href) => {
    expect(safeMarkdownLinkHref(href)).toBeNull();
  });
});
