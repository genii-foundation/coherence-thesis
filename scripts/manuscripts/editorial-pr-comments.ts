import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  parseSentenceLedger,
  resolveImmutableEditorialBase,
  type SentenceLedgerRecord,
} from "./editorial-ledger";
import {
  parseStructureLedger,
  type StructureLedgerRecord,
} from "./editorial-structure-ledger";
import { markdownFiles, parseFrontmatter, repoRoot, sha256 } from "./shared";

const externalPostPrefix = "(AI Generated).";
const maximumBodyLength = 58_000;

type DiffSide = "LEFT" | "RIGHT";

export type ChangedLines = {
  left: number[];
  right: number[];
};

type SectionSourceRange = {
  sourceFile: string;
  sectionId: string;
  title: string;
  start: number;
  end: number;
};

export type EditorialPrComment = {
  commentKey: string;
  path: string;
  line: number;
  side: DiffSide;
  sectionId: string | null;
  kind: "sentence" | "structure";
  recordCount: number;
  body: string;
};

function identifyComment(
  sourceFile: string,
  sectionId: string | null,
  kind: EditorialPrComment["kind"],
  body: string,
): { commentKey: string; body: string } {
  const commentKey = sha256(
    JSON.stringify({ sourceFile, sectionId, kind, body }),
  ).slice(0, 20);
  return {
    commentKey,
    body: `${body}\n\n<!-- editorial-ledger-comment:${commentKey} -->`,
  };
}

type CliOptions = {
  base?: string;
  output?: string;
  reviewDirectories: string[];
  help: boolean;
};

function uniqueSorted(values: Iterable<number>): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

export function parseChangedLines(diff: string): ChangedLines {
  const left: number[] = [];
  const right: number[] = [];
  let oldLine = 0;
  let newLine = 0;
  let insideHunk = false;

  for (const line of diff.split(/\r?\n/)) {
    const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      insideHunk = true;
      continue;
    }
    if (!insideHunk || line.startsWith("\\ No newline")) continue;
    if (line.startsWith("+") && !line.startsWith("+++")) {
      right.push(newLine);
      newLine += 1;
      continue;
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      left.push(oldLine);
      oldLine += 1;
      continue;
    }
    if (line.startsWith(" ")) {
      oldLine += 1;
      newLine += 1;
    }
  }

  return { left: uniqueSorted(left), right: uniqueSorted(right) };
}

function reasonSummary(record: SentenceLedgerRecord): string {
  const reasons = record.reasonCodes.length
    ? record.reasonCodes.map((reason) => `\`${reason}\``).join(", ")
    : "none recorded";
  return [
    `Baseline sentence ${record.sentenceOrdinal}`,
    `disposition \`${record.disposition}\``,
    `risk \`${record.risk}\``,
    `status \`${record.reviewStatus}\``,
    `reasons ${reasons}`,
  ].join("; ");
}

function structureSummary(record: StructureLedgerRecord): string {
  return [
    `${record.unitType} ${record.unitOrdinal}`,
    `disposition \`${record.disposition}\``,
    `route impact \`${record.routeImpact}\``,
    `status \`${record.reviewStatus}\``,
  ].join("; ");
}

export function chunkEditorialLines(
  heading: string,
  introduction: string,
  lines: string[],
): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  const body = (items: string[], index: number, total: number) =>
    [
      externalPostPrefix,
      "",
      `### ${heading}${total > 1 ? `, part ${index + 1} of ${total}` : ""}`,
      "",
      introduction,
      "",
      ...items.map((item) => `- ${item}`),
    ].join("\n");

  for (const line of lines) {
    const candidate = body([...current, line], 0, 1);
    if (current.length > 0 && candidate.length > maximumBodyLength) {
      chunks.push(current.join("\n"));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) chunks.push(current.join("\n"));

  return chunks.map((chunk, index) =>
    body(chunk.split("\n"), index, chunks.length),
  );
}

function optionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    reviewDirectories: [],
    help: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (["--base", "--output", "--review"].includes(arg)) {
      const value = optionValue(args, index, arg);
      if (arg === "--base") options.base = value;
      else if (arg === "--output") options.output = value;
      else options.reviewDirectories.push(value);
      index += 1;
    } else {
      throw new Error(`Unknown option '${arg}'.`);
    }
  }
  return options;
}

function help(): string {
  return [
    "Prepare exhaustive, section grouped pull request review comments from approved editorial ledgers.",
    "",
    "Usage:",
    "  npm run manuscripts:pr-comments -- --base <sha> --review <batch-dir> [--review <batch-dir>] --output <dir>",
    "",
    "The output is local review material. Posting it to GitHub remains an explicit external action.",
  ].join("\n");
}

function resolveReviewDirectory(value: string): string {
  const directory = path.resolve(repoRoot, value);
  const relative = path.relative(repoRoot, directory);
  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    !relative.startsWith("editorial/reviews/")
  ) {
    throw new Error("--review must name a batch directory in editorial/reviews/.");
  }
  return directory;
}

function resolveOutputDirectory(value: string): string {
  const directory = path.resolve(repoRoot, value);
  const relative = path.relative(repoRoot, directory);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("--output must remain inside the repository worktree.");
  }
  return directory;
}

function generatedFilesAt(ref: string): Array<{ file: string; source: string }> {
  if (ref === "WORKTREE") {
    return markdownFiles().map((file) => ({
      file,
      source: fs.readFileSync(file, "utf8"),
    }));
  }
  const files = execFileSync(
    "git",
    ["ls-tree", "-r", "--name-only", ref, "--", "content/manuscripts"],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  )
    .trim()
    .split("\n")
    .filter((file) => file.endsWith(".md"));
  return files.map((file) => ({
    file,
    source: execFileSync("git", ["show", `${ref}:${file}`], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    }),
  }));
}

function loadSectionRanges(ref = "WORKTREE"): Map<string, SectionSourceRange> {
  const ranges = new Map<string, SectionSourceRange>();
  for (const { source } of generatedFilesAt(ref)) {
    const parsed = parseFrontmatter(source);
    const { sourceDoc, sectionId, title, sourceParagraphStart, sourceParagraphEnd } =
      parsed.frontmatter;
    if (
      typeof sourceDoc !== "string" ||
      typeof sectionId !== "string" ||
      typeof title !== "string" ||
      typeof sourceParagraphStart !== "number" ||
      typeof sourceParagraphEnd !== "number"
    ) {
      continue;
    }
    ranges.set(sectionId, {
      sourceFile: sourceDoc,
      sectionId,
      title,
      start: sourceParagraphStart,
      end: sourceParagraphEnd,
    });
  }
  return ranges;
}

function diffFor(base: string, sourceFile: string): string {
  return execFileSync(
    "git",
    ["diff", "--unified=0", base, "--", sourceFile],
    {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
}

function anchorFor(
  changed: ChangedLines,
  currentRange?: SectionSourceRange,
  baselineRange?: SectionSourceRange,
): { line: number; side: DiffSide } {
  const right = currentRange
    ? changed.right.find(
        (line) => line >= currentRange.start && line <= currentRange.end,
      )
    : changed.right[0];
  if (right) return { line: right, side: "RIGHT" };
  const left = baselineRange
    ? changed.left.find(
        (line) => line >= baselineRange.start && line <= baselineRange.end,
      )
    : changed.left[0];
  if (left) return { line: left, side: "LEFT" };
  if (changed.right[0]) return { line: changed.right[0], side: "RIGHT" };
  if (changed.left[0]) return { line: changed.left[0], side: "LEFT" };
  throw new Error("A ledger reports editorial changes but git has no changed line to anchor.");
}

function sourceLedgerLink(
  batchDirectory: string,
  fileName: "sentence-ledger.jsonl" | "structure-ledger.jsonl",
): string {
  return path.relative(repoRoot, path.join(batchDirectory, fileName));
}

export function buildEditorialComments(
  sentenceRecords: SentenceLedgerRecord[],
  structureRecords: StructureLedgerRecord[],
  currentRanges: Map<string, SectionSourceRange>,
  baselineRanges: Map<string, SectionSourceRange>,
  changed: ChangedLines,
  batchDirectory: string,
): EditorialPrComment[] {
  const sourceFile =
    sentenceRecords[0]?.sourceFile ?? structureRecords[0]?.sourceFile;
  if (!sourceFile) throw new Error(`${batchDirectory} contains empty ledgers.`);
  if (
    sentenceRecords.some((record) => record.sourceFile !== sourceFile) ||
    structureRecords.some((record) => record.sourceFile !== sourceFile)
  ) {
    throw new Error(`${batchDirectory} mixes more than one source file.`);
  }

  const comments: EditorialPrComment[] = [];
  const changedSentences = sentenceRecords.filter(
    (record) => record.disposition !== "keep",
  );
  const bySection = new Map<string, SentenceLedgerRecord[]>();
  for (const record of changedSentences) {
    const sectionId = record.resultLocations[0]?.sectionId ?? record.sectionId;
    const group = bySection.get(sectionId) ?? [];
    group.push(record);
    bySection.set(sectionId, group);
  }

  for (const [sectionId, records] of bySection) {
    const currentRange = currentRanges.get(sectionId);
    const baselineRange = baselineRanges.get(records[0]?.sectionId ?? sectionId);
    const anchor = anchorFor(changed, currentRange, baselineRange);
    const ledgerLink = sourceLedgerLink(batchDirectory, "sentence-ledger.jsonl");
    const introduction =
      `This section comment accounts for every changed baseline sentence assigned to this section. ` +
      `Exact original and current wording, claim invariants, and result locations are recorded in \`${ledgerLink}\`.`;
    const bodies = chunkEditorialLines(
      `Editorial changes for ${sectionId}`,
      introduction,
      records.map(reasonSummary),
    );
    for (const body of bodies) {
      const identified = identifyComment(sourceFile, sectionId, "sentence", body);
      comments.push({
        ...identified,
        path: sourceFile,
        ...anchor,
        sectionId,
        kind: "sentence",
        recordCount: records.length,
      });
    }
  }

  const changedStructure = structureRecords.filter(
    (record) => record.disposition !== "keep",
  );
  if (changedStructure.length > 0) {
    const anchor = anchorFor(changed);
    const ledgerLink = sourceLedgerLink(batchDirectory, "structure-ledger.jsonl");
    const introduction =
      `This comment accounts for every changed heading and display unit in the source file. ` +
      `Exact wording, result locations, and route outcomes are recorded in \`${ledgerLink}\`.`;
    const bodies = chunkEditorialLines(
      "Heading and display changes",
      introduction,
      changedStructure.map(structureSummary),
    );
    for (const body of bodies) {
      const identified = identifyComment(sourceFile, null, "structure", body);
      comments.push({
        ...identified,
        path: sourceFile,
        ...anchor,
        sectionId: null,
        kind: "structure",
        recordCount: changedStructure.length,
      });
    }
  }

  return comments;
}

function safeFileName(comment: EditorialPrComment, index: number): string {
  const volume = path.basename(comment.path, ".md").replace(/[^a-z0-9]+/gi, "-");
  const section = (comment.sectionId ?? comment.kind).replace(/[^a-z0-9]+/gi, "-");
  return `${String(index + 1).padStart(4, "0")}-${volume}-${section}.md`;
}

export function runEditorialPrCommentsCli(
  args = process.argv.slice(2),
): number {
  try {
    const options = parseArgs(args);
    if (options.help) {
      console.log(help());
      return 0;
    }
    if (!options.base || !options.output || options.reviewDirectories.length === 0) {
      throw new Error("Provide --base, at least one --review, and --output.");
    }
    const base = resolveImmutableEditorialBase(options.base);
    const output = resolveOutputDirectory(options.output);
    const currentRanges = loadSectionRanges();
    const baselineRanges = loadSectionRanges(base);
    const comments: EditorialPrComment[] = [];

    for (const review of options.reviewDirectories) {
      const directory = resolveReviewDirectory(review);
      const sentenceFile = path.join(directory, "sentence-ledger.jsonl");
      const structureFile = path.join(directory, "structure-ledger.jsonl");
      const sentenceRecords = parseSentenceLedger(
        fs.readFileSync(sentenceFile, "utf8"),
        path.relative(repoRoot, sentenceFile),
      );
      const structureRecords = parseStructureLedger(
        fs.readFileSync(structureFile, "utf8"),
        path.relative(repoRoot, structureFile),
      );
      const sourceFile =
        sentenceRecords[0]?.sourceFile ?? structureRecords[0]?.sourceFile;
      if (!sourceFile) throw new Error(`${review} contains empty ledgers.`);
      const changed = parseChangedLines(diffFor(base, sourceFile));
      comments.push(
        ...buildEditorialComments(
          sentenceRecords,
          structureRecords,
          currentRanges,
          baselineRanges,
          changed,
          directory,
        ),
      );
    }

    fs.rmSync(output, { recursive: true, force: true });
    fs.mkdirSync(output, { recursive: true });
    comments.forEach((comment, index) => {
      fs.writeFileSync(path.join(output, safeFileName(comment, index)), `${comment.body}\n`);
    });
    fs.writeFileSync(
      path.join(output, "comments.json"),
      `${JSON.stringify({ base, comments }, null, 2)}\n`,
    );
    console.log(
      `Prepared ${comments.length.toLocaleString()} exhaustive editorial PR comment(s) in ${path.relative(repoRoot, output)}.`,
    );
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = runEditorialPrCommentsCli();
}
