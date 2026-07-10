import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ensureDir,
  parseFrontmatter,
  readUtf8,
  repoRoot,
  writeUtf8,
} from "./shared";

const statuses = ["open", "query", "deferred", "resolved"] as const;
const kinds = [
  "audio",
  "canon",
  "citation",
  "factual",
  "link",
  "literary",
  "logical",
  "promise",
  "structural",
  "technical",
  "terminology",
] as const;
const severities = ["critical", "high", "medium", "low"] as const;

type DebtStatus = (typeof statuses)[number];
type DebtKind = (typeof kinds)[number];
type DebtSeverity = (typeof severities)[number];

export type EditorialDebtItem = {
  id: string;
  title: string;
  status: DebtStatus;
  kind: DebtKind;
  severity: DebtSeverity;
  scopes: string[];
  sources: string[];
  discovered: string;
  updated: string;
  resolved: string;
  discoveredIn: string;
  body: string;
  file: string;
};

export const editorialDebtRoot = path.join(repoRoot, "editorial/debt");
export const editorialDebtItemsRoot = path.join(editorialDebtRoot, "items");
export const editorialDebtIndexPath = path.join(editorialDebtRoot, "index.md");

function requiredString(
  frontmatter: Record<string, unknown>,
  key: string,
  file: string,
): string {
  const value = frontmatter[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${file}: '${key}' must be a nonempty string.`);
  }
  return value.trim();
}

function stringList(
  frontmatter: Record<string, unknown>,
  key: string,
  file: string,
): string[] {
  const value = frontmatter[key];
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((entry) => typeof entry !== "string" || !entry.trim())
  ) {
    throw new Error(`${file}: '${key}' must be a nonempty string array.`);
  }
  return value.map((entry) => entry.trim());
}

function enumValue<T extends string>(
  value: string,
  allowed: readonly T[],
  key: string,
  file: string,
): T {
  if (!allowed.includes(value as T)) {
    throw new Error(
      `${file}: '${key}' must be one of ${allowed.join(", ")}.`,
    );
  }
  return value as T;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
}

function sections(body: string): Map<string, string> {
  const matches = [...body.matchAll(/^## (.+)$/gm)];
  const result = new Map<string, string>();
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index]!;
    const next = matches[index + 1];
    result.set(
      current[1]!.trim(),
      body.slice((current.index ?? 0) + current[0].length, next?.index).trim(),
    );
  }
  return result;
}

export function parseEditorialDebtItem(
  file: string,
  source: string,
): EditorialDebtItem {
  let parsed: ReturnType<typeof parseFrontmatter>;
  try {
    parsed = parseFrontmatter(source);
  } catch (error) {
    throw new Error(
      `${file}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const id = requiredString(parsed.frontmatter, "id", file);
  const title = requiredString(parsed.frontmatter, "title", file);
  const status = enumValue(
    requiredString(parsed.frontmatter, "status", file),
    statuses,
    "status",
    file,
  );
  const kind = enumValue(
    requiredString(parsed.frontmatter, "kind", file),
    kinds,
    "kind",
    file,
  );
  const severity = enumValue(
    requiredString(parsed.frontmatter, "severity", file),
    severities,
    "severity",
    file,
  );
  const scopes = stringList(parsed.frontmatter, "scopes", file);
  const sources = stringList(parsed.frontmatter, "sources", file);
  const discovered = requiredString(parsed.frontmatter, "discovered", file);
  const updated = requiredString(parsed.frontmatter, "updated", file);
  const resolvedValue = parsed.frontmatter.resolved;
  const resolved = typeof resolvedValue === "string" ? resolvedValue.trim() : "";
  const discoveredIn = requiredString(
    parsed.frontmatter,
    "discoveredIn",
    file,
  );

  if (!/^CTD-\d{4}$/.test(id)) {
    throw new Error(`${file}: 'id' must use the CTD-0001 format.`);
  }
  const expectedPrefix = `${id.toLowerCase()}-`;
  if (!path.basename(file).startsWith(expectedPrefix)) {
    throw new Error(`${file}: filename must begin with '${expectedPrefix}'.`);
  }
  if (!validDate(discovered) || !validDate(updated)) {
    throw new Error(`${file}: discovered and updated must be real ISO dates.`);
  }
  if (updated < discovered) {
    throw new Error(`${file}: updated cannot precede discovered.`);
  }
  if (status === "resolved") {
    if (!validDate(resolved)) {
      throw new Error(`${file}: resolved debt requires a real resolved date.`);
    }
    if (resolved < discovered || resolved > updated) {
      throw new Error(`${file}: resolved date must fall within the item history.`);
    }
  } else if (resolved) {
    throw new Error(`${file}: unresolved debt must leave 'resolved' empty.`);
  }

  const bodySections = sections(parsed.body);
  for (const heading of ["Debt", "Evidence", "Paydown criteria", "History"]) {
    if (!bodySections.get(heading)) {
      throw new Error(`${file}: missing nonempty '## ${heading}' section.`);
    }
  }
  const history = bodySections.get("History")!;
  const historyDates = [...history.matchAll(/^- (\d{4}-\d{2}-\d{2}):/gm)].map(
    (match) => match[1]!,
  );
  if (historyDates.length === 0 || historyDates.some((date) => !validDate(date))) {
    throw new Error(`${file}: history needs dated '- YYYY-MM-DD:' entries.`);
  }
  if (historyDates.at(-1) !== updated) {
    throw new Error(`${file}: latest history date must equal 'updated'.`);
  }
  if (status === "resolved" && !bodySections.get("Resolution")) {
    throw new Error(`${file}: resolved debt needs a nonempty '## Resolution'.`);
  }

  return {
    id,
    title,
    status,
    kind,
    severity,
    scopes,
    sources,
    discovered,
    updated,
    resolved,
    discoveredIn,
    body: parsed.body,
    file,
  };
}

export function validateEditorialDebtItems(
  items: EditorialDebtItem[],
  root = repoRoot,
): void {
  const ids = new Set<string>();
  const numbers: number[] = [];
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`Duplicate editorial debt ID ${item.id}.`);
    ids.add(item.id);
    numbers.push(Number(item.id.slice(4)));
    for (const source of item.sources) {
      const sourcePath = source.split("#", 1)[0]!;
      if (/^https?:\/\//.test(sourcePath)) continue;
      const absolute = path.resolve(root, sourcePath);
      const relative = path.relative(root, absolute);
      if (
        relative.startsWith("..") ||
        path.isAbsolute(relative) ||
        !fs.existsSync(absolute)
      ) {
        throw new Error(`${item.file}: source does not exist: ${sourcePath}`);
      }
    }
  }
  numbers.sort((left, right) => left - right);
  for (let index = 0; index < numbers.length; index += 1) {
    if (numbers[index] !== index + 1) {
      throw new Error(
        `Editorial debt IDs must remain append-only and contiguous. Expected CTD-${String(index + 1).padStart(4, "0")}.`,
      );
    }
  }
}

function itemLink(item: EditorialDebtItem): string {
  return `items/${path.basename(item.file)}`;
}

function table(items: EditorialDebtItem[]): string {
  if (items.length === 0) return "None.\n";
  const lines = [
    "| ID | Title | Status | Kind | Severity | Scope | Updated |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const item of items) {
    lines.push(
      `| [${item.id}](${itemLink(item)}) | ${item.title} | ${item.status} | ${item.kind} | ${item.severity} | ${item.scopes.join(", ")} | ${item.updated} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function renderEditorialDebtIndex(items: EditorialDebtItem[]): string {
  const severityOrder = new Map<DebtSeverity, number>(
    severities.map((severity, index) => [severity, index]),
  );
  const active = items
    .filter((item) => item.status !== "resolved")
    .sort(
      (left, right) =>
        severityOrder.get(left.severity)! - severityOrder.get(right.severity)! ||
        left.id.localeCompare(right.id),
    );
  const resolved = items
    .filter((item) => item.status === "resolved")
    .sort((left, right) => left.id.localeCompare(right.id));
  const counts = Object.fromEntries(
    statuses.map((status) => [
      status,
      items.filter((item) => item.status === status).length,
    ]),
  ) as Record<DebtStatus, number>;
  return [
    "# Editorial Debt Index",
    "",
    "<!-- Generated by npm run manuscripts:debt:update. Edit item files, not this index. -->",
    "",
    "This index records known literary, philosophical, factual, continuity, publication, and technical obligations across The Coherence Thesis. A resolved item remains in the library as evidence of paydown.",
    "",
    `Open: ${counts.open}. Queries: ${counts.query}. Deferred: ${counts.deferred}. Resolved: ${counts.resolved}.`,
    "",
    "## Active debt",
    "",
    table(active).trimEnd(),
    "",
    "## Resolved debt",
    "",
    table(resolved).trimEnd(),
    "",
  ].join("\n");
}

export function loadEditorialDebtItems(
  itemsRoot = editorialDebtItemsRoot,
): EditorialDebtItem[] {
  if (!fs.existsSync(itemsRoot)) return [];
  return fs
    .readdirSync(itemsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => {
      const file = path.join(itemsRoot, entry.name);
      return parseEditorialDebtItem(file, readUtf8(file));
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function runEditorialDebtCli(args = process.argv.slice(2)): number {
  try {
    const write = args.includes("--write");
    const unknown = args.filter((arg) => arg !== "--write");
    if (unknown.length > 0) {
      throw new Error(`Unknown option(s): ${unknown.join(", ")}.`);
    }
    const items = loadEditorialDebtItems();
    validateEditorialDebtItems(items);
    const index = renderEditorialDebtIndex(items);
    if (write) {
      ensureDir(editorialDebtRoot);
      writeUtf8(editorialDebtIndexPath, index);
      console.log(
        `Updated editorial debt index for ${items.length.toLocaleString()} item(s).`,
      );
    } else {
      if (!fs.existsSync(editorialDebtIndexPath)) {
        throw new Error(
          "Editorial debt index is missing. Run npm run manuscripts:debt:update.",
        );
      }
      if (readUtf8(editorialDebtIndexPath) !== index) {
        throw new Error(
          "Editorial debt index is stale. Run npm run manuscripts:debt:update.",
        );
      }
      console.log(
        `Validated ${items.length.toLocaleString()} editorial debt item(s).`,
      );
    }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = runEditorialDebtCli();
}
