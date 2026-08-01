import { Fragment, type ReactNode } from "react";
import type { Section } from "@/lib/manuscript-data";
import { audioWordId } from "@/lib/audio-word-anchors";
import { splitMarkdownBlocks } from "@/lib/markdown-blocks";
import {
  parseInlineMarkdown,
  safeMarkdownLinkHref,
  type MarkdownInlineNode,
} from "@/lib/markdown-inline";

type AudioCursor = {
  sectionId: string;
  charIndex: number;
  wordIndex: number;
};

const wordPattern = /[\p{L}\p{N}][\p{L}\p{N}'’]*/gu;
const focusWordPattern = /^\p{L}[\p{L}'’]*$/u;
type FocusTier = "light" | "normal" | "strong";

// Each tier adds a progressively larger but restrained fixation point to the
// same word. CSS changes only its weight, so text stays stable for audio and bookmarks.
function focusWordSegments(
  word: string,
): Array<{ text: string; tier?: FocusTier }> {
  const boundaries = [
    { end: Math.ceil(word.length * 0.15), tier: "light" as const },
    { end: Math.ceil(word.length * 0.25), tier: "normal" as const },
    { end: Math.ceil(word.length * 0.35), tier: "strong" as const },
  ];
  const segments: Array<{ text: string; tier?: FocusTier }> = [];
  let offset = 0;

  for (const boundary of boundaries) {
    if (boundary.end <= offset) continue;
    segments.push({
      text: word.slice(offset, boundary.end),
      tier: boundary.tier,
    });
    offset = boundary.end;
  }
  if (offset < word.length) segments.push({ text: word.slice(offset) });

  return segments;
}

function renderText(
  text: string,
  cursor?: AudioCursor,
  focusEligible = true,
): ReactNode[] {
  if (!cursor && !focusEligible) return [text];

  const nodes: ReactNode[] = [];
  let offset = 0;
  let match: RegExpExecArray | null;
  wordPattern.lastIndex = 0;

  while ((match = wordPattern.exec(text)) !== null) {
    if (match.index > offset) nodes.push(text.slice(offset, match.index));
    const word = match[0];
    const start = (cursor?.charIndex ?? 0) + match.index;
    const end = start + word.length;
    const wordIndex = cursor?.wordIndex;
    const wordId =
      cursor && wordIndex !== undefined
        ? audioWordId(cursor.sectionId, wordIndex)
        : undefined;
    const focusWord =
      focusEligible && focusWordPattern.test(word) ? word : undefined;
    const content = focusWord
      ? focusWordSegments(focusWord).map((segment, segmentIndex) =>
          segment.tier ? (
            <span
              key={`${segment.tier}-${segmentIndex}`}
              className={`focus-emphasis focus-emphasis-${segment.tier}`}
            >
              {segment.text}
            </span>
          ) : (
            segment.text
          ),
        )
      : word;
    if (!cursor && !focusWord) {
      nodes.push(word);
    } else {
      nodes.push(
        <span
          id={wordId}
          key={`${start}-${wordIndex ?? match.index}`}
          className={
            cursor
              ? `audio-word${focusWord ? " focus-word" : ""}`
              : "focus-word"
          }
          data-audio-word={cursor ? "true" : undefined}
          data-audio-word-id={wordId}
          data-audio-section-id={cursor?.sectionId}
          data-audio-char-start={cursor ? start : undefined}
          data-audio-char-end={cursor ? end : undefined}
        >
          {content}
        </span>,
      );
    }
    if (cursor) cursor.wordIndex += 1;
    offset = match.index + word.length;
  }

  if (offset < text.length) nodes.push(text.slice(offset));
  if (cursor) cursor.charIndex += text.length;
  return nodes;
}

function renderInlineNodes(
  inlineNodes: readonly MarkdownInlineNode[],
  cursor?: AudioCursor,
  focusEligible = true,
): ReactNode[] {
  return inlineNodes.map((node) => {
    const key = `${node.type}-${node.rawStart}-${node.rawEnd}`;
    if (node.type === "text") {
      return (
        <Fragment key={key}>
          {renderText(node.value, cursor, focusEligible)}
        </Fragment>
      );
    }
    if (node.type === "code") {
      return <code key={key}>{renderText(node.value, cursor, false)}</code>;
    }
    if (node.type === "image") return null;

    const children = renderInlineNodes(
      node.children,
      cursor,
      focusEligible && node.type !== "strong",
    );
    if (node.type === "strong") return <strong key={key}>{children}</strong>;
    if (node.type === "emphasis") return <em key={key}>{children}</em>;

    const href = safeMarkdownLinkHref(node.destination);
    return href ? (
      <a href={href} key={key}>{children}</a>
    ) : (
      <Fragment key={key}>{children}</Fragment>
    );
  });
}

function renderInline(
  text: string,
  cursor?: AudioCursor,
  focusEligible = true,
): ReactNode[] {
  return renderInlineNodes(parseInlineMarkdown(text), cursor, focusEligible);
}

function isList(block: string): boolean {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line));
}

function listItems(block: string): string[] {
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s+/, ""));
}

function isOrderedList(block: string): boolean {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 && lines.every((line) => /^\d+\.\s+/.test(line));
}

function orderedListItems(block: string): string[] {
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\d+\.\s+/, ""));
}

function isTable(block: string): boolean {
  const lines = block.split("\n").map((line) => line.trim());
  return (
    lines.length >= 2 &&
    lines.every((line) => line.startsWith("|") && line.endsWith("|")) &&
    /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(lines[1] ?? "")
  );
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function MarkdownBody({
  markdown,
  paragraphs = [],
  sectionId,
  anchorPrefix = "",
  focusWords = true,
  orderedLists = false,
  headingActions,
}: {
  markdown: string;
  paragraphs?: Section["paragraphs"];
  sectionId?: string;
  anchorPrefix?: string;
  focusWords?: boolean;
  orderedLists?: boolean;
  headingActions?: Readonly<Record<string, ReactNode>>;
}) {
  const blocks = splitMarkdownBlocks(markdown);
  const audioCursor: AudioCursor | undefined = sectionId
    ? { sectionId, charIndex: 0, wordIndex: 0 }
    : undefined;

  return (
    <div className="manuscript-prose">
      {blocks.map((block, index) => {
        const anchor = paragraphs[index]?.anchor
          ? `${anchorPrefix}${paragraphs[index]?.anchor}`
          : undefined;
        // The bare anchor and its content hash, unprefixed. The `id` above
        // carries anchorPrefix, which differs per route ("" on a canonical
        // section route, "${sectionId}-" on a chapter route), so a client
        // island cannot recover the durable identity from it without being told
        // the prefix. These two attributes are what a text selection resolves
        // against, and they exist on every route.
        const blockIdentity = {
          "data-paragraph-anchor": paragraphs[index]?.anchor,
          "data-paragraph-content-hash": paragraphs[index]?.contentHash,
        };
        const advanceBlockGap = () => {
          if (audioCursor) audioCursor.charIndex += 2;
        };
        if (block.startsWith("### ")) {
          const content = renderInline(block.slice(4), audioCursor, focusWords);
          advanceBlockGap();
          return <h3 id={anchor} key={index} {...blockIdentity}>{content}</h3>;
        }
        if (block.startsWith("## ")) {
          const heading = block.slice(3);
          const content = renderInline(heading, audioCursor, focusWords);
          const action = headingActions?.[heading];
          advanceBlockGap();
          const renderedHeading = (
            <h2 id={anchor} key={action ? undefined : index} {...blockIdentity}>
              {content}
            </h2>
          );
          return action ? (
            <div className="markdown-heading-row" key={index}>
              {renderedHeading}
              {action}
            </div>
          ) : (
            renderedHeading
          );
        }
        if (block.startsWith("# ")) {
          const content = renderInline(block.slice(2), audioCursor, focusWords);
          advanceBlockGap();
          return <h2 id={anchor} key={index} {...blockIdentity}>{content}</h2>;
        }
        if (block.startsWith("> ")) {
          const content = renderInline(
            block.replace(/^>\s?/gm, ""),
            audioCursor,
            focusWords,
          );
          advanceBlockGap();
          return (
            <blockquote id={anchor} key={index} {...blockIdentity}>
              {content}
            </blockquote>
          );
        }
        if (isList(block)) {
          const items = listItems(block).map((item, itemIndex) => (
            <li key={itemIndex}>
              {renderInline(item, audioCursor, focusWords)}
            </li>
          ));
          advanceBlockGap();
          return (
            <ul id={anchor} key={index} {...blockIdentity}>
              {items}
            </ul>
          );
        }
        if (orderedLists && isOrderedList(block)) {
          const items = orderedListItems(block).map((item, itemIndex) => (
            <li key={itemIndex}>
              {renderInline(item, audioCursor, focusWords)}
            </li>
          ));
          advanceBlockGap();
          return (
            <ol id={anchor} key={index} {...blockIdentity}>
              {items}
            </ol>
          );
        }
        if (isTable(block)) {
          const [head = "", , ...rows] = block.split("\n");
          const headerCells = tableCells(head).map((cell, cellIndex) => (
            <th key={cellIndex}>
              {renderInline(cell, audioCursor, focusWords)}
            </th>
          ));
          const rowCells = rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {tableCells(row).map((cell, cellIndex) => (
                <td key={cellIndex}>
                  {renderInline(cell, audioCursor, focusWords)}
                </td>
              ))}
            </tr>
          ));
          advanceBlockGap();
          return (
            <div
              id={anchor}
              className="table-scroll"
              key={index}
              role="region"
              aria-label="Scrollable table"
              tabIndex={0}
              {...blockIdentity}
            >
              <table>
                <thead>
                  <tr>{headerCells}</tr>
                </thead>
                <tbody>{rowCells}</tbody>
              </table>
            </div>
          );
        }
        const content = renderInline(block, audioCursor, focusWords);
        advanceBlockGap();
        return <p id={anchor} key={index} {...blockIdentity}>{content}</p>;
      })}
    </div>
  );
}
