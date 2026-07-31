// Block structure for debt evidence.
//
// Not splitMarkdownBlocks, which splits manuscript prose on blank lines and must
// keep doing exactly that: paragraph anchors are assigned by index over its
// output, so changing it would move every deep link in the reader. Debt evidence
// has no anchors and does have fenced code with blank lines in it, tables, and
// numbered criteria, so it needs a fence aware splitter of its own.

export type DebtBlock =
  | { type: "heading"; level: 3 | 4; text: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "code"; language: string; text: string };

function debtTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableDivider(line: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(line.trim());
}

export function splitDebtBlocks(markdown: string): DebtBlock[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: DebtBlock[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    const text = paragraph.join("\n").trim();
    paragraph = [];
    if (text) blocks.push({ type: "paragraph", text });
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      flush();
      const language = trimmed.slice(3).trim();
      const body: string[] = [];
      index += 1;
      while (
        index < lines.length &&
        !(lines[index] ?? "").trim().startsWith("```")
      ) {
        body.push(lines[index] ?? "");
        index += 1;
      }
      blocks.push({ type: "code", language, text: body.join("\n") });
      continue;
    }

    if (!trimmed) {
      flush();
      continue;
    }

    const heading = /^(#{3,4})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flush();
      blocks.push({
        type: "heading",
        level: heading[1]!.length === 3 ? 3 : 4,
        text: heading[2]!,
      });
      continue;
    }

    if (
      trimmed.startsWith("|") &&
      trimmed.endsWith("|") &&
      isTableDivider(lines[index + 1] ?? "")
    ) {
      flush();
      const head = debtTableCells(trimmed);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length) {
        const row = (lines[index] ?? "").trim();
        if (!row.startsWith("|") || !row.endsWith("|")) break;
        rows.push(debtTableCells(row));
        index += 1;
      }
      index -= 1;
      blocks.push({ type: "table", head, rows });
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (bullet || numbered) {
      flush();
      const ordered = Boolean(numbered);
      const items: string[] = [(bullet ?? numbered)![1] ?? ""];
      while (index + 1 < lines.length) {
        const next = (lines[index + 1] ?? "").trim();
        const continuation = ordered
          ? /^\d+[.)]\s+(.*)$/.exec(next)
          : /^[-*]\s+(.*)$/.exec(next);
        if (continuation) {
          items.push(continuation[1] ?? "");
          index += 1;
          continue;
        }
        // A wrapped line with no marker belongs to the item above it.
        if (next && !/^([-*]|\d+[.)])\s+/.test(next) && !next.startsWith("|")) {
          items[items.length - 1] = `${items[items.length - 1]} ${next}`.trim();
          index += 1;
          continue;
        }
        break;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    if (trimmed.startsWith(">")) {
      flush();
      const quote: string[] = [trimmed.replace(/^>\s?/, "")];
      while (
        index + 1 < lines.length &&
        (lines[index + 1] ?? "").trim().startsWith(">")
      ) {
        quote.push((lines[index + 1] ?? "").trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "quote", text: quote.join("\n") });
      continue;
    }

    paragraph.push(line);
  }
  flush();
  return blocks;
}
