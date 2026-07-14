export type MarkdownInlineContainerType = "strong" | "emphasis" | "link";

type MarkdownInlineNodeBase = {
  rawStart: number;
  rawEnd: number;
  visibleStart: number;
  visibleEnd: number;
};

export type MarkdownInlineTextNode = MarkdownInlineNodeBase & {
  type: "text";
  value: string;
};

export type MarkdownInlineCodeNode = MarkdownInlineNodeBase & {
  type: "code";
  value: string;
  contentRawStart: number;
  contentRawEnd: number;
};

export type MarkdownInlineStrongNode = MarkdownInlineNodeBase & {
  type: "strong";
  children: MarkdownInlineNode[];
};

export type MarkdownInlineEmphasisNode = MarkdownInlineNodeBase & {
  type: "emphasis";
  children: MarkdownInlineNode[];
};

export type MarkdownInlineLinkNode = MarkdownInlineNodeBase & {
  type: "link";
  destination: string;
  children: MarkdownInlineNode[];
};

export type MarkdownInlineImageNode = MarkdownInlineNodeBase & {
  type: "image";
  alt: string;
  destination: string;
};

export type MarkdownInlineNode =
  | MarkdownInlineTextNode
  | MarkdownInlineCodeNode
  | MarkdownInlineStrongNode
  | MarkdownInlineEmphasisNode
  | MarkdownInlineLinkNode
  | MarkdownInlineImageNode;

export type MarkdownInlineAncestor = MarkdownInlineContainerType | "code";

export type MarkdownInlineTextSpan = {
  type: "text" | "code";
  text: string;
  rawStart: number;
  rawEnd: number;
  visibleStart: number;
  visibleEnd: number;
  ancestors: MarkdownInlineAncestor[];
};

type ParseResult = {
  nodes: MarkdownInlineNode[];
  rawIndex: number;
  visibleIndex: number;
  closed: boolean;
};

const escapablePunctuation = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;

function textNode(
  value: string,
  rawStart: number,
  rawEnd: number,
  visibleStart: number,
): MarkdownInlineTextNode {
  return {
    type: "text",
    value,
    rawStart,
    rawEnd,
    visibleStart,
    visibleEnd: visibleStart + value.length,
  };
}

function escapedDestination(value: string): string {
  const trimmed = value.trim();
  const unwrapped =
    trimmed.startsWith("<") && trimmed.endsWith(">")
      ? trimmed.slice(1, -1)
      : trimmed;
  return unwrapped.replace(/\\([\\()<>])/g, "$1");
}

function closingParenthesis(source: string, start: number): number | null {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\\" && index + 1 < source.length) {
      index += 1;
      continue;
    }
    if (character === "(") {
      depth += 1;
      continue;
    }
    if (character !== ")") continue;
    if (depth === 0) return index;
    depth -= 1;
  }
  return null;
}

function closingBracket(source: string, start: number): number | null {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\\" && index + 1 < source.length) {
      index += 1;
      continue;
    }
    if (character === "[") {
      depth += 1;
      continue;
    }
    if (character !== "]") continue;
    if (depth === 0) return index;
    depth -= 1;
  }
  return null;
}

function parseImage(
  source: string,
  rawStart: number,
  visibleStart: number,
): MarkdownInlineImageNode | null {
  if (!source.startsWith("![", rawStart)) return null;
  const labelEnd = closingBracket(source, rawStart + 2);
  if (labelEnd === null || source[labelEnd + 1] !== "(") return null;
  const destinationEnd = closingParenthesis(source, labelEnd + 2);
  if (destinationEnd === null) return null;

  return {
    type: "image",
    alt: source.slice(rawStart + 2, labelEnd),
    destination: escapedDestination(
      source.slice(labelEnd + 2, destinationEnd),
    ),
    rawStart,
    rawEnd: destinationEnd + 1,
    visibleStart,
    visibleEnd: visibleStart,
  };
}

function parseCode(
  source: string,
  rawStart: number,
  visibleStart: number,
): MarkdownInlineCodeNode | null {
  if (source[rawStart] !== "`") return null;
  let markerLength = 1;
  while (source[rawStart + markerLength] === "`") markerLength += 1;
  const marker = "`".repeat(markerLength);
  const contentRawStart = rawStart + markerLength;
  const closingStart = source.indexOf(marker, contentRawStart);
  if (closingStart < 0) return null;
  const value = source.slice(contentRawStart, closingStart);

  return {
    type: "code",
    value,
    contentRawStart,
    contentRawEnd: closingStart,
    rawStart,
    rawEnd: closingStart + markerLength,
    visibleStart,
    visibleEnd: visibleStart + value.length,
  };
}

function parseSequence(
  source: string,
  rawStart: number,
  visibleStart: number,
  closingMarker?: string,
): ParseResult {
  const nodes: MarkdownInlineNode[] = [];
  let rawIndex = rawStart;
  let visibleIndex = visibleStart;

  while (rawIndex < source.length) {
    if (closingMarker && source.startsWith(closingMarker, rawIndex)) {
      return { nodes, rawIndex, visibleIndex, closed: true };
    }

    const character = source[rawIndex];
    if (
      character === "\\" &&
      rawIndex + 1 < source.length &&
      escapablePunctuation.test(source[rawIndex + 1] ?? "")
    ) {
      const value = source[rawIndex + 1] ?? "";
      nodes.push(textNode(value, rawIndex, rawIndex + 2, visibleIndex));
      rawIndex += 2;
      visibleIndex += value.length;
      continue;
    }

    const image = parseImage(source, rawIndex, visibleIndex);
    if (image) {
      nodes.push(image);
      rawIndex = image.rawEnd;
      continue;
    }

    const code = parseCode(source, rawIndex, visibleIndex);
    if (code) {
      nodes.push(code);
      rawIndex = code.rawEnd;
      visibleIndex = code.visibleEnd;
      continue;
    }

    if (source.startsWith("**", rawIndex)) {
      const inner = parseSequence(source, rawIndex + 2, visibleIndex, "**");
      if (inner.closed && inner.rawIndex > rawIndex + 2) {
        const rawEnd = inner.rawIndex + 2;
        nodes.push({
          type: "strong",
          children: inner.nodes,
          rawStart: rawIndex,
          rawEnd,
          visibleStart: visibleIndex,
          visibleEnd: inner.visibleIndex,
        });
        rawIndex = rawEnd;
        visibleIndex = inner.visibleIndex;
        continue;
      }
    }

    if (character === "*") {
      const inner = parseSequence(source, rawIndex + 1, visibleIndex, "*");
      if (inner.closed && inner.rawIndex > rawIndex + 1) {
        const rawEnd = inner.rawIndex + 1;
        nodes.push({
          type: "emphasis",
          children: inner.nodes,
          rawStart: rawIndex,
          rawEnd,
          visibleStart: visibleIndex,
          visibleEnd: inner.visibleIndex,
        });
        rawIndex = rawEnd;
        visibleIndex = inner.visibleIndex;
        continue;
      }
    }

    if (character === "[") {
      const label = parseSequence(source, rawIndex + 1, visibleIndex, "]");
      if (label.closed && source[label.rawIndex + 1] === "(") {
        const destinationEnd = closingParenthesis(source, label.rawIndex + 2);
        if (destinationEnd !== null) {
          const rawEnd = destinationEnd + 1;
          nodes.push({
            type: "link",
            destination: escapedDestination(
              source.slice(label.rawIndex + 2, destinationEnd),
            ),
            children: label.nodes,
            rawStart: rawIndex,
            rawEnd,
            visibleStart: visibleIndex,
            visibleEnd: label.visibleIndex,
          });
          rawIndex = rawEnd;
          visibleIndex = label.visibleIndex;
          continue;
        }
      }
    }

    let textEnd = rawIndex + 1;
    while (textEnd < source.length) {
      if (closingMarker && source.startsWith(closingMarker, textEnd)) break;
      const next = source[textEnd];
      if (
        next === "*" ||
        next === "`" ||
        next === "[" ||
        (next === "!" && source[textEnd + 1] === "[") ||
        (next === "\\" &&
          textEnd + 1 < source.length &&
          escapablePunctuation.test(source[textEnd + 1] ?? ""))
      ) {
        break;
      }
      textEnd += 1;
    }
    const value = source.slice(rawIndex, textEnd);
    nodes.push(textNode(value, rawIndex, textEnd, visibleIndex));
    rawIndex = textEnd;
    visibleIndex += value.length;
  }

  return { nodes, rawIndex, visibleIndex, closed: !closingMarker };
}

export function parseInlineMarkdown(input: string): MarkdownInlineNode[] {
  return parseSequence(input, 0, 0).nodes;
}

export function visitInlineMarkdown(
  nodes: readonly MarkdownInlineNode[],
  visitor: (
    node: MarkdownInlineNode,
    ancestors: readonly MarkdownInlineAncestor[],
  ) => void,
  ancestors: readonly MarkdownInlineAncestor[] = [],
): void {
  for (const node of nodes) {
    visitor(node, ancestors);
    if (
      node.type !== "strong" &&
      node.type !== "emphasis" &&
      node.type !== "link"
    ) {
      continue;
    }
    visitInlineMarkdown(node.children, visitor, [...ancestors, node.type]);
  }
}

export function inlineTextSpans(
  nodes: readonly MarkdownInlineNode[],
): MarkdownInlineTextSpan[] {
  const spans: MarkdownInlineTextSpan[] = [];
  visitInlineMarkdown(nodes, (node, ancestors) => {
    if (node.type === "text") {
      spans.push({
        type: "text",
        text: node.value,
        rawStart: node.rawStart,
        rawEnd: node.rawEnd,
        visibleStart: node.visibleStart,
        visibleEnd: node.visibleEnd,
        ancestors: [...ancestors],
      });
    }
    if (node.type === "code") {
      spans.push({
        type: "code",
        text: node.value,
        rawStart: node.contentRawStart,
        rawEnd: node.contentRawEnd,
        visibleStart: node.visibleStart,
        visibleEnd: node.visibleEnd,
        ancestors: [...ancestors, "code"],
      });
    }
  });
  return spans;
}

export function eligibleInlineTextSpans(
  nodes: readonly MarkdownInlineNode[],
): MarkdownInlineTextSpan[] {
  return inlineTextSpans(nodes).filter(
    (span) =>
      span.type === "text" &&
      !span.ancestors.includes("link") &&
      !span.ancestors.includes("code"),
  );
}

export function inlineMarkdownVisibleText(
  nodes: readonly MarkdownInlineNode[],
): string {
  return inlineTextSpans(nodes)
    .sort((left, right) => left.visibleStart - right.visibleStart)
    .map((span) => span.text)
    .join("");
}

export function safeMarkdownLinkHref(destination: string): string | null {
  const href = escapedDestination(destination);
  if (!href || /[\u0000-\u0020\u007f\\]/.test(href)) return null;
  if (href.startsWith("//")) return null;
  const scheme = href.match(/^([A-Za-z][A-Za-z0-9+.-]*):/)?.[1]?.toLowerCase();
  if (scheme && !["http", "https", "mailto"].includes(scheme)) return null;
  return href;
}
