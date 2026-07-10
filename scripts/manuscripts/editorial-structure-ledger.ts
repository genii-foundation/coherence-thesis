import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  resolveImmutableEditorialBase,
  sentenceDispositions,
  type SentenceDisposition,
} from "./editorial-ledger";
import { normalizeNewlines, repoRoot, sha256 } from "./shared";

export type StructureUnitType = "heading" | "display-metadata";

export type StructureUnit = {
  unitType: StructureUnitType;
  unitOrdinal: number;
  text: string;
};

export type StructureResultLocation = {
  sourceFile: string;
  unitType: StructureUnitType;
  unitOrdinal: number;
};

export type StructureLedgerRecord = {
  sourceFile: string;
  sourceHash: string;
  unitType: StructureUnitType;
  unitOrdinal: number;
  originalHash: string;
  originalText: string;
  disposition: SentenceDisposition;
  proposedText: string[];
  resultLocations: StructureResultLocation[];
  groupId?: string;
  routeImpact:
    | "unchanged"
    | "renamed"
    | "moved"
    | "split"
    | "merged"
    | "removed"
    | "not-public"
    | "query";
  routeOutcome: string;
  reviewStatus: "pending" | "query" | "reviewed" | "approved";
};

export const pendingStructureRouteOutcome =
  "Review the canonical route and every historical alias before approval.";

function plainDisplayText(value: string): string {
  return value
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/\s+#+\s*$/, "")
    .replace(/^\s*(?:>\s*)+/, "")
    .replace(/^\s*(?:\*\*|__|\*)/, "")
    .replace(/(?:\*\*|__|\*)\s*$/, "")
    .replace(/^\s*[\u2013\u2014]\s+/, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isDisplayLine(line: string, beforeFirstHeading: boolean): boolean {
  const trimmed = line.trim();
  if (!trimmed || /^[-*_]{3,}$/.test(trimmed) || /^\.\s*:/.test(trimmed)) {
    return false;
  }
  if (beforeFirstHeading) return true;
  return (
    /^\s{0,3}>\s*\S/.test(line) ||
    /^\s*[\u2013\u2014]\s+\S/.test(line) ||
    /^\s*(?:\*\*[^*]+\*\*|\*[^*]+\*)\s*$/.test(line) ||
    /^[A-Z0-9][A-Z0-9\s:'",.&()]+$/.test(trimmed)
  );
}

export function extractStructureUnits(source: string): StructureUnit[] {
  const lines = normalizeNewlines(source).split("\n");
  const firstHeading = lines.findIndex((line) => /^\s{0,3}#{1,6}\s+/.test(line));
  const units: StructureUnit[] = [];
  let inFence = false;
  let inComment = false;
  let inFrontmatter = lines[0]?.trim() === "---";
  let ordinal = 0;
  const add = (unitType: StructureUnitType, value: string) => {
    const text = plainDisplayText(value);
    if (!text) return;
    ordinal += 1;
    units.push({ unitType, unitOrdinal: ordinal, text });
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (inFrontmatter) {
      if (index > 0 && trimmed === "---") {
        inFrontmatter = false;
        return;
      }
      const field = line.match(/^\s*([A-Za-z][A-Za-z0-9_-]*):\s*(.+?)\s*$/);
      if (field) add("display-metadata", field[2] ?? "");
      return;
    }
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    if (inComment) {
      if (line.includes("-->")) inComment = false;
      return;
    }
    if (line.includes("<!--")) {
      if (!line.includes("-->")) inComment = true;
      return;
    }
    if (/^\s{0,3}#{1,6}\s+/.test(line)) {
      add("heading", line);
      return;
    }
    if (isDisplayLine(line, firstHeading < 0 || index < firstHeading)) {
      add("display-metadata", line);
    }
  });
  return units;
}

function sourceAt(ref: string, sourceFile: string): string {
  if (ref === "WORKTREE") {
    return fs.readFileSync(path.join(repoRoot, sourceFile), "utf8");
  }
  return execFileSync("git", ["show", `${ref}:${sourceFile}`], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function locations(value: unknown): value is StructureResultLocation[] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const location = item as Record<string, unknown>;
      return (
        typeof location.sourceFile === "string" &&
        location.sourceFile !== "" &&
        ["heading", "display-metadata"].includes(location.unitType as string) &&
        typeof location.unitOrdinal === "number" &&
        Number.isInteger(location.unitOrdinal) &&
        location.unitOrdinal > 0
      );
    })
  );
}

export function parseStructureLedger(
  source: string,
  file = "structure-ledger.jsonl",
): StructureLedgerRecord[] {
  return source
    .split(/\r?\n/)
    .flatMap((rawLine, index): StructureLedgerRecord[] => {
      if (!rawLine.trim()) return [];
      const line = index + 1;
      let value: unknown;
      try {
        value = JSON.parse(rawLine);
      } catch {
        throw new Error(`${file}:${line}: invalid JSON.`);
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${file}:${line}: record must be an object.`);
      }
      const record = value as Record<string, unknown>;
      for (const field of [
        "sourceFile",
        "sourceHash",
        "originalHash",
        "originalText",
        "routeOutcome",
      ]) {
        if (typeof record[field] !== "string" || record[field] === "") {
          throw new Error(`${file}:${line}: ${field} must be nonempty.`);
        }
      }
      if (!/^[0-9a-f]{64}$/.test(record.sourceHash as string)) {
        throw new Error(`${file}:${line}: sourceHash must be a full SHA-256 hash.`);
      }
      if (!/^[0-9a-f]{16}$/.test(record.originalHash as string)) {
        throw new Error(`${file}:${line}: originalHash must be 16 hex characters.`);
      }
      if (!["heading", "display-metadata"].includes(record.unitType as string)) {
        throw new Error(`${file}:${line}: invalid unitType.`);
      }
      if (
        typeof record.unitOrdinal !== "number" ||
        !Number.isInteger(record.unitOrdinal) ||
        record.unitOrdinal <= 0
      ) {
        throw new Error(`${file}:${line}: unitOrdinal must be positive.`);
      }
      if (!sentenceDispositions.includes(record.disposition as SentenceDisposition)) {
        throw new Error(`${file}:${line}: invalid disposition.`);
      }
      if (!stringArray(record.proposedText) || !locations(record.resultLocations)) {
        throw new Error(`${file}:${line}: proposedText or resultLocations is invalid.`);
      }
      if (
        ![
          "unchanged",
          "renamed",
          "moved",
          "split",
          "merged",
          "removed",
          "not-public",
          "query",
        ].includes(record.routeImpact as string)
      ) {
        throw new Error(`${file}:${line}: invalid routeImpact.`);
      }
      if (
        !["pending", "query", "reviewed", "approved"].includes(
          record.reviewStatus as string,
        )
      ) {
        throw new Error(`${file}:${line}: invalid reviewStatus.`);
      }
      const proposed = record.proposedText as string[];
      const resultLocations = record.resultLocations as StructureResultLocation[];
      if (record.disposition === "remove") {
        if (proposed.length !== 0 || resultLocations.length !== 0) {
          throw new Error(`${file}:${line}: removed units have no result.`);
        }
      } else if (
        proposed.length === 0 ||
        proposed.some((text) => text.trim() === "") ||
        proposed.length !== resultLocations.length
      ) {
        throw new Error(`${file}:${line}: every proposed unit needs one result location.`);
      }
      if (
        record.disposition === "keep" &&
        (proposed.length !== 1 || proposed[0] !== record.originalText)
      ) {
        throw new Error(`${file}:${line}: kept units must preserve exact text.`);
      }
      if (record.disposition === "split" && proposed.length < 2) {
        throw new Error(`${file}:${line}: split units need at least two results.`);
      }
      if (
        record.disposition === "merge" &&
        (typeof record.groupId !== "string" || record.groupId === "")
      ) {
        throw new Error(`${file}:${line}: merge units need a groupId.`);
      }
      if (record.disposition === "query" || record.routeImpact === "query") {
        if (
          record.disposition !== "query" ||
          record.routeImpact !== "query" ||
          record.reviewStatus !== "query"
        ) {
          throw new Error(
            `${file}:${line}: a query disposition or route impact requires all three query fields.`,
          );
        }
      }
      return [record as unknown as StructureLedgerRecord];
    });
}

export function validateStructureLedger(
  records: StructureLedgerRecord[],
  sourceFile: string,
  baselineSource: string,
  currentSource: string,
  { requireApproved = false }: { requireApproved?: boolean } = {},
  file = "structure-ledger.jsonl",
): void {
  const baselineUnits = extractStructureUnits(baselineSource);
  const currentUnits = extractStructureUnits(currentSource);
  const sourceHash = sha256(baselineSource);
  const recordByOrdinal = new Map<number, StructureLedgerRecord>();
  const mergeGroups = new Map<string, StructureLedgerRecord[]>();
  for (const [index, record] of records.entries()) {
    if (record.sourceFile !== sourceFile || record.sourceHash !== sourceHash) {
      throw new Error(`${file}:${index + 1}: source identity does not match the baseline.`);
    }
    if (recordByOrdinal.has(record.unitOrdinal)) {
      throw new Error(`${file}:${index + 1}: duplicate structure unit address.`);
    }
    recordByOrdinal.set(record.unitOrdinal, record);
    if (requireApproved && record.reviewStatus !== "approved") {
      throw new Error(`${file}:${index + 1}: structure unit is not approved.`);
    }
    if (
      requireApproved &&
      record.routeImpact !== "unchanged" &&
      record.routeImpact !== "not-public" &&
      record.routeOutcome === pendingStructureRouteOutcome
    ) {
      throw new Error(
        `${file}:${index + 1}: changed public structure needs an adjudicated route outcome.`,
      );
    }
    if (record.disposition === "merge" && record.groupId) {
      const group = mergeGroups.get(record.groupId) ?? [];
      group.push(record);
      mergeGroups.set(record.groupId, group);
    }
  }
  if (recordByOrdinal.size !== baselineUnits.length) {
    throw new Error(
      `${file}: structure ledger covers ${recordByOrdinal.size} of ${baselineUnits.length} baseline units.`,
    );
  }
  for (const unit of baselineUnits) {
    const record = recordByOrdinal.get(unit.unitOrdinal);
    if (!record) {
      throw new Error(
        `${file}: baseline structure unit ${unit.unitOrdinal} is missing.`,
      );
    }
    if (record.unitType !== unit.unitType || record.originalText !== unit.text) {
      throw new Error(`${file}: baseline structure unit ${unit.unitOrdinal} does not match.`);
    }
    if (record.originalHash !== sha256(unit.text).slice(0, 16)) {
      throw new Error(`${file}: baseline structure unit ${unit.unitOrdinal} has the wrong hash.`);
    }
  }
  for (const [groupId, group] of mergeGroups) {
    if (group.length < 2) {
      throw new Error(`${file}: merge group '${groupId}' needs two inputs.`);
    }
    const outputs = new Set(
      group.map((record) => JSON.stringify([record.proposedText, record.resultLocations])),
    );
    if (outputs.size !== 1) {
      throw new Error(`${file}: merge group '${groupId}' is inconsistent.`);
    }
  }

  const expected = new Map(
    currentUnits.map((unit) => [
      JSON.stringify([sourceFile, unit.unitType, unit.unitOrdinal]),
      unit.text,
    ]),
  );
  const claimed = new Set<string>();
  const seenMerges = new Set<string>();
  for (const record of records) {
    if (record.disposition === "remove") continue;
    if (record.disposition === "merge" && record.groupId) {
      if (seenMerges.has(record.groupId)) continue;
      seenMerges.add(record.groupId);
    }
    record.proposedText.forEach((text, index) => {
      const location = record.resultLocations[index]!;
      const key = JSON.stringify([
        location.sourceFile,
        location.unitType,
        location.unitOrdinal,
      ]);
      if (!expected.has(key)) {
        throw new Error(`${file}: structure result is outside current scope.`);
      }
      if (claimed.has(key)) {
        throw new Error(`${file}: structure result is claimed twice.`);
      }
      if (expected.get(key) !== text) {
        throw new Error(
          `${file}: proposed structure text differs from current source.`,
        );
      }
      claimed.add(key);
    });
  }
  if (claimed.size !== expected.size) {
    throw new Error(
      `${file}: ${expected.size - claimed.size} current structure unit(s) have no ledger result.`,
    );
  }
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export function runStructureLedgerCli(args = process.argv.slice(2)): number {
  try {
    if (args.includes("--help") || args.includes("-h")) {
      console.log(
        "npm run manuscripts:structure-ledger -- --base <sha> --current WORKTREE --source <source.md> [--require-approved] <ledger.jsonl>",
      );
      return 0;
    }
    const base = option(args, "--base");
    const current = option(args, "--current");
    const sourceFile = option(args, "--source");
    const requireApproved = args.includes("--require-approved");
    const consumed = new Set([
      "--base",
      base,
      "--current",
      current,
      "--source",
      sourceFile,
      "--require-approved",
    ]);
    const files = args.filter((arg) => !consumed.has(arg));
    if (!base || !current || !sourceFile || files.length !== 1) {
      throw new Error("Provide --base, --current, --source, and one structure ledger.");
    }
    const file = files[0]!;
    const records = parseStructureLedger(
      fs.readFileSync(path.resolve(repoRoot, file), "utf8"),
      file,
    );
    const baseCommit = resolveImmutableEditorialBase(base);
    validateStructureLedger(
      records,
      sourceFile,
      sourceAt(baseCommit, sourceFile),
      sourceAt(current, sourceFile),
      { requireApproved },
      file,
    );
    console.log(`Validated ${records.length.toLocaleString()} structure unit(s): ${file}`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = runStructureLedgerCli();
}
