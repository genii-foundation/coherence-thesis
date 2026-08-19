// The editorial debt contract: field rules, parsing, routing, boundedness, and
// queue selection. Pure, with no filesystem or path dependency, because two very
// different callers need identical answers from it.
//
// scripts/editorial/debt.ts and scripts/editorial/debt-queue.ts own the disk and
// the CLI. The admin workbench at /admin/debt reads the same item files through a
// Next server component, which cannot import scripts/repository/paths: that module
// resolves the repository root from import.meta.dirname, and the Next bundler
// leaves it undefined.
//
// Splitting the derivation out is the only way both surfaces can answer "what is
// the severity of CTD-0038, who decides it, and is it bounded" with one
// implementation. A second parser would let the admin page and the queue disagree
// about the register, which is the failure this file exists to prevent.

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
export const editorialDebtQueuePresets = [
  "actionable",
  "quick-win",
  "author-query",
  "deferred",
  "all-active",
  "resolved",
] as const;

export type EditorialDebtStatus = (typeof editorialDebtStatuses)[number];
export type EditorialDebtKind = (typeof editorialDebtKinds)[number];
export type EditorialDebtSeverity = (typeof editorialDebtSeverities)[number];
export type EditorialDebtQueuePreset =
  (typeof editorialDebtQueuePresets)[number];

export const editorialDebtResolutionSections = [
  ["Outcome", "outcome"],
  ["Criterion results", "criterionResults"],
  ["Evidence", "evidence"],
  ["Validation", "validation"],
  ["Approval", "approval"],
  ["Residual risk", "residualRisk"],
  ["Related debt", "relatedDebt"],
] as const;

export type EditorialDebtResolution = {
  outcome: string;
  criterionResults: string;
  evidence: string;
  validation: string;
  approval: string;
  residualRisk: string;
  relatedDebt: string;
};

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
  resolution: EditorialDebtResolution | null;
  file: string;
};

export const editorialDebtRequiredSections = [
  "Debt",
  "Evidence",
  "Paydown criteria",
  "History",
] as const;

export const editorialDebtSeverityOrder = new Map<EditorialDebtSeverity, number>(
  editorialDebtSeverities.map((severity, index) => [severity, index]),
);

export const editorialDebtBoundednessBasis =
  "One narrow scope, one source, noncritical severity, open status, no author decision kind, and no broad work marker in the paydown criteria. This is a boundedness signal, not an effort estimate or completion promise.";

const broadWorkPattern =
  /\b(all volumes|complete|corpus|cross volume|each|entire|every|site wide|sitewide)\b/i;

/** Path-free basename, so this module stays importable from the browser bundle. */
function fileName(file: string): string {
  const segments = file.split(/[\\/]/);
  return segments[segments.length - 1] ?? file;
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function yamlScalar(value: string): string | number | string[] | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return JSON.parse(trimmed) as string[];
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return JSON.parse(trimmed.replace(/^'/, '"').replace(/'$/, '"'));
  }
  return trimmed;
}

/**
 * Reads the debt item frontmatter block. Deliberately the same grammar as the
 * manuscript reader in scripts/manuscripts/shared.ts, kept here rather than
 * imported because that module opens the filesystem on load and the reader app
 * cannot carry it. The two grammars govern different field contracts; only this
 * one may change when the debt contract changes.
 */
function parseDebtFrontmatter(source: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const normalized = normalizeNewlines(source);
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error("Markdown file is missing frontmatter.");
  const frontmatter: Record<string, unknown> = {};
  for (const line of (match[1] ?? "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex === -1) {
      throw new Error(`Invalid frontmatter line: ${line}`);
    }
    frontmatter[trimmed.slice(0, separatorIndex).trim()] = yamlScalar(
      trimmed.slice(separatorIndex + 1),
    );
  }
  return { frontmatter, body: normalizeNewlines(match[2] ?? "") };
}

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
    throw new Error(`${file}: '${key}' must be one of ${allowed.join(", ")}.`);
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
  const matches = [...markdown.matchAll(new RegExp(`^${heading} (.+)$`, "gm"))];
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
): EditorialDebtResolution {
  const resolutionSections = headingSections(resolution, 3, file);
  for (const [heading] of editorialDebtResolutionSections) {
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

  return Object.fromEntries(
    editorialDebtResolutionSections.map(([heading, key]) => [
      key,
      resolutionSections.get(heading)!,
    ]),
  ) as EditorialDebtResolution;
}

export function parseEditorialDebtItem(
  file: string,
  source: string,
): EditorialDebtItem {
  let parsed: ReturnType<typeof parseDebtFrontmatter>;
  try {
    parsed = parseDebtFrontmatter(source);
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
  const discoveredIn = requiredString(parsed.frontmatter, "discoveredIn", file);

  if (!/^CTD-\d{4}$/.test(id)) {
    throw new Error(`${file}: 'id' must use the CTD-0001 format.`);
  }
  const expectedPrefix = `${id.toLowerCase()}-`;
  if (!fileName(file).startsWith(expectedPrefix)) {
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
      throw new Error(
        `${file}: resolved date must fall within the item history.`,
      );
    }
  } else if (resolved) {
    throw new Error(`${file}: unresolved debt must leave 'resolved' empty.`);
  }

  const bodySections = headingSections(parsed.body, 2, file);
  for (const heading of editorialDebtRequiredSections) {
    if (!bodySections.get(heading)) {
      throw new Error(`${file}: missing nonempty '## ${heading}' section.`);
    }
  }
  const history = bodySections.get("History")!;
  const historyDates = [...history.matchAll(/^- (\d{4}-\d{2}-\d{2}):/gm)].map(
    (match) => match[1]!,
  );
  if (
    historyDates.length === 0 ||
    historyDates.some((date) => !validDate(date))
  ) {
    throw new Error(`${file}: history needs dated '- YYYY-MM-DD:' entries.`);
  }
  if (historyDates.at(-1) !== updated) {
    throw new Error(`${file}: latest history date must equal 'updated'.`);
  }
  let resolution: EditorialDebtResolution | null = null;
  if (status === "resolved") {
    const resolutionSection = bodySections.get("Resolution");
    if (!resolutionSection) {
      throw new Error(`${file}: resolved debt needs a nonempty '## Resolution'.`);
    }
    const criterionIds = resolvedPaydownCriteria(
      file,
      bodySections.get("Paydown criteria")!,
    );
    resolution = validateResolution(file, resolutionSection, criterionIds);
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
    resolution,
    file,
  };
}

/**
 * The identifier half of the register contract: unique IDs, append-only and
 * contiguous. Source existence is checked by the CLI, which has a filesystem.
 */
export function checkEditorialDebtIdentifiers(items: EditorialDebtItem[]): void {
  const ids = new Set<string>();
  const numbers: number[] = [];
  for (const item of items) {
    if (ids.has(item.id)) {
      throw new Error(`Duplicate editorial debt ID ${item.id}.`);
    }
    ids.add(item.id);
    numbers.push(Number(item.id.slice(4)));
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

export function editorialDebtSection(
  item: EditorialDebtItem,
  heading: string,
): string {
  return item.sections.get(heading) ?? "";
}

export type EditorialDebtRoute = {
  authority: string;
  specialistRoute: string;
};

/**
 * Who may decide this item, and which workflow does the work. Kind decides the
 * default; a query status moves the decision in front of the work. The guide
 * skill treats this as an initial default that a named authority in the ticket
 * body overrides.
 */
export function editorialDebtRoute(item: EditorialDebtItem): EditorialDebtRoute {
  const { kind, status } = item;
  if (status === "resolved") {
    return {
      authority: "Verifier with authority to reopen the ticket",
      specialistRoute: "Verification or $coherence-utility-editorial-debt reopening",
    };
  }
  if (status === "deferred") {
    return {
      authority: "Owner of the named blocking condition",
      specialistRoute: "Read only blocker verification before rerouting",
    };
  }
  let route: EditorialDebtRoute;
  if (kind === "literary" || kind === "structural" || kind === "terminology") {
    route = {
      authority: "Human editor",
      specialistRoute: "$coherence-admin-editorial-review",
    };
  } else if (kind === "canon" || kind === "logical" || kind === "promise") {
    route = {
      authority: "Author decision",
      specialistRoute:
        "Human author decision, then $coherence-admin-editorial-review",
    };
  } else if (kind === "factual" || kind === "citation") {
    route = {
      authority: "Primary source evidence and qualified human review",
      specialistRoute:
        "Primary source research, then $coherence-admin-editorial-review",
    };
  } else if (kind === "link") {
    route = {
      authority: "Publishing continuity review",
      specialistRoute: "$coherence-utility-manuscript-publish",
    };
  } else if (kind === "technical") {
    route = {
      authority: "Application maintainer",
      specialistRoute: "$coherence-utility-build-feature",
    };
  } else {
    route = {
      authority: "Audio publication owner",
      specialistRoute:
        "Audiobook publication workflow. This guide cannot upload or publish audio.",
    };
  }

  if (
    status === "query" &&
    kind !== "canon" &&
    kind !== "logical" &&
    kind !== "promise"
  ) {
    return {
      authority:
        kind === "factual" || kind === "citation"
          ? "Named decision authority in the ticket, supported by primary source evidence and qualified human review"
          : "Named decision authority in the ticket",
      specialistRoute:
        kind === "audio"
          ? "Decision first, then the audiobook publication workflow. This guide cannot upload or publish audio."
          : kind === "factual" || kind === "citation"
            ? `Resolve the named evidence question first, then ${route.specialistRoute}`
            : `Decision first, then ${route.specialistRoute}`,
    };
  }
  return route;
}

export const editorialDebtLanes = ["decide", "blocked", "execute", "closed"] as const;
export type EditorialDebtLane = (typeof editorialDebtLanes)[number];

/**
 * The one question triage actually turns on: can this be worked, or is it
 * waiting on somebody.
 *
 * The register already answers it. `query` means a named decision is required
 * before safe paydown, and canon, logical, and promise debt routes to an author
 * decision whatever its status. `deferred` is different in kind: a named
 * external condition blocks it, and no decision unblocks it. Everything else
 * open is executable now.
 */
export function editorialDebtLane(item: EditorialDebtItem): EditorialDebtLane {
  if (item.status === "resolved") return "closed";
  if (item.status === "deferred") return "blocked";
  if (item.status === "query") return "decide";
  return item.kind === "canon" || item.kind === "logical" || item.kind === "promise"
    ? "decide"
    : "execute";
}

export function editorialDebtLaneLabel(lane: EditorialDebtLane): string {
  if (lane === "decide") return "Needs a decision";
  if (lane === "blocked") return "Blocked on a condition";
  if (lane === "execute") return "Ready to work";
  return "Closed";
}

/** Other tickets this one names in its body, in first-mention order. */
export function editorialDebtCrossReferences(
  item: EditorialDebtItem,
): string[] {
  const found: string[] = [];
  for (const match of item.body.matchAll(/\bCTD-\d{4}\b/g)) {
    const id = match[0];
    if (id !== item.id && !found.includes(id)) found.push(id);
  }
  return found;
}

/** The admin detail route for a ticket. Lowercase, to match every other route. */
export function editorialDebtHref(id: string): string {
  return `/admin/debt/${id.toLowerCase()}/`;
}

export type EditorialDebtPromptLane = "triage" | "investigate" | "resolve";

const promptLaneInstruction: Record<EditorialDebtPromptLane, string> = {
  triage:
    "Take the quick triage lane. Keep it open, convert it to a query, defer it with a named condition, correct its metadata, record partial paydown, or reconcile a duplicate. Quick triage cannot resolve the ticket.",
  investigate:
    "Take the investigate lane. Review the cited sources and evidence read only, then come back with two or three concrete resolution options, each with its tradeoffs, authority, dependencies, and proof requirements. Change nothing yet.",
  resolve:
    "Take the full resolution lane. Work through the decision, the specialist workflow, validation, and structured closure in the same focused pull request as the repair. Keep that pull request draft until every required gate passes, then verify the merged result. Never require a follow-up pull request merely to mark the debt resolved. Pause for every author, voice, canon, publication, or external authority decision.",
};

/**
 * The prompt behind every action button on /admin/debt.
 *
 * The workbench is read only with respect to editorial/, so it cannot move a
 * ticket itself and should not imply that it can. What it can do is hand over
 * everything it already derived, so the session starts with the ticket, its
 * routing, and its lane instead of rediscovering them.
 */
export function editorialDebtPrompt({
  item,
  file,
  lane,
}: {
  item: EditorialDebtItem;
  /** Repository relative path to the ticket, which the caller already resolved. */
  file: string;
  lane: EditorialDebtPromptLane;
}): string {
  const route = editorialDebtRoute(item);
  return [
    `/coherence-admin-editorial-debt-guide Work ${item.id}: ${item.title}.`,
    ` Read the ticket at ${file} and run \`npm run editorial:debt:queue -- --id ${item.id}\` before proposing anything.`,
    ` It is ${item.severity} severity, ${item.kind} kind, status ${item.status}, scoped to ${item.scopes.join(", ")}, last updated ${item.updated}.`,
    ` Queue routing puts authority with: ${route.authority}. Recommended specialist route: ${route.specialistRoute}.`,
    ` ${promptLaneInstruction[lane]}`,
    " Treat that routing as a default that a named authority in the ticket overrides, and get my explicit approval before changing any durable register state or editorial source.",
  ].join("");
}

export type EditorialDebtBoundedness = {
  candidate: boolean;
  basis: string;
};

export function editorialDebtBoundedness(
  item: EditorialDebtItem,
): EditorialDebtBoundedness {
  if (item.status === "resolved") {
    return {
      candidate: false,
      basis:
        "Resolved tickets are closure records, not boundedness candidates. Review the Resolution proof and reopen the ticket only if that paydown no longer holds.",
    };
  }

  const reasons: string[] = [];
  if (item.status !== "open") {
    reasons.push(
      `its status is ${item.status}, while this signal applies only to open tickets`,
    );
  }
  if (item.severity === "critical") reasons.push("its severity is critical");
  if (item.scopes.length !== 1) {
    reasons.push(
      `it spans ${item.scopes.length.toLocaleString()} scopes instead of one`,
    );
  } else if (item.scopes[0] === "corpus") {
    reasons.push("its only scope is the corpus");
  }
  if (item.sources.length !== 1) {
    reasons.push(
      `it names ${item.sources.length.toLocaleString()} sources instead of one`,
    );
  }
  if (
    item.kind === "canon" ||
    item.kind === "logical" ||
    item.kind === "promise"
  ) {
    reasons.push(`its ${item.kind} kind requires an author decision`);
  }
  if (broadWorkPattern.test(editorialDebtSection(item, "Paydown criteria"))) {
    reasons.push("its paydown criteria contain a broad work marker");
  }

  if (reasons.length === 0) {
    return { candidate: true, basis: editorialDebtBoundednessBasis };
  }
  return {
    candidate: false,
    basis: `Not a boundedness candidate because ${reasons.join("; ")}. This classification is not an effort estimate or completion promise.`,
  };
}

export function matchesEditorialDebtPreset(
  item: EditorialDebtItem,
  preset: EditorialDebtQueuePreset,
): boolean {
  if (preset === "actionable") return item.status === "open";
  if (preset === "quick-win") return editorialDebtBoundedness(item).candidate;
  if (preset === "author-query") return item.status === "query";
  if (preset === "deferred") return item.status === "deferred";
  if (preset === "all-active") return item.status !== "resolved";
  return item.status === "resolved";
}

export function compareEditorialDebtItems(
  left: EditorialDebtItem,
  right: EditorialDebtItem,
  preset: EditorialDebtQueuePreset,
): number {
  if (preset === "deferred") {
    return (
      left.updated.localeCompare(right.updated) || left.id.localeCompare(right.id)
    );
  }
  if (preset === "resolved") return left.id.localeCompare(right.id);
  return (
    editorialDebtSeverityOrder.get(left.severity)! -
      editorialDebtSeverityOrder.get(right.severity)! ||
    left.id.localeCompare(right.id)
  );
}

/** Whole days between two ISO dates, floored at zero. */
export function editorialDebtAgeInDays(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

const scopeVolumeNumerals = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
];

/** Frontmatter scopes are volume-1 style, unlike the volume-01 editorial ids. */
export function editorialDebtScopeLabel(scope: string): string {
  const volume = /^volume-(\d+)$/.exec(scope);
  if (volume) {
    const index = Number.parseInt(volume[1]!, 10) - 1;
    return `Volume ${scopeVolumeNumerals[index] ?? volume[1]}`;
  }
  if (scope === "corpus") return "Corpus";
  if (scope === "master-ledger") return "Master ledger";
  if (scope === "site") return "Site";
  return scope;
}

/** The editorial package id for a debt scope, where one exists. */
export function editorialDebtScopeEditorialId(scope: string): string | null {
  const volume = /^volume-(\d+)$/.exec(scope);
  if (!volume) return null;
  const index = Number.parseInt(volume[1]!, 10);
  if (index < 1 || index > 9) return null;
  return `volume-${String(index).padStart(2, "0")}`;
}

function itemLink(item: EditorialDebtItem): string {
  return `items/${fileName(item.file)}`;
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

export function countEditorialDebtByStatus(
  items: EditorialDebtItem[],
): Record<EditorialDebtStatus, number> {
  return Object.fromEntries(
    editorialDebtStatuses.map((status) => [
      status,
      items.filter((item) => item.status === status).length,
    ]),
  ) as Record<EditorialDebtStatus, number>;
}

export function renderEditorialDebtIndex(items: EditorialDebtItem[]): string {
  const active = items
    .filter((item) => item.status !== "resolved")
    .sort(
      (left, right) =>
        editorialDebtSeverityOrder.get(left.severity)! -
          editorialDebtSeverityOrder.get(right.severity)! ||
        left.id.localeCompare(right.id),
    );
  const resolved = items
    .filter((item) => item.status === "resolved")
    .sort((left, right) => left.id.localeCompare(right.id));
  const counts = countEditorialDebtByStatus(items);
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
