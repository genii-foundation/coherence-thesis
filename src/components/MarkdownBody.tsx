import type { ReactNode } from "react";
import type { Section } from "@/lib/manuscript-data";
import { audioWordId } from "@/lib/audio-word-anchors";
import { splitMarkdownBlocks } from "@/lib/markdown-blocks";

type AudioCursor = {
  sectionId: string;
  charIndex: number;
  wordIndex: number;
};

const wordPattern = /[\p{L}\p{N}][\p{L}\p{N}'’]*/gu;

function renderText(text: string, cursor?: AudioCursor): ReactNode[] {
  if (!cursor) return [text];
  const nodes: ReactNode[] = [];
  let offset = 0;
  let match: RegExpExecArray | null;
  wordPattern.lastIndex = 0;

  while ((match = wordPattern.exec(text)) !== null) {
    if (match.index > offset) nodes.push(text.slice(offset, match.index));
    const word = match[0];
    const start = cursor.charIndex + match.index;
    const end = start + word.length;
    const wordIndex = cursor.wordIndex;
    const wordId = audioWordId(cursor.sectionId, wordIndex);
    nodes.push(
      <span
        id={wordId}
        key={`${start}-${wordIndex}`}
        className="audio-word"
        data-audio-word="true"
        data-audio-word-id={wordId}
        data-audio-section-id={cursor.sectionId}
        data-audio-char-start={start}
        data-audio-char-end={end}
      >
        {word}
      </span>,
    );
    cursor.wordIndex += 1;
    offset = match.index + word.length;
  }

  if (offset < text.length) nodes.push(text.slice(offset));
  cursor.charIndex += text.length;
  return nodes;
}

function renderInline(text: string, cursor?: AudioCursor): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let textCursor = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > textCursor) {
      nodes.push(...renderText(text.slice(textCursor, match.index), cursor));
    }
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${match.index}-strong`}>
          {renderText(token.slice(2, -2), cursor)}
        </strong>,
      );
    } else {
      nodes.push(
        <em key={`${match.index}-em`}>
          {renderText(token.slice(1, -1), cursor)}
        </em>,
      );
    }
    textCursor = match.index + token.length;
  }
  if (textCursor < text.length) {
    nodes.push(...renderText(text.slice(textCursor), cursor));
  }
  return nodes;
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
}: {
  markdown: string;
  paragraphs?: Section["paragraphs"];
  sectionId?: string;
}) {
  const blocks = splitMarkdownBlocks(markdown);
  const audioCursor: AudioCursor | undefined = sectionId
    ? { sectionId, charIndex: 0, wordIndex: 0 }
    : undefined;

  return (
    <div className="manuscript-prose">
      {blocks.map((block, index) => {
        const anchor = paragraphs[index]?.anchor;
        const advanceBlockGap = () => {
          if (audioCursor) audioCursor.charIndex += 2;
        };
        if (block.startsWith("### ")) {
          const content = renderInline(block.slice(4), audioCursor);
          advanceBlockGap();
          return <h3 id={anchor} key={index}>{content}</h3>;
        }
        if (block.startsWith("## ")) {
          const content = renderInline(block.slice(3), audioCursor);
          advanceBlockGap();
          return <h2 id={anchor} key={index}>{content}</h2>;
        }
        if (block.startsWith("# ")) {
          const content = renderInline(block.slice(2), audioCursor);
          advanceBlockGap();
          return <h2 id={anchor} key={index}>{content}</h2>;
        }
        if (block.startsWith("> ")) {
          const content = renderInline(block.replace(/^>\s?/gm, ""), audioCursor);
          advanceBlockGap();
          return <blockquote id={anchor} key={index}>{content}</blockquote>;
        }
        if (isList(block)) {
          const items = listItems(block).map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item, audioCursor)}</li>
          ));
          advanceBlockGap();
          return (
            <ul id={anchor} key={index}>
              {items}
            </ul>
          );
        }
        if (isTable(block)) {
          const [head = "", , ...rows] = block.split("\n");
          const headerCells = tableCells(head).map((cell, cellIndex) => (
            <th key={cellIndex}>{renderInline(cell, audioCursor)}</th>
          ));
          const rowCells = rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {tableCells(row).map((cell, cellIndex) => (
                <td key={cellIndex}>{renderInline(cell, audioCursor)}</td>
              ))}
            </tr>
          ));
          advanceBlockGap();
          return (
            <div id={anchor} className="table-scroll" key={index}>
              <table>
                <thead>
                  <tr>{headerCells}</tr>
                </thead>
                <tbody>{rowCells}</tbody>
              </table>
            </div>
          );
        }
        const content = renderInline(block, audioCursor);
        advanceBlockGap();
        return <p id={anchor} key={index}>{content}</p>;
      })}
    </div>
  );
}
