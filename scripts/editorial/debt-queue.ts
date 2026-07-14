import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  editorialDebtKinds,
  editorialDebtResolutionSections,
  editorialDebtSeverities,
  editorialDebtStatuses,
  loadEditorialDebtItems,
  validateEditorialDebtItems,
  type EditorialDebtItem,
  type EditorialDebtResolution,
} from "./debt";
import { repoRoot } from "../repository/paths";

const queuePresets = [
  "actionable",
  "quick-win",
  "author-query",
  "deferred",
  "all-active",
  "resolved",
] as const;
const outputFormats = ["markdown", "json"] as const;

type QueuePreset = (typeof queuePresets)[number];
type OutputFormat = (typeof outputFormats)[number];
type DebtStatus = EditorialDebtItem["status"];
type DebtKind = EditorialDebtItem["kind"];
type DebtSeverity = EditorialDebtItem["severity"];

type QueueOptions = {
  id?: string;
  preset: QueuePreset;
  presetExplicit: boolean;
  status?: DebtStatus;
  kind?: DebtKind;
  severity?: DebtSeverity;
  scope?: string;
  limit: number;
  format: OutputFormat;
  help: boolean;
};

type EditorialDebtRoute = {
  authority: string;
  specialistRoute: string;
};

export type EditorialDebtBrief = {
  file: string;
  metadata: {
    id: string;
    title: string;
    status: DebtStatus;
    kind: DebtKind;
    severity: DebtSeverity;
    scopes: string[];
    sources: string[];
    discovered: string;
    updated: string;
    resolved: string | null;
    discoveredIn: string;
  };
  authority: string;
  specialistRoute: string;
  boundednessCandidate: {
    candidate: boolean;
    basis: string;
  };
  debt: string;
  evidence: string;
  paydownCriteria: string;
  partialPaydown: string | null;
  priorPaydown: string | null;
  resolution: EditorialDebtResolution | null;
};

export type EditorialDebtQueue = {
  selection: {
    id: string | null;
    preset: QueuePreset | null;
    status: DebtStatus | null;
    kind: DebtKind | null;
    severity: DebtSeverity | null;
    scope: string | null;
    limit: number | null;
  };
  matched: number;
  shown: number;
  items: EditorialDebtBrief[];
};

type QueueDependencies = {
  loadItems?: () => EditorialDebtItem[];
  validateItems?: (items: EditorialDebtItem[]) => void;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
};

const severityOrder = new Map<DebtSeverity, number>(
  editorialDebtSeverities.map((severity, index) => [severity, index]),
);

const boundednessCandidateBasis =
  "One narrow scope, one source, noncritical severity, open status, no author decision kind, and no broad work marker in the paydown criteria. This is a boundedness signal, not an effort estimate or completion promise.";
const broadWorkPattern =
  /\b(all volumes|complete|corpus|cross volume|each|entire|every|site wide|sitewide)\b/i;

function optionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function enumOption<T extends string>(
  option: string,
  value: string,
  allowed: readonly T[],
): T {
  if (!allowed.includes(value as T)) {
    throw new Error(`${option} must be one of ${allowed.join(", ")}.`);
  }
  return value as T;
}

function parseQueueOptions(args: string[]): QueueOptions {
  const options: QueueOptions = {
    preset: "actionable",
    presetExplicit: false,
    limit: 5,
    format: "markdown",
    help: false,
  };
  const seen = new Set<string>();

  function once(option: string): void {
    if (seen.has(option)) {
      throw new Error(`${option} may be provided only once.`);
    }
    seen.add(option);
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "--help") {
      options.help = true;
    } else if (arg === "--id") {
      once(arg);
      const value = optionValue(args, index, arg).toUpperCase();
      if (!/^CTD-\d{4}$/.test(value)) {
        throw new Error("--id must use the CTD-0001 format.");
      }
      options.id = value;
      index += 1;
    } else if (arg === "--preset") {
      once(arg);
      options.presetExplicit = true;
      options.preset = enumOption(
        arg,
        optionValue(args, index, arg),
        queuePresets,
      );
      index += 1;
    } else if (arg === "--status") {
      once(arg);
      options.status = enumOption(
        arg,
        optionValue(args, index, arg),
        editorialDebtStatuses,
      );
      index += 1;
    } else if (arg === "--kind") {
      once(arg);
      options.kind = enumOption(
        arg,
        optionValue(args, index, arg),
        editorialDebtKinds,
      );
      index += 1;
    } else if (arg === "--severity") {
      once(arg);
      options.severity = enumOption(
        arg,
        optionValue(args, index, arg),
        editorialDebtSeverities,
      );
      index += 1;
    } else if (arg === "--scope") {
      once(arg);
      options.scope = optionValue(args, index, arg);
      index += 1;
    } else if (arg === "--limit") {
      once(arg);
      const value = Number(optionValue(args, index, arg));
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error("--limit must be a positive integer.");
      }
      options.limit = value;
      index += 1;
    } else if (arg === "--format") {
      once(arg);
      options.format = enumOption(
        arg,
        optionValue(args, index, arg),
        outputFormats,
      );
      index += 1;
    } else {
      throw new Error(`Unknown option '${arg}'.`);
    }
  }

  if (options.id) {
    const incompatible = [
      "--preset",
      "--status",
      "--kind",
      "--severity",
      "--scope",
      "--limit",
    ].filter((option) => seen.has(option));
    if (incompatible.length > 0) {
      throw new Error("--id may be combined only with --format.");
    }
  }

  return options;
}

function routeForItem(item: EditorialDebtItem): EditorialDebtRoute {
  const { kind, status } = item;
  if (status === "resolved") {
    return {
      authority: "Verifier with authority to reopen the ticket",
      specialistRoute: "Verification or $coherence-editorial-debt reopening",
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
      specialistRoute: "$coherence-editorial-review",
    };
  } else if (kind === "canon" || kind === "logical" || kind === "promise") {
    route = {
      authority: "Author decision",
      specialistRoute:
        "Human author decision, then $coherence-editorial-review",
    };
  } else if (kind === "factual" || kind === "citation") {
    route = {
      authority: "Primary source evidence and qualified human review",
      specialistRoute:
        "Primary source research, then $coherence-editorial-review",
    };
  } else if (kind === "link") {
    route = {
      authority: "Publishing continuity review",
      specialistRoute: "$coherence-manuscript-publish",
    };
  } else if (kind === "technical") {
    route = {
      authority: "Application maintainer",
      specialistRoute: "$coherence-build-feature",
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

function boundednessForItem(item: EditorialDebtItem): {
  candidate: boolean;
  basis: string;
} {
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
  if (item.severity === "critical") {
    reasons.push("its severity is critical");
  }
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
  if (broadWorkPattern.test(section(item, "Paydown criteria"))) {
    reasons.push("its paydown criteria contain a broad work marker");
  }

  if (reasons.length === 0) {
    return { candidate: true, basis: boundednessCandidateBasis };
  }
  return {
    candidate: false,
    basis: `Not a boundedness candidate because ${reasons.join("; ")}. This classification is not an effort estimate or completion promise.`,
  };
}

function isBoundednessCandidate(item: EditorialDebtItem): boolean {
  return boundednessForItem(item).candidate;
}

function matchesPreset(item: EditorialDebtItem, preset: QueuePreset): boolean {
  if (preset === "actionable") {
    return item.status === "open";
  }
  if (preset === "quick-win") return isBoundednessCandidate(item);
  if (preset === "author-query") return item.status === "query";
  if (preset === "deferred") return item.status === "deferred";
  if (preset === "all-active") return item.status !== "resolved";
  return item.status === "resolved";
}

function compareQueueItems(
  left: EditorialDebtItem,
  right: EditorialDebtItem,
  preset: QueuePreset,
): number {
  if (preset === "deferred") {
    return left.updated.localeCompare(right.updated) || left.id.localeCompare(right.id);
  }
  if (preset === "resolved") return left.id.localeCompare(right.id);
  return (
    severityOrder.get(left.severity)! - severityOrder.get(right.severity)! ||
    left.id.localeCompare(right.id)
  );
}

function section(item: EditorialDebtItem, heading: string): string {
  return item.sections.get(heading) ?? "";
}

function displayFile(file: string): string {
  if (!path.isAbsolute(file)) return file.split(path.sep).join("/");
  const relative = path.relative(repoRoot, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return file;
  return relative.split(path.sep).join("/");
}

function brief(item: EditorialDebtItem): EditorialDebtBrief {
  const route = routeForItem(item);
  const boundednessCandidate = boundednessForItem(item);
  return {
    file: displayFile(item.file),
    metadata: {
      id: item.id,
      title: item.title,
      status: item.status,
      kind: item.kind,
      severity: item.severity,
      scopes: [...item.scopes],
      sources: [...item.sources],
      discovered: item.discovered,
      updated: item.updated,
      resolved: item.resolved || null,
      discoveredIn: item.discoveredIn,
    },
    authority: route.authority,
    specialistRoute: route.specialistRoute,
    boundednessCandidate,
    debt: section(item, "Debt"),
    evidence: section(item, "Evidence"),
    paydownCriteria: section(item, "Paydown criteria"),
    partialPaydown: section(item, "Partial paydown") || null,
    priorPaydown: section(item, "Prior paydown") || null,
    resolution: item.resolution,
  };
}

export function buildEditorialDebtQueue(
  items: EditorialDebtItem[],
  options: Omit<QueueOptions, "format" | "help" | "presetExplicit"> & {
    presetExplicit?: boolean;
  },
): EditorialDebtQueue {
  if (options.id) {
    const item = items.find((candidate) => candidate.id === options.id);
    if (!item) throw new Error(`Editorial debt item ${options.id} was not found.`);
    return {
      selection: {
        id: options.id,
        preset: null,
        status: null,
        kind: null,
        severity: null,
        scope: null,
        limit: null,
      },
      matched: 1,
      shown: 1,
      items: [brief(item)],
    };
  }

  const applyPreset = options.presetExplicit !== false || !options.status;
  const sortPreset = applyPreset
    ? options.preset
    : options.status === "deferred"
      ? "deferred"
      : options.status === "resolved"
        ? "resolved"
        : "actionable";
  const matching = items
    .filter((item) => !applyPreset || matchesPreset(item, options.preset))
    .filter((item) => !options.status || item.status === options.status)
    .filter((item) => !options.kind || item.kind === options.kind)
    .filter((item) => !options.severity || item.severity === options.severity)
    .filter((item) => !options.scope || item.scopes.includes(options.scope))
    .sort((left, right) => compareQueueItems(left, right, sortPreset));
  const selected = matching.slice(0, options.limit);
  return {
    selection: {
      id: null,
      preset: applyPreset ? options.preset : null,
      status: options.status ?? null,
      kind: options.kind ?? null,
      severity: options.severity ?? null,
      scope: options.scope ?? null,
      limit: options.limit,
    },
    matched: matching.length,
    shown: selected.length,
    items: selected.map(brief),
  };
}

function markdownValue(value: string | null): string {
  return value || "None recorded.";
}

function selectionSummary(queue: EditorialDebtQueue): string {
  if (queue.selection.id) return `Exact ticket: ${queue.selection.id}.`;
  const filters = [
    queue.selection.preset ? `preset ${queue.selection.preset}` : null,
    queue.selection.status ? `status ${queue.selection.status}` : null,
    queue.selection.kind ? `kind ${queue.selection.kind}` : null,
    queue.selection.severity ? `severity ${queue.selection.severity}` : null,
    queue.selection.scope ? `scope ${queue.selection.scope}` : null,
  ].filter((value): value is string => Boolean(value));
  return `Selection: ${filters.join(", ")}. Showing ${queue.shown.toLocaleString()} of ${queue.matched.toLocaleString()} matching ticket(s).`;
}

function renderMarkdown(queue: EditorialDebtQueue): string {
  const lines = [
    "# Editorial Debt Queue",
    "",
    selectionSummary(queue),
  ];
  if (queue.selection.preset === "quick-win") {
    lines.push("", `Boundedness note: ${boundednessCandidateBasis}`);
  }
  if (queue.items.length === 0) {
    lines.push("", "No editorial debt items matched.", "");
    return lines.join("\n");
  }

  for (const item of queue.items) {
    const metadata = item.metadata;
    lines.push(
      "",
      `## ${metadata.id}: ${metadata.title}`,
      "",
      `File: ${item.file}`,
      `Status: ${metadata.status}`,
      `Kind: ${metadata.kind}`,
      `Severity: ${metadata.severity}`,
      `Scopes: ${metadata.scopes.join(", ")}`,
      `Sources: ${metadata.sources.join(", ")}`,
      `Discovered: ${metadata.discovered}`,
      `Updated: ${metadata.updated}`,
      `Resolved: ${metadata.resolved ?? "Not resolved"}`,
      `Discovered in: ${metadata.discoveredIn}`,
      `Authority: ${item.authority}`,
      `Specialist route: ${item.specialistRoute}`,
      `Boundedness candidate: ${item.boundednessCandidate.candidate ? "Yes" : "No"}. ${item.boundednessCandidate.basis}`,
      "",
      "### Debt",
      "",
      item.debt,
      "",
      "### Evidence",
      "",
      item.evidence,
      "",
      "### Paydown criteria",
      "",
      item.paydownCriteria,
      "",
      "### Partial paydown",
      "",
      markdownValue(item.partialPaydown),
      "",
      "### Prior paydown",
      "",
      markdownValue(item.priorPaydown),
      "",
      "### Resolution",
      "",
    );
    if (!item.resolution) {
      lines.push("None recorded.");
    } else {
      for (const [heading, key] of editorialDebtResolutionSections) {
        lines.push(`#### ${heading}`, "", item.resolution[key], "");
      }
      lines.pop();
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function editorialDebtQueueHelp(): string {
  return [
    "Inspect editorial debt without changing the register.",
    "",
    "Usage:",
    "  npm run editorial:debt:queue",
    "  npm run editorial:debt:queue -- --id CTD-0001",
    "  npm run editorial:debt:queue -- --preset all-active --kind literary",
    "",
    "Options:",
    "  --id <CTD-0001>       Select one ticket. May combine only with --format.",
    `  --preset <name>       ${queuePresets.join(", ")}. Default: actionable.`,
    `  --status <status>     ${editorialDebtStatuses.join(", ")}.`,
    `  --kind <kind>         ${editorialDebtKinds.join(", ")}.`,
    `  --severity <level>    ${editorialDebtSeverities.join(", ")}.`,
    "  --scope <scope>       Require an exact scope value.",
    "  --limit <count>       Limit results to a positive integer. Default: 5.",
    "  --format <format>     markdown or json. Default: markdown.",
    "  --help                Show this help.",
  ].join("\n");
}

export function runEditorialDebtQueueCli(
  args = process.argv.slice(2),
  dependencies: QueueDependencies = {},
): number {
  const stdout = dependencies.stdout ?? console.log;
  const stderr = dependencies.stderr ?? console.error;
  try {
    const options = parseQueueOptions(args);
    if (options.help) {
      stdout(editorialDebtQueueHelp());
      return 0;
    }
    const items = (dependencies.loadItems ?? loadEditorialDebtItems)();
    (dependencies.validateItems ?? validateEditorialDebtItems)(items);
    const queue = buildEditorialDebtQueue(items, options);
    stdout(
      options.format === "json"
        ? JSON.stringify(queue, null, 2)
        : renderMarkdown(queue),
    );
    return 0;
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = runEditorialDebtQueueCli();
}
