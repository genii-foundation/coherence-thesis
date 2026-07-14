import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ensureDir,
  parseFrontmatter,
  readUtf8,
  repoRoot,
  writeUtf8,
} from "../manuscripts/shared";
import { editorialDebtRoot as canonicalEditorialDebtRoot } from "../repository/paths";

export const editorialDebtStatuses = [
  "open",
  "query",
  "deferred",
  "resolved",
] as const;
export const editorialDebtKinds = [
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
export const editorialDebtSeverities = [
  "critical",
  "high",
  "medium",
  "low",
] as const;

export type EditorialDebtStatus = (typeof editorialDebtStatuses)[number];
export type EditorialDebtKind = (typeof editorialDebtKinds)[number];
export type EditorialDebtSeverity = (typeof editorialDebtSeverities)[number];

export type EditorialDebtItem = {
  id: string;
  title: string;
  status: EditorialDebtStatus;
  kind: EditorialDebtKind;
  severity: EditorialDebtSeverity;
  scopes: string[];
  sources: string[];
  discovered: string;
  updated: string;
  resolved: string;
  discoveredIn: string;
  body: string;
  sections: ReadonlyMap<string, string>;
  file: string;
};

export const editorialDebtRoot = canonicalEditorialDebtRoot;
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

function headingSections(
  markdown: string,
  level: 2 | 3,
  file: string,
): Map<string, string> {
  const heading = "#".repeat(level);
  const matches = [
    ...markdown.matchAll(new RegExp(`^${heading} (.+)$`, "gm")),
  ];
  const result = new Map<string, string>();
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index]!;
    const next = matches[index + 1];
    const name = current[1]!.trim();
    if (result.has(name)) {
      throw new Error(`${file}: duplicate '${heading} ${name}' section.`);
    }
    result.set(
      name,
      markdown
        .slice((current.index ?? 0) + current[0].length, next?.index)
        .trim(),
    );
  }
  return result;
}

function resolvedPaydownCriteria(file: string, section: string): string[] {
  const lines = section
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const criterionPattern = /^- C([1-9]\d*)\. (.+)$/;
  const matches = lines.map((line) => line.match(criterionPattern));
  if (matches.length === 0 || matches.some((match) => !match)) {
    throw new Error(
      `${file}: resolved debt paydown criteria must use one-line '- C1. ...' entries.`,
    );
  }
  const ids = matches.map((match) => Number(match![1]!));
  for (let index = 0; index < ids.length; index += 1) {
    if (ids[index] !== index + 1) {
      throw new Error(
        `${file}: resolved debt paydown criteria must be contiguous from C1.`,
      );
    }
  }
  return ids.map((id) => `C${id}`);
}

function validateResolution(
  file: string,
  resolution: string,
  criterionIds: string[],
): void {
  const resolutionSections = headingSections(resolution, 3, file);
  const requiredSections = [
    "Outcome",
    "Criterion results",
    "Evidence",
    "Validation",
    "Approval",
    "Residual risk",
    "Related debt",
  ];
  for (const heading of requiredSections) {
    if (!resolutionSections.get(heading)) {
      throw new Error(
        `${file}: resolved debt needs a nonempty '### ${heading}' section under '## Resolution'.`,
      );
    }
  }

  const resultLines = resolutionSections
    .get("Criterion results")!
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const resultPattern = /^- C([1-9]\d*): (met|not applicable)\. (.+)$/;
  const resultMatches = resultLines.map((line) => line.match(resultPattern));
  if (resultLines.length === 0 || resultMatches.some((match) => !match)) {
    throw new Error(
      `${file}: criterion results must use one-line '- C1: met. ...' or '- C1: not applicable. ...' entries.`,
    );
  }
  const resultIds = resultMatches.map((match) => `C${Number(match![1]!)}`);
  if (
    resultIds.length !== new Set(resultIds).size ||
    resultIds.length !== criterionIds.length ||
    resultIds.some((id, index) => id !== criterionIds[index])
  ) {
    throw new Error(
      `${file}: criterion results must cover ${criterionIds.join(", ")} exactly once and in order.`,
    );
  }
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
    editorialDebtStatuses,
    "status",
    file,
  );
  const kind = enumValue(
    requiredString(parsed.frontmatter, "kind", file),
    editorialDebtKinds,
    "kind",
    file,
  );
  const severity = enumValue(
    requiredString(parsed.frontmatter, "severity", file),
    editorialDebtSeverities,
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

  const bodySections = headingSections(parsed.body, 2, file);
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
  if (status === "resolved") {
    const resolution = bodySections.get("Resolution");
    if (!resolution) {
      throw new Error(`${file}: resolved debt needs a nonempty '## Resolution'.`);
    }
    const criterionIds = resolvedPaydownCriteria(
      file,
      bodySections.get("Paydown criteria")!,
    );
    validateResolution(file, resolution, criterionIds);
  }
  if (
    status !== "resolved" &&
    /\breopen(?:ed|ing)?\b/i.test(history) &&
    !bodySections.get("Prior paydown") &&
    !bodySections.get("Partial paydown")
  ) {
    throw new Error(
      `${file}: reopened debt must preserve earlier work in a nonempty '## Prior paydown' or '## Partial paydown'.`,
    );
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
    sections: bodySections,
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
  const severityOrder = new Map<EditorialDebtSeverity, number>(
    editorialDebtSeverities.map((severity, index) => [severity, index]),
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
    editorialDebtStatuses.map((status) => [
      status,
      items.filter((item) => item.status === status).length,
    ]),
  ) as Record<EditorialDebtStatus, number>;
  return [
    "# Editorial Debt Index",
    "",
    "<!-- Generated by npm run editorial:debt:update. Edit item files, not this index. -->",
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
          "Editorial debt index is missing. Run npm run editorial:debt:update.",
        );
      }
      if (readUtf8(editorialDebtIndexPath) !== index) {
        throw new Error(
          "Editorial debt index is stale. Run npm run editorial:debt:update.",
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
