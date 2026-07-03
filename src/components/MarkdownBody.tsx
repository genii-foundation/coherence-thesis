import type { ReactNode } from "react";
import type { Section } from "@/lib/manuscript-data";

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={`${match.index}-strong`}>{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(<em key={`${match.index}-em`}>{token.slice(1, -1)}</em>);
    }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
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
    /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(lines[1])
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
}: {
  markdown: string;
  paragraphs?: Section["paragraphs"];
}) {
  const blocks = markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className="manuscript-prose">
      {blocks.map((block, index) => {
        const anchor = paragraphs[index]?.anchor;
        if (block.startsWith("### ")) {
          return <h3 id={anchor} key={index}>{renderInline(block.slice(4))}</h3>;
        }
        if (block.startsWith("## ")) {
          return <h2 id={anchor} key={index}>{renderInline(block.slice(3))}</h2>;
        }
        if (block.startsWith("# ")) {
          return <h2 id={anchor} key={index}>{renderInline(block.slice(2))}</h2>;
        }
        if (block.startsWith("> ")) {
          return <blockquote id={anchor} key={index}>{renderInline(block.replace(/^>\s?/gm, ""))}</blockquote>;
        }
        if (isList(block)) {
          return (
            <ul id={anchor} key={index}>
              {listItems(block).map((item, itemIndex) => (
                <li key={itemIndex}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        if (isTable(block)) {
          const [head, , ...rows] = block.split("\n");
          return (
            <div id={anchor} className="table-scroll" key={index}>
              <table>
                <thead>
                  <tr>
                    {tableCells(head).map((cell, cellIndex) => (
                      <th key={cellIndex}>{renderInline(cell)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {tableCells(row).map((cell, cellIndex) => (
                        <td key={cellIndex}>{renderInline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return <p id={anchor} key={index}>{renderInline(block)}</p>;
      })}
    </div>
  );
}
