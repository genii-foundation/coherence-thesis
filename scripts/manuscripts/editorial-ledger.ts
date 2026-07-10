import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { extractEditorialSentences } from "./editorial-lint";
import {
  parseFrontmatter,
  repoRoot,
  sha256,
} from "./shared";

export const sentenceDispositions = [
  "keep",
  "tighten",
  "recast",
  "split",
  "merge",
  "move",
  "query",
  "remove",
] as const;

export type SentenceDisposition = (typeof sentenceDispositions)[number];

export type SentenceResultLocation = {
  sectionId: string;
  sentenceOrdinal: number;
};

export type SentenceLedgerRecord = {
  sourceFile: string;
  sourceHash: string;
  sectionId: string;
  sentenceOrdinal: number;
  originalHash: string;
  originalText: string;
  disposition: SentenceDisposition;
  proposedText: string[];
  resultLocations: SentenceResultLocation[];
  groupId?: string;
  reasonCodes: string[];
  claimTypes: string[];
  claimInvariants: string[];
  citationAttachments: string[];
  risk: "low" | "medium" | "high";
  reviewStatus: "pending" | "query" | "reviewed" | "approved";
};

export type BaselineSentenceSection = {
  sourceFile: string;
  sourceHash: string;
  sectionId: string;
  sentences: string[];
};

type LedgerValidationOptions = {
  requireApproved?: boolean;
};

type CoverageOptions = {
  requiredSectionIds?: string[];
};

type CliOptions = {
  base?: string;
  current?: string;
  requireApproved: boolean;
  sectionIds: string[];
  currentSectionIds: string[];
  sourceFiles: string[];
  files: string[];
  help: boolean;
};

function assertRecord(
  condition: unknown,
  message: string,
  file: string,
  line: number,
): asserts condition {
  if (!condition) throw new Error(`${file}:${line}: ${message}`);
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function resultLocationArray(value: unknown): value is SentenceResultLocation[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        typeof (item as Record<string, unknown>).sectionId === "string" &&
        (item as Record<string, unknown>).sectionId !== "" &&
        typeof (item as Record<string, unknown>).sentenceOrdinal === "number" &&
        Number.isInteger(
          (item as Record<string, unknown>).sentenceOrdinal as number,
        ) &&
        ((item as Record<string, unknown>).sentenceOrdinal as number) > 0,
    )
  );
}

export function parseSentenceLedger(
  source: string,
  file = "sentence-ledger.jsonl",
): SentenceLedgerRecord[] {
  const records: SentenceLedgerRecord[] = [];
  for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
    if (!rawLine.trim()) continue;
    const line = index + 1;
    let value: unknown;
    try {
      value = JSON.parse(rawLine);
    } catch {
      throw new Error(`${file}:${line}: invalid JSON.`);
    }
    assertRecord(
      value && typeof value === "object" && !Array.isArray(value),
      "record must be a JSON object.",
      file,
      line,
    );
    const record = value as Record<string, unknown>;
    for (const field of [
      "sourceFile",
      "sourceHash",
      "sectionId",
      "originalHash",
      "originalText",
    ]) {
      assertRecord(
        typeof record[field] === "string" && record[field] !== "",
        `${field} must be a nonempty string.`,
        file,
        line,
      );
    }
    assertRecord(
      /^[0-9a-f]{64}$/.test(record.sourceHash as string),
      "sourceHash must be a full lowercase SHA-256 hash.",
      file,
      line,
    );
    assertRecord(
      /^[0-9a-f]{16}$/.test(record.originalHash as string),
      "originalHash must be 16 lowercase hex characters.",
      file,
      line,
    );
    assertRecord(
      typeof record.sentenceOrdinal === "number" &&
        Number.isInteger(record.sentenceOrdinal) &&
        record.sentenceOrdinal > 0,
      "sentenceOrdinal must be a positive integer.",
      file,
      line,
    );
    assertRecord(
      sentenceDispositions.includes(record.disposition as SentenceDisposition),
      `disposition must be one of ${sentenceDispositions.join(", ")}.`,
      file,
      line,
    );
    for (const field of [
      "proposedText",
      "reasonCodes",
      "claimTypes",
      "claimInvariants",
      "citationAttachments",
    ]) {
      assertRecord(
        stringArray(record[field]),
        `${field} must be an array of strings.`,
        file,
        line,
      );
    }
    assertRecord(
      resultLocationArray(record.resultLocations),
      "resultLocations must contain sectionId and positive sentenceOrdinal values.",
      file,
      line,
    );
    assertRecord(
      ["low", "medium", "high"].includes(record.risk as string),
      "risk must be low, medium, or high.",
      file,
      line,
    );
    assertRecord(
      ["pending", "query", "reviewed", "approved"].includes(
        record.reviewStatus as string,
      ),
      "reviewStatus must be pending, query, reviewed, or approved.",
      file,
      line,
    );
    if (record.groupId !== undefined) {
      assertRecord(
        typeof record.groupId === "string" && record.groupId !== "",
        "groupId must be a nonempty string when present.",
        file,
        line,
      );
    }

    const proposed = record.proposedText as string[];
    const locations = record.resultLocations as SentenceResultLocation[];
    if (record.disposition !== "remove") {
      assertRecord(
        proposed.length > 0 && proposed.every((sentence) => sentence.trim() !== ""),
        "a nonremoved sentence must have nonempty proposed text.",
        file,
        line,
      );
      assertRecord(
        locations.length === proposed.length,
        "every proposed sentence must have one result location.",
        file,
        line,
      );
    }
    if (record.disposition === "keep") {
      assertRecord(
        proposed.length === 1 && proposed[0] === record.originalText,
        "a kept sentence must preserve the exact original text.",
        file,
        line,
      );
    }
    if (record.disposition === "remove") {
      assertRecord(
        proposed.length === 0 && locations.length === 0,
        "a removed sentence must have no proposed text or result location.",
        file,
        line,
      );
    }
    if (record.disposition === "split") {
      assertRecord(
        proposed.length >= 2,
        "a split sentence must produce at least two sentences.",
        file,
        line,
      );
    }
    if (record.disposition === "merge") {
      assertRecord(
        typeof record.groupId === "string" && record.groupId !== "",
        "a merged sentence needs a groupId shared with its partners.",
        file,
        line,
      );
    }
    if (record.disposition === "query") {
      assertRecord(
        record.reviewStatus === "query",
        "a query disposition requires query reviewStatus.",
        file,
        line,
      );
    }
    records.push(record as unknown as SentenceLedgerRecord);
  }
  return records;
}

function gitText(ref: string, file: string): string {
  return execFileSync("git", ["show", `${ref}:${file}`], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

export function resolveImmutableEditorialBase(ref: string): string {
  if (ref === "WORKTREE") {
    throw new Error("--base must resolve to an immutable commit, not WORKTREE.");
  }
  const commit = execFileSync(
    "git",
    ["rev-parse", "--verify", `${ref}^{commit}`],
    {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    },
  ).trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error(`--base '${ref}' did not resolve to a commit SHA.`);
  }
  return commit;
}

function markdownFilesIn(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const files: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) walk(entryPath);
      else if (entry.isFile() && entry.name.endsWith(".md")) files.push(entryPath);
    }
  };
  walk(directory);
  return files.sort();
}

function generatedSectionFiles(ref: string): string[] {
  if (ref === "WORKTREE") {
    return markdownFilesIn(path.join(repoRoot, "content/manuscripts")).map(
      (file) => path.relative(repoRoot, file),
    );
  }
  return execFileSync(
    "git",
    ["ls-tree", "-r", "--name-only", ref, "--", "content/manuscripts"],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  )
    .trim()
    .split("\n")
    .filter((file) => file.endsWith(".md"));
}

function textAt(ref: string, file: string): string {
  return ref === "WORKTREE"
    ? fs.readFileSync(path.join(repoRoot, file), "utf8")
    : gitText(ref, file);
}

function syntheticSourceSectionId(sourceFile: string): string {
  return `source:${path.basename(sourceFile).replace(/\.md$/i, "")}`;
}

export function loadSentenceSections(
  ref: string,
  extraSourceFiles: string[] = [],
): BaselineSentenceSection[] {
  const sections = generatedSectionFiles(ref).map((file) => {
    const parsed = parseFrontmatter(textAt(ref, file));
    const sourceFile = parsed.frontmatter.sourceDoc;
    const sourceHash = parsed.frontmatter.sourceHash;
    const sectionId = parsed.frontmatter.sectionId;
    if (
      typeof sourceFile !== "string" ||
      typeof sourceHash !== "string" ||
      typeof sectionId !== "string" ||
      !sourceFile ||
      !sourceHash ||
      !sectionId
    ) {
      throw new Error(
        `Generated section '${file}' is missing sourceDoc, sourceHash, or sectionId.`,
      );
    }
    return {
      sourceFile,
      sourceHash,
      sectionId,
      sentences: extractEditorialSentences(parsed.body),
    };
  });

  for (const sourceFile of extraSourceFiles) {
    const source = textAt(ref, sourceFile);
    const sourceSentences = extractEditorialSentences(source);
    const publishedCounts = new Map<string, number>();
    for (const section of sections.filter(
      (candidate) => candidate.sourceFile === sourceFile,
    )) {
      for (const sentence of section.sentences) {
        publishedCounts.set(sentence, (publishedCounts.get(sentence) ?? 0) + 1);
      }
    }
    const unpublished = sourceSentences.filter((sentence) => {
      const remaining = publishedCounts.get(sentence) ?? 0;
      if (remaining === 0) return true;
      publishedCounts.set(sentence, remaining - 1);
      return false;
    });
    if (unpublished.length > 0) {
      sections.push({
        sourceFile,
        sourceHash: sha256(source),
        sectionId: `${syntheticSourceSectionId(sourceFile)}:unpublished`,
        sentences: unpublished,
      });
    }
  }
  return sections;
}

export function loadBaselineSentenceSections(
  base: string,
  extraSourceFiles: string[] = [],
): BaselineSentenceSection[] {
  return loadSentenceSections(base, extraSourceFiles);
}

export function resolveSentenceScope(
  sections: BaselineSentenceSection[],
  sectionIds: string[],
  sourceFiles: string[],
  label: string,
): string[] {
  const availableIds = new Set(sections.map((section) => section.sectionId));
  const scope = new Set<string>();
  for (const sectionId of sectionIds) {
    if (!availableIds.has(sectionId)) {
      throw new Error(`${label} section '${sectionId}' does not exist.`);
    }
    scope.add(sectionId);
  }
  for (const sourceFile of sourceFiles) {
    const matches = sections.filter((section) => section.sourceFile === sourceFile);
    if (matches.length === 0) {
      throw new Error(`${label} source '${sourceFile}' has no editorial sections.`);
    }
    for (const section of matches) scope.add(section.sectionId);
  }
  if (scope.size === 0) throw new Error(`${label} scope is empty.`);
  return [...scope].sort();
}

export function validateSentenceLedgerCoverage(
  records: SentenceLedgerRecord[],
  baseline: BaselineSentenceSection[],
  file = "sentence-ledger.jsonl",
  { requiredSectionIds = [] }: CoverageOptions = {},
): void {
  const baselineBySection = new Map(
    baseline.map((section) => [section.sectionId, section]),
  );
  const required = new Set(requiredSectionIds);
  const recordsBySection = new Map<string, SentenceLedgerRecord[]>();
  for (const record of records) {
    const section = baselineBySection.get(record.sectionId);
    if (!section) {
      throw new Error(
        `${file}: section '${record.sectionId}' does not exist at the baseline.`,
      );
    }
    if (required.size > 0 && !required.has(record.sectionId)) {
      throw new Error(`${file}: section '${record.sectionId}' is outside the declared scope.`);
    }
    if (record.sourceFile !== section.sourceFile) {
      throw new Error(
        `${file}: section '${record.sectionId}' has sourceFile '${record.sourceFile}', expected '${section.sourceFile}'.`,
      );
    }
    if (record.sourceHash !== section.sourceHash) {
      throw new Error(
        `${file}: section '${record.sectionId}' has the wrong baseline sourceHash.`,
      );
    }
    const sectionRecords = recordsBySection.get(record.sectionId) ?? [];
    sectionRecords.push(record);
    recordsBySection.set(record.sectionId, sectionRecords);
  }
  for (const sectionId of required) {
    if (!recordsBySection.has(sectionId)) {
      throw new Error(`${file}: declared section '${sectionId}' has no records.`);
    }
  }

  for (const [sectionId, sectionRecords] of recordsBySection) {
    const section = baselineBySection.get(sectionId)!;
    const ordered = [...sectionRecords].sort(
      (left, right) => left.sentenceOrdinal - right.sentenceOrdinal,
    );
    if (ordered.length !== section.sentences.length) {
      throw new Error(
        `${file}: section '${sectionId}' covers ${ordered.length.toLocaleString()} of ${section.sentences.length.toLocaleString()} baseline sentence(s).`,
      );
    }
    for (const [index, originalText] of section.sentences.entries()) {
      const record = ordered[index]!;
      if (record.sentenceOrdinal !== index + 1) {
        throw new Error(
          `${file}: section '${sectionId}' is missing baseline sentence ${index + 1}.`,
        );
      }
      if (record.originalText !== originalText) {
        throw new Error(
          `${file}: section '${sectionId}' sentence ${index + 1} does not match the baseline text.`,
        );
      }
      const expectedHash = sha256(originalText).slice(0, 16);
      if (record.originalHash !== expectedHash) {
        throw new Error(
          `${file}: section '${sectionId}' sentence ${index + 1} has the wrong originalHash.`,
        );
      }
    }
  }
}

export function validateSentenceLedgerCurrent(
  records: SentenceLedgerRecord[],
  current: BaselineSentenceSection[],
  currentSectionIds: string[],
  file = "sentence-ledger.jsonl",
): void {
  const currentBySection = new Map(
    current.map((section) => [section.sectionId, section]),
  );
  const expected = new Map<string, string>();
  for (const sectionId of currentSectionIds) {
    const section = currentBySection.get(sectionId);
    if (!section) throw new Error(`${file}: current section '${sectionId}' is missing.`);
    section.sentences.forEach((sentence, index) => {
      expected.set(JSON.stringify([sectionId, index + 1]), sentence);
    });
  }
  const claimed = new Set<string>();
  const seenMergeGroups = new Set<string>();
  for (const record of records) {
    if (record.disposition === "remove") continue;
    if (record.disposition === "merge" && record.groupId) {
      if (seenMergeGroups.has(record.groupId)) continue;
      seenMergeGroups.add(record.groupId);
    }
    for (const [index, proposedText] of record.proposedText.entries()) {
      const location = record.resultLocations[index]!;
      const key = JSON.stringify([location.sectionId, location.sentenceOrdinal]);
      if (!expected.has(key)) {
        throw new Error(
          `${file}: result ${location.sectionId}:${location.sentenceOrdinal} is outside the declared current scope.`,
        );
      }
      if (claimed.has(key)) {
        throw new Error(
          `${file}: current result ${location.sectionId}:${location.sentenceOrdinal} is claimed more than once.`,
        );
      }
      if (expected.get(key) !== proposedText) {
        throw new Error(
          `${file}: proposed text does not match current result ${location.sectionId}:${location.sentenceOrdinal}.`,
        );
      }
      claimed.add(key);
    }
  }
  for (const key of expected.keys()) {
    if (!claimed.has(key)) {
      const [sectionId, sentenceOrdinal] = JSON.parse(key) as [string, number];
      throw new Error(
        `${file}: current sentence ${sectionId}:${sentenceOrdinal} has no ledger result.`,
      );
    }
  }
}

export function validateSentenceLedger(
  records: SentenceLedgerRecord[],
  file = "sentence-ledger.jsonl",
  { requireApproved = false }: LedgerValidationOptions = {},
): void {
  if (records.length === 0) throw new Error(`${file}: ledger is empty.`);
  const addresses = new Set<string>();
  const mergeGroups = new Map<string, SentenceLedgerRecord[]>();
  const ordinalsBySection = new Map<string, number[]>();
  for (const [index, record] of records.entries()) {
    const address = JSON.stringify([
      record.sourceFile,
      record.sourceHash,
      record.sectionId,
      record.sentenceOrdinal,
    ]);
    if (addresses.has(address)) {
      throw new Error(`${file}:${index + 1}: duplicate stable sentence address.`);
    }
    addresses.add(address);
    const sectionKey = JSON.stringify([
      record.sourceFile,
      record.sourceHash,
      record.sectionId,
    ]);
    const ordinals = ordinalsBySection.get(sectionKey) ?? [];
    ordinals.push(record.sentenceOrdinal);
    ordinalsBySection.set(sectionKey, ordinals);
    if (requireApproved && record.reviewStatus !== "approved") {
      throw new Error(
        `${file}:${index + 1}: sentence is not approved (${record.reviewStatus}).`,
      );
    }
    if (requireApproved) {
      if (record.reasonCodes.length === 0) {
        throw new Error(
          `${file}:${index + 1}: an approved sentence needs at least one reason code.`,
        );
      }
      if (record.claimTypes.length === 0) {
        throw new Error(
          `${file}:${index + 1}: an approved sentence needs at least one explicit claim type.`,
        );
      }
      if (record.claimInvariants.length === 0) {
        throw new Error(
          `${file}:${index + 1}: an approved sentence needs at least one claim invariant.`,
        );
      }
    }
    if (record.disposition === "merge" && record.groupId) {
      const group = mergeGroups.get(record.groupId) ?? [];
      group.push(record);
      mergeGroups.set(record.groupId, group);
    }
  }
  for (const [sectionKey, ordinals] of ordinalsBySection) {
    const sorted = [...ordinals].sort((left, right) => left - right);
    const missingAt = sorted.findIndex((ordinal, index) => ordinal !== index + 1);
    if (missingAt >= 0) {
      throw new Error(
        `${file}: sentence ordinals for ${sectionKey} are not contiguous from 1.`,
      );
    }
  }
  for (const [groupId, group] of mergeGroups) {
    if (group.length < 2) {
      throw new Error(`${file}: merge group '${groupId}' has fewer than two inputs.`);
    }
    const results = new Set(
      group.map((record) =>
        JSON.stringify([record.proposedText, record.resultLocations]),
      ),
    );
    if (results.size !== 1) {
      throw new Error(
        `${file}: merge group '${groupId}' has inconsistent result text or locations.`,
      );
    }
  }
}

function optionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value.`);
  return value;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    requireApproved: false,
    sectionIds: [],
    currentSectionIds: [],
    sourceFiles: [],
    files: [],
    help: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--require-approved") options.requireApproved = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (["--base", "--current", "--section", "--current-section", "--source"].includes(arg)) {
      const value = optionValue(args, index, arg);
      if (arg === "--base") options.base = value;
      else if (arg === "--current") options.current = value;
      else if (arg === "--section") options.sectionIds.push(value);
      else if (arg === "--current-section") options.currentSectionIds.push(value);
      else options.sourceFiles.push(value);
      index += 1;
    } else if (arg.startsWith("--")) throw new Error(`Unknown option '${arg}'.`);
    else options.files.push(arg);
  }
  return options;
}

function help(): string {
  return [
    "Validate machine-readable manuscript sentence ledgers.",
    "",
    "Usage:",
    "  npm run manuscripts:editorial-ledger -- --base <sha> --current WORKTREE --source <source.md> <ledger.jsonl>",
    "  npm run manuscripts:editorial-ledger -- --base <sha> --current WORKTREE --section <old-id> --current-section <new-id> --require-approved <ledger.jsonl>",
  ].join("\n");
}

export function runSentenceLedgerCli(args = process.argv.slice(2)): number {
  try {
    const options = parseArgs(args);
    if (options.help) {
      console.log(help());
      return 0;
    }
    if (options.files.length === 0) {
      throw new Error("Provide at least one sentence ledger path.");
    }
    if (options.requireApproved) {
      if (!options.base || !options.current) {
        throw new Error(
          "--require-approved requires --base <git-ref> and --current <git-ref-or-WORKTREE>.",
        );
      }
      if (options.sectionIds.length === 0 && options.sourceFiles.length === 0) {
        throw new Error(
          "--require-approved requires a declared baseline scope with --section or --source.",
        );
      }
      if (
        options.currentSectionIds.length === 0 &&
        options.sourceFiles.length === 0
      ) {
        throw new Error(
          "--require-approved requires a declared current scope with --current-section or --source.",
        );
      }
    }
    const baseCommit = options.base
      ? resolveImmutableEditorialBase(options.base)
      : undefined;
    const baseline = baseCommit
      ? loadSentenceSections(baseCommit, options.sourceFiles)
      : undefined;
    const current = options.current
      ? loadSentenceSections(options.current, options.sourceFiles)
      : undefined;
    const baselineScope = baseline
      ? resolveSentenceScope(
          baseline,
          options.sectionIds,
          options.sourceFiles,
          "Baseline",
        )
      : [];
    const currentScope = current
      ? resolveSentenceScope(
          current,
          options.currentSectionIds,
          options.sourceFiles,
          "Current",
        )
      : [];

    let count = 0;
    for (const input of options.files) {
      const filePath = path.resolve(repoRoot, input);
      const relative = path.relative(repoRoot, filePath);
      const records = parseSentenceLedger(
        fs.readFileSync(filePath, "utf8"),
        relative,
      );
      validateSentenceLedger(records, relative, {
        requireApproved: options.requireApproved,
      });
      if (baseline) {
        validateSentenceLedgerCoverage(records, baseline, relative, {
          requiredSectionIds: baselineScope,
        });
      }
      if (current) {
        validateSentenceLedgerCurrent(records, current, currentScope, relative);
      }
      count += records.length;
      console.log(
        `Validated ${records.length.toLocaleString()} sentence record(s): ${relative}`,
      );
    }
    console.log(`Validated ${count.toLocaleString()} sentence record(s) total.`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = runSentenceLedgerCli();
}
