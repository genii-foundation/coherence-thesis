import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import { editorialDebtHref } from "@/lib/editorial-debt";
import {
  parseInlineMarkdown,
  safeMarkdownLinkHref,
  type MarkdownInlineNode,
} from "@/lib/markdown-inline";

import styles from "../admin.module.css";
import { splitDebtBlocks } from "./debtBlocks";

// Debt evidence is not manuscript prose, so it does not go through MarkdownBody.
// That renderer attaches audio word anchors and reading emphasis spans that
// belong to the reader, and neither belongs on an evidence record. Inline
// parsing is still the shared primitive, so bold, links, and code spans read
// identically here and in the reader.
const ctdPattern = /\bCTD-\d{4}\b/g;

/** Turns every ticket id in running text into a link to that ticket. */
function renderTicketText(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let offset = 0;
  ctdPattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ctdPattern.exec(text)) !== null) {
    if (match.index > offset) nodes.push(text.slice(offset, match.index));
    nodes.push(
      <Link
        className={styles.debtInlineTicket}
        href={editorialDebtHref(match[0])}
        key={`${keyPrefix}-${match.index}`}
      >
        {match[0]}
      </Link>,
    );
    offset = match.index + match[0].length;
  }
  if (offset < text.length) nodes.push(text.slice(offset));
  return nodes.length ? nodes : [text];
}

function renderInlineNodes(
  inlineNodes: readonly MarkdownInlineNode[],
): ReactNode[] {
  return inlineNodes.map((node) => {
    const key = `${node.type}-${node.rawStart}-${node.rawEnd}`;
    if (node.type === "text") {
      return <Fragment key={key}>{renderTicketText(node.value, key)}</Fragment>;
    }
    if (node.type === "code") return <code key={key}>{node.value}</code>;
    if (node.type === "image") return null;

    const children = renderInlineNodes(node.children);
    if (node.type === "strong") return <strong key={key}>{children}</strong>;
    if (node.type === "emphasis") return <em key={key}>{children}</em>;

    const href = safeMarkdownLinkHref(node.destination);
    return href ? (
      <a key={key} href={href}>
        {children}
      </a>
    ) : (
      <Fragment key={key}>{children}</Fragment>
    );
  });
}

function inline(text: string): ReactNode[] {
  return renderInlineNodes(parseInlineMarkdown(text));
}

export function DebtMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className={styles.debtProse}>
      {splitDebtBlocks(markdown).map((block, index) => {
        if (block.type === "heading") {
          return block.level === 3 ? (
            <h3 key={index}>{inline(block.text)}</h3>
          ) : (
            <h4 key={index}>{inline(block.text)}</h4>
          );
        }
        if (block.type === "code") {
          return (
            <pre className={styles.debtCode} key={index}>
              <code>{block.text}</code>
            </pre>
          );
        }
        if (block.type === "quote") {
          return <blockquote key={index}>{inline(block.text)}</blockquote>;
        }
        if (block.type === "list") {
          const items = block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{inline(item)}</li>
          ));
          return block.ordered ? (
            <ol key={index}>{items}</ol>
          ) : (
            <ul key={index}>{items}</ul>
          );
        }
        if (block.type === "table") {
          return (
            <div className={styles.debtTableScroll} key={index}>
              <table>
                <thead>
                  <tr>
                    {block.head.map((cell, cellIndex) => (
                      <th key={cellIndex}>{inline(cell)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex}>{inline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return <p key={index}>{inline(block.text)}</p>;
      })}
    </div>
  );
}
