import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  loadSentenceSections,
  resolveImmutableEditorialBase,
  resolveSentenceScope,
  type BaselineSentenceSection,
  type SentenceLedgerRecord,
  type SentenceResultLocation,
} from "./editorial-ledger";
import {
  extractStructureUnits,
  pendingStructureRouteOutcome,
  type StructureLedgerRecord,
  type StructureResultLocation,
  type StructureUnit,
} from "./editorial-structure-ledger";
import { ensureDir, repoRoot, sha256, writeUtf8 } from "./shared";

type IndexedSentence = {
  section: BaselineSentenceSection;
  text: string;
  location: SentenceResultLocation;
  citationAttachments: string[];
};

type AlignedResult<T> = {
  disposition:
    | "keep"
    | "recast"
    | "split"
    | "merge"
    | "remove";
  outputs: T[];
  groupId?: string;
  reasonCode: string;
};

type CliOptions = {
  base?: string;
  current?: string;
  source?: string;
  outputDirectory?: string;
  force: boolean;
  help: boolean;
};

function lcsPairs<T>(baseline: T[], current: T[], text: (item: T) => string) {
  const width = current.length + 1;
  const table = new Uint32Array((baseline.length + 1) * width);
  for (let left = baseline.length - 1; left >= 0; left -= 1) {
    for (let right = current.length - 1; right >= 0; right -= 1) {
      const index = left * width + right;
      table[index] =
        text(baseline[left]!) === text(current[right]!)
          ? table[(left + 1) * width + right + 1]! + 1
          : Math.max(
              table[(left + 1) * width + right]!,
              table[left * width + right + 1]!,
            );
    }
  }

  const pairs: Array<[number, number]> = [];
  let left = 0;
  let right = 0;
  while (left < baseline.length && right < current.length) {
    if (text(baseline[left]!) === text(current[right]!)) {
      pairs.push([left, right]);
      left += 1;
      right += 1;
    } else if (
      table[(left + 1) * width + right]! >=
      table[left * width + right + 1]!
    ) {
      left += 1;
    } else {
      right += 1;
    }
  }
  return pairs;
}

export function alignEditorialItems<T>(
  baseline: T[],
  current: T[],
  text: (item: T) => string,
): Array<AlignedResult<T>> {
  if (baseline.length === 0 && current.length > 0) {
    throw new Error(
      "Current editorial scope contains content but the baseline has no unit to carry its review history.",
    );
  }
  const results: Array<AlignedResult<T>> = baseline.map(() => ({
    disposition: "remove",
    outputs: [],
    reasonCode: "removed-from-current",
  }));
  const anchors = lcsPairs(baseline, current, text);
  let baselineStart = 0;
  let currentStart = 0;
  let mergeNumber = 0;

  const assign = (
    baselineIndex: number,
    outputs: T[],
    disposition: AlignedResult<T>["disposition"],
    reasonCode: string,
    groupId?: string,
  ) => {
    const existing = results[baselineIndex]!;
    if (existing.outputs.length > 0) {
      existing.outputs.push(...outputs);
      existing.disposition = "split";
      existing.reasonCode = "inserted-content-review-required";
      delete existing.groupId;
      return;
    }
    results[baselineIndex] = {
      disposition,
      outputs,
      reasonCode,
      ...(groupId ? { groupId } : {}),
    };
  };

  const alignBlock = (
    baselineEnd: number,
    currentEnd: number,
    nextBaselineIndex: number | null,
  ) => {
    const baselineCount = baselineEnd - baselineStart;
    const currentCount = currentEnd - currentStart;
    if (baselineCount === 0 && currentCount === 0) return;
    if (baselineCount === 0) {
      const insertions = current.slice(currentStart, currentEnd);
      const previous = baselineStart - 1;
      if (previous >= 0) {
        assign(
          previous,
          insertions,
          "split",
          "inserted-content-review-required",
        );
      } else if (nextBaselineIndex !== null) {
        assign(
          nextBaselineIndex,
          insertions,
          "split",
          "inserted-content-review-required",
        );
      }
      return;
    }
    if (currentCount === 0) return;

    if (baselineCount === 1) {
      const outputs = current.slice(currentStart, currentEnd);
      assign(
        baselineStart,
        outputs,
        outputs.length > 1 ? "split" : "recast",
        "changed-text-review-required",
      );
      return;
    }
    if (currentCount === 1) {
      mergeNumber += 1;
      const groupId = `merge-${mergeNumber}`;
      const output = [current[currentStart]!];
      for (let index = baselineStart; index < baselineEnd; index += 1) {
        assign(
          index,
          output,
          "merge",
          "merged-text-review-required",
          groupId,
        );
      }
      return;
    }

    const paired = Math.min(baselineCount, currentCount);
    for (let offset = 0; offset < paired; offset += 1) {
      const isLastPair = offset === paired - 1;
      const remainingCurrent = currentCount - paired;
      const outputs =
        isLastPair && remainingCurrent > 0
          ? current.slice(currentStart + offset, currentEnd)
          : [current[currentStart + offset]!];
      assign(
        baselineStart + offset,
        outputs,
        outputs.length > 1 ? "split" : "recast",
        "changed-text-review-required",
      );
    }
  };

  for (const [baselineAnchor, currentAnchor] of anchors) {
    alignBlock(baselineAnchor, currentAnchor, baselineAnchor);
    assign(
      baselineAnchor,
      [current[currentAnchor]!],
      "keep",
      "exact-text-match",
    );
    baselineStart = baselineAnchor + 1;
    currentStart = currentAnchor + 1;
  }
  alignBlock(baseline.length, current.length, null);
  return results;
}

function flattenSentences(
  sections: BaselineSentenceSection[],
  sectionIds: string[],
): IndexedSentence[] {
  const included = new Set(sectionIds);
  return sections
    .filter((section) => included.has(section.sectionId))
    .flatMap((section) =>
      section.sentences.map((text, index) => ({
        section,
        text,
        location: {
          sectionId: section.sectionId,
          sentenceOrdinal: index + 1,
        },
        citationAttachments: section.citationAttachments?.[index] ?? [],
      })),
    );
}

export function initializeSentenceLedger(
  baselineSections: BaselineSentenceSection[],
  baselineSectionIds: string[],
  currentSections: BaselineSentenceSection[],
  currentSectionIds: string[],
): SentenceLedgerRecord[] {
  const baseline = flattenSentences(baselineSections, baselineSectionIds);
  const current = flattenSentences(currentSections, currentSectionIds);
  const aligned = alignEditorialItems(baseline, current, (item) => item.text);

  return baseline.map((sentence, index) => {
    const result = aligned[index]!;
    const proposedText = result.outputs.map((output) => output.text);
    const resultLocations = result.outputs.map((output) => output.location);
    return {
      sourceFile: sentence.section.sourceFile,
      sourceHash: sentence.section.sourceHash,
      sectionId: sentence.section.sectionId,
      sentenceOrdinal: sentence.location.sentenceOrdinal,
      originalHash: sha256(sentence.text).slice(0, 16),
      originalText: sentence.text,
      disposition: result.disposition,
      proposedText,
      resultLocations,
      ...(result.groupId ? { groupId: result.groupId } : {}),
      reasonCodes: [result.reasonCode],
      claimTypes: [],
      claimInvariants: [sentence.text],
      citationAttachments: sentence.citationAttachments,
      risk: result.disposition === "keep" ? "low" : "high",
      reviewStatus: "pending",
    };
  });
}

function structureLocation(
  sourceFile: string,
  unit: StructureUnit,
): StructureResultLocation {
  return {
    sourceFile,
    unitType: unit.unitType,
    unitOrdinal: unit.unitOrdinal,
  };
}

export function initializeStructureLedger(
  sourceFile: string,
  baselineSource: string,
  currentSource: string,
): StructureLedgerRecord[] {
  const baseline = extractStructureUnits(baselineSource);
  const current = extractStructureUnits(currentSource);
  const aligned = alignEditorialItems(baseline, current, (unit) => unit.text);
  const sourceHash = sha256(baselineSource);

  return baseline.map((unit, index) => {
    const result = aligned[index]!;
    const proposedText = result.outputs.map((output) => output.text);
    const resultLocations = result.outputs.map((output) =>
      structureLocation(sourceFile, output),
    );
    const routeImpact =
      unit.unitType === "display-metadata"
        ? "not-public"
        : result.disposition === "keep"
          ? "unchanged"
          : result.disposition === "remove"
            ? "removed"
            : result.disposition === "split"
              ? "split"
              : result.disposition === "merge"
                ? "merged"
                : "renamed";
    return {
      sourceFile,
      sourceHash,
      unitType: unit.unitType,
      unitOrdinal: unit.unitOrdinal,
      originalHash: sha256(unit.text).slice(0, 16),
      originalText: unit.text,
      disposition: result.disposition,
      proposedText,
      resultLocations,
      ...(result.groupId ? { groupId: result.groupId } : {}),
      routeImpact,
      routeOutcome:
        routeImpact === "unchanged"
          ? "Canonical wording and public route are unchanged."
          : routeImpact === "not-public"
            ? "No public route is attached to this display unit."
            : pendingStructureRouteOutcome,
      reviewStatus: "pending",
    };
  });
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

function optionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { force: false, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--force") options.force = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (["--base", "--current", "--source", "--output"].includes(arg)) {
      const value = optionValue(args, index, arg);
      if (arg === "--base") options.base = value;
      else if (arg === "--current") options.current = value;
      else if (arg === "--source") options.source = value;
      else options.outputDirectory = value;
      index += 1;
    } else {
      throw new Error(`Unknown option '${arg}'.`);
    }
  }
  return options;
}

function help(): string {
  return [
    "Initialize pending sentence and structure ledgers from an immutable baseline and current source.",
    "",
    "Usage:",
    "  npm run manuscripts:editorial-ledgers:init -- --base <sha> --current WORKTREE --source <source.md> --output <review-dir>",
    "",
    "The initializer supplies exhaustive alignment evidence. Every inferred change remains pending until editorial and independent review approve it.",
  ].join("\n");
}

function writeLedger(file: string, records: unknown[]): void {
  ensureDir(path.dirname(file));
  writeUtf8(file, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
}

function assertWritableLedgers(files: string[], force: boolean): void {
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const relative = path.relative(repoRoot, file);
    const approved = fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .some((line) => {
        try {
          return (JSON.parse(line) as { reviewStatus?: unknown }).reviewStatus === "approved";
        } catch {
          return true;
        }
      });
    if (approved) {
      throw new Error(
        `${relative} contains approved or unreadable evidence and cannot be replaced by the initializer.`,
      );
    }
    if (!force) {
      throw new Error(`${relative} already exists. Use --force to replace pending evidence.`);
    }
  }
}

export function runEditorialLedgerInitCli(
  args = process.argv.slice(2),
): number {
  try {
    const options = parseArgs(args);
    if (options.help) {
      console.log(help());
      return 0;
    }
    if (
      !options.base ||
      !options.current ||
      !options.source ||
      !options.outputDirectory
    ) {
      throw new Error("Provide --base, --current, --source, and --output.");
    }
    if (
      path.isAbsolute(options.source) ||
      !options.source.startsWith("sources/manuscripts/") ||
      options.source.split("/").includes("..")
    ) {
      throw new Error("--source must name a canonical file in sources/manuscripts/.");
    }
    const baseCommit = resolveImmutableEditorialBase(options.base);
    const baselineSections = loadSentenceSections(baseCommit, [options.source]);
    const currentSections = loadSentenceSections(options.current, [options.source]);
    const baselineScope = resolveSentenceScope(
      baselineSections,
      [],
      [options.source],
      "Baseline",
    );
    const currentScope = resolveSentenceScope(
      currentSections,
      [],
      [options.source],
      "Current",
    );
    const sentenceRecords = initializeSentenceLedger(
      baselineSections,
      baselineScope,
      currentSections,
      currentScope,
    );
    const structureRecords = initializeStructureLedger(
      options.source,
      sourceAt(baseCommit, options.source),
      sourceAt(options.current, options.source),
    );
    const output = path.resolve(repoRoot, options.outputDirectory);
    const outputRelative = path.relative(repoRoot, output);
    if (
      outputRelative.startsWith("..") ||
      path.isAbsolute(outputRelative) ||
      !outputRelative.startsWith("editorial/reviews/")
    ) {
      throw new Error("--output must be a batch directory inside editorial/reviews/.");
    }
    const sentenceFile = path.join(output, "sentence-ledger.jsonl");
    const structureFile = path.join(output, "structure-ledger.jsonl");
    assertWritableLedgers([sentenceFile, structureFile], options.force);
    writeLedger(
      sentenceFile,
      sentenceRecords,
    );
    writeLedger(
      structureFile,
      structureRecords,
    );
    console.log(
      `Initialized ${sentenceRecords.length.toLocaleString()} sentence record(s) and ${structureRecords.length.toLocaleString()} structure record(s) in ${path.relative(repoRoot, output)}.`,
    );
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = runEditorialLedgerInitCli();
}
