import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  normalizeNewlines,
  readUtf8,
  readVolumeConfigs,
  repoRoot,
  wordCount,
} from "./shared";

export type EditorialSeverity = "error" | "warning";

export type EditorialFinding = {
  ruleId: string;
  severity: EditorialSeverity;
  file: string;
  line: number;
  column: number;
  excerpt: string;
  message: string;
};

export type EditorialAudit = {
  files: string[];
  findings: EditorialFinding[];
  counts: {
    files: number;
    errors: number;
    warnings: number;
    total: number;
    byRule: Record<string, number>;
  };
};

export type EditorialCliOptions = {
  paths: string[];
  volumes: string[];
  format: "text" | "json";
  failOn: "none" | EditorialSeverity;
  details: boolean;
  maxExamples: number;
  help: boolean;
  listRules: boolean;
};

type PatternRule = {
  ruleId: string;
  severity: EditorialSeverity;
  pattern: RegExp;
  message: string;
};

const patternRules: PatternRule[] = [
  {
    ruleId: "punctuation.em-dash",
    severity: "error",
    pattern: /\u2014/g,
    message: "Replace the em dash by revising the sentence structure.",
  },
  {
    ruleId: "punctuation.en-dash",
    severity: "error",
    pattern: /\u2013/g,
    message: "Replace the en dash with words or grammatically suitable punctuation.",
  },
  {
    ruleId: "punctuation.double-hyphen",
    severity: "error",
    pattern: /--/g,
    message: "Do not use two consecutive hyphens as prose punctuation.",
  },
  {
    ruleId: "diction.stock-transition",
    severity: "warning",
    pattern:
      /\b(?:furthermore|moreover|additionally|in conclusion|at the end of the day|in today['\u2019]s world|it is worth noting)\b/gi,
    message: "Check whether this stock transition states a real logical relationship.",
  },
  {
    ruleId: "diction.throat-clearing",
    severity: "warning",
    pattern:
      /\b(?:it is important to (?:note|remember|recognize)|to understand this|at its core|the key point is|what we must recognize is|what follows is)\b/gi,
    message: "Consider beginning with the actual claim instead of announcing it.",
  },
  {
    ruleId: "rhetoric.false-contrast",
    severity: "warning",
    pattern:
      /\b(?:not\b[^.!?\n]{0,100}\bbut|not merely|not just|not only|not simply|this is not|the point is not|rather than merely)\b/gi,
    message: "Verify that both sides of this contrast are plausible and necessary.",
  },
  {
    ruleId: "rhetoric.performed-intimacy",
    severity: "warning",
    pattern:
      /\b(?:we all know|you may (?:feel|sense|wonder)|let us imagine|consider for a moment|imagine a world)\b/gi,
    message: "Do not assign a belief or feeling to the reader without need.",
  },
  {
    ruleId: "diction.generic-uplift",
    severity: "warning",
    pattern:
      /\b(?:a brighter future|a better tomorrow|the journey ahead|the future we deserve|together,? we can|the possibilities are endless)\b/gi,
    message: "Check whether the hopeful turn is concrete and earned.",
  },
  {
    ruleId: "diction.vague-grandeur",
    severity: "warning",
    pattern:
      /\b(?:the very essence of|the fabric of (?:life|reality|existence)|a new paradigm|a testament to|fundamentally transforms|changes everything)\b/gi,
    message: "Replace generic magnitude with the specific consequence when possible.",
  },
  {
    ruleId: "diction.inflated-significance",
    severity: "warning",
    pattern:
      /\b(?:profound(?:ly)?|transformative|revolutionary|unprecedented|game[ -]changer|crucial|vital|remarkably|extraordinarily|incredibly|deeply)\b/gi,
    message: "Verify that the passage earns this claim of magnitude.",
  },
  {
    ruleId: "diction.portentous-intensifier",
    severity: "warning",
    pattern:
      /\b(?:actually|genuinely|precisely|simply|quietly|finally|at last|nothing less than)\b/gi,
    message: "Check whether this intensifier carries a precise distinction or only adds portent.",
  },
  {
    ruleId: "diction.ai-filler",
    severity: "warning",
    pattern: /\b(?:delve(?:s|d)?|leverage(?:s|d|ing)?|seamlessly)\b/gi,
    message: "Replace generic AI-associated filler with concrete language.",
  },
  {
    ruleId: "structure.meta-framing",
    severity: "warning",
    pattern:
      /\b(?:this (?:chapter|section|book|volume) (?:argues|explores|examines|will show)|as we have seen|as discussed (?:above|earlier)|in the following section)\b/gi,
    message: "Keep only wayfinding that genuinely helps the reader.",
  },
  {
    ruleId: "structure.meta-reference",
    severity: "warning",
    pattern: /\bthis (?:chapter|section|book|volume)\b/gi,
    message: "Check whether this reference guides the reader or merely announces the text.",
  },
  {
    ruleId: "copy.duplicate-word",
    severity: "warning",
    pattern: /\b([a-z][a-z'\u2019-]{2,})\s+\1\b/gi,
    message: "Check for an accidental repeated word.",
  },
  {
    ruleId: "copy.malformed-emphasis",
    severity: "warning",
    pattern: /\*{4,}/g,
    message: "Check for malformed or stacked Markdown emphasis markers.",
  },
  {
    ruleId: "citation.verify-marker",
    severity: "warning",
    pattern: /\[verify(?:[^\]]*)?\]/gi,
    message: "This citation or factual marker remains unresolved.",
  },
];

export const editorialRuleIds = [
  ...patternRules.map((rule) => rule.ruleId),
  "syntax.abstract-noun-cluster",
  "syntax.long-sentence",
  "style.excessive-emphasis",
  "style.repeated-sentence-opening",
  "style.dramatic-fragment",
  "style.duplicate-sentence",
  "style.repeated-negation",
  "style.triad-candidate",
  "structure.repeated-heading",
] as const;

type EditorialSource = {
  file: string;
  source: string;
};

function isThematicRule(line: string): boolean {
  return /^\s{0,3}(?:(?:\*\s*){3,}|(?:_\s*){3,}|(?:-\s*){3,})\s*$/.test(line);
}

function proseForPatternScan(line: string): string {
  return line
    .replace(/`[^`]*`/g, (match) => " ".repeat(match.length))
    .replace(/https?:\/\/[^\s)>]+/g, (match) => " ".repeat(match.length))
    .replace(/!\[[^\]]*]\([^)]*\)/g, (match) => " ".repeat(match.length))
    .replace(/\[([^\]]+)]\([^)]*\)/g, (_match, label: string) => label)
    .replace(/<[^>]+>/g, (match) => " ".repeat(match.length));
}

function excerpt(line: string): string {
  const compact = line.trim().replace(/\s+/g, " ");
  return compact.length <= 180 ? compact : `${compact.slice(0, 177)}...`;
}

const displayFrontmatterFields = new Set([
  "title",
  "subtitle",
  "description",
  "epigraph",
  "volumeTitle",
  "partTitle",
  "chapterTitle",
]);

function displayFrontmatterValue(line: string): string | null {
  const match = line.match(/^\s*([A-Za-z][A-Za-z0-9]*)\s*:\s*(.*)$/);
  if (!match || !displayFrontmatterFields.has(match[1] ?? "")) return null;
  return match[2] ?? "";
}

function findPatternMatches({
  file,
  line,
  lineNumber,
}: {
  file: string;
  line: string;
  lineNumber: number;
}): EditorialFinding[] {
  const findings: EditorialFinding[] = [];
  const prose = proseForPatternScan(line);
  for (const rule of patternRules) {
    rule.pattern.lastIndex = 0;
    for (const match of prose.matchAll(rule.pattern)) {
      findings.push({
        ruleId: rule.ruleId,
        severity: rule.severity,
        file,
        line: lineNumber,
        column: (match.index ?? 0) + 1,
        excerpt: excerpt(line),
        message: rule.message,
      });
    }
  }
  return findings;
}

function plainSentenceText(value: string): string {
  return value
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/^\s{0,3}>\s?/, "")
    .replace(/^\s*(?:[-*+] |\d+\.\s+)/, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sentences(value: string): string[] {
  const plain = plainSentenceText(value);
  if (!plain) return [];
  return (
    plain.match(/[^.!?]+(?:[.!?]+["'\u2019\u201d)]*|$)/g)?.map((sentence) => sentence.trim()) ??
    []
  ).filter(Boolean);
}

export function extractEditorialSentences(source: string): string[] {
  const lines = normalizeNewlines(source).split("\n");
  const extracted: string[] = [];
  let paragraphLines: string[] = [];
  let inFrontmatter = lines[0]?.trim() === "---";
  let inFence = false;
  let inHtmlComment = false;
  const flush = () => {
    if (paragraphLines.length === 0) return;
    extracted.push(...sentences(paragraphLines.join(" ")));
    paragraphLines = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (inFrontmatter) {
      if (index > 0 && trimmed === "---") inFrontmatter = false;
      return;
    }
    if (/^\s*```/.test(line)) {
      flush();
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    if (inHtmlComment) {
      if (line.includes("-->")) inHtmlComment = false;
      return;
    }
    if (line.includes("<!--")) {
      flush();
      if (!line.includes("-->")) inHtmlComment = true;
      return;
    }
    if (
      !trimmed ||
      /^\s{0,3}#{1,6}\s+/.test(line) ||
      isThematicRule(line) ||
      /^\s*\[[^\]]+]:\s+\S+/.test(line) ||
      /^\s*\|?(?:\s*:?-+:?\s*\|)+\s*$/.test(line)
    ) {
      flush();
      return;
    }
    paragraphLines.push(line);
  });
  flush();
  return extracted;
}

function openingWords(sentence: string): string {
  return (
    sentence
      .toLowerCase()
      .match(/[a-z0-9]+(?:['\u2019][a-z0-9]+)?/g)
      ?.slice(0, 2)
      .join(" ") ?? ""
  );
}

function paragraphFindings({
  file,
  paragraph,
  lineNumber,
}: {
  file: string;
  paragraph: string;
  lineNumber: number;
}): EditorialFinding[] {
  if (/^\s{0,3}#{1,6}\s+/.test(paragraph)) return [];
  const findings: EditorialFinding[] = [];
  const paragraphSentences = sentences(paragraph);

  for (const sentence of paragraphSentences) {
    const nouns =
      sentence.match(
        /\b[a-z]+(?:tion|sion|ment|ness|ity|ance|ence|ism|ship|hood)s?\b/gi,
      ) ?? [];
    if (nouns.length >= 5) {
      findings.push({
        ruleId: "syntax.abstract-noun-cluster",
        severity: "warning",
        file,
        line: lineNumber,
        column: Math.max(1, paragraph.indexOf(sentence) + 1),
        excerpt: excerpt(sentence),
        message: `This sentence contains ${nouns.length} nominal abstractions. Check for hidden actors and actions.`,
      });
    }

    const words = wordCount(sentence);
    if (words >= 55) {
      findings.push({
        ruleId: "syntax.long-sentence",
        severity: "warning",
        file,
        line: lineNumber,
        column: Math.max(1, paragraph.indexOf(sentence) + 1),
        excerpt: excerpt(sentence),
        message: `This sentence contains ${words} words. Verify that its clause structure remains legible.`,
      });
    }
  }

  const openingCounts = new Map<string, number>();
  for (const sentence of paragraphSentences) {
    const opening = openingWords(sentence);
    if (opening.split(" ").length < 2) continue;
    openingCounts.set(opening, (openingCounts.get(opening) ?? 0) + 1);
  }
  for (const [opening, count] of openingCounts) {
    if (count < 3) continue;
    findings.push({
      ruleId: "style.repeated-sentence-opening",
      severity: "warning",
      file,
      line: lineNumber,
      column: 1,
      excerpt: excerpt(paragraph),
      message: `${count} sentences begin with '${opening}'. Verify that the repetition is intentional.`,
    });
  }

  const repeatedNegations = paragraphSentences.filter((sentence) =>
    /^(?:not\b|it is not\b|this is not\b)/i.test(sentence),
  ).length;
  if (repeatedNegations >= 3) {
    findings.push({
      ruleId: "style.repeated-negation",
      severity: "warning",
      file,
      line: lineNumber,
      column: 1,
      excerpt: excerpt(paragraph),
      message: `${repeatedNegations} sentences open with negation. Verify that the anaphora earns its emphasis.`,
    });
  }

  for (const sentence of paragraphSentences) {
    const commaCount = (sentence.match(/,/g) ?? []).length;
    if (commaCount < 2 || !/,\s*(?:and|or)\s+[^,]+[.!?]?$/i.test(sentence)) continue;
    findings.push({
      ruleId: "style.triad-candidate",
      severity: "warning",
      file,
      line: lineNumber,
      column: Math.max(1, paragraph.indexOf(sentence) + 1),
      excerpt: excerpt(sentence),
      message: "Check whether this three-part or longer list is precise rather than automatically rhythmic.",
    });
  }

  if (paragraphSentences.length === 1 && wordCount(paragraphSentences[0] ?? "") <= 6) {
    findings.push({
      ruleId: "style.dramatic-fragment",
      severity: "warning",
      file,
      line: lineNumber,
      column: 1,
      excerpt: excerpt(paragraph),
      message: "Check whether this short isolated paragraph earns its dramatic emphasis.",
    });
  }

  const emphasisCount = (paragraph.match(/(?:\*\*|__|(?<!\*)\*(?!\*))/g) ?? []).length;
  if (emphasisCount >= 6) {
    findings.push({
      ruleId: "style.excessive-emphasis",
      severity: "warning",
      file,
      line: lineNumber,
      column: 1,
      excerpt: excerpt(paragraph),
      message: "Check whether typography is performing emphasis that the sentence should carry.",
    });
  }

  return findings;
}

export function auditMarkdown(source: string, file: string): EditorialFinding[] {
  const lines = normalizeNewlines(source).split("\n");
  const findings: EditorialFinding[] = [];
  const paragraphs: Array<{ text: string; line: number }> = [];
  let paragraphLines: string[] = [];
  let paragraphStart = 1;
  let inFrontmatter = lines[0]?.trim() === "---";
  let inFence = false;
  let inHtmlComment = false;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    paragraphs.push({ text: paragraphLines.join(" "), line: paragraphStart });
    paragraphLines = [];
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();

    if (inFrontmatter) {
      if (lineNumber > 1 && trimmed === "---") {
        inFrontmatter = false;
      } else {
        const value = displayFrontmatterValue(line);
        if (value !== null) {
          findings.push(
            ...findPatternMatches({ file, line: value, lineNumber }).filter(
              (finding) => finding.ruleId.startsWith("punctuation."),
            ),
          );
        }
      }
      return;
    }
    if (/^\s*```/.test(line)) {
      flushParagraph();
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    if (inHtmlComment) {
      if (line.includes("-->")) inHtmlComment = false;
      return;
    }
    if (line.includes("<!--")) {
      flushParagraph();
      if (!line.includes("-->")) inHtmlComment = true;
      return;
    }
    if (
      !trimmed ||
      isThematicRule(line) ||
      /^\s*\[[^\]]+]:\s+\S+/.test(line) ||
      /^\s*\|?(?:\s*:?-+:?\s*\|)+\s*$/.test(line)
    ) {
      flushParagraph();
      return;
    }

    findings.push(...findPatternMatches({ file, line, lineNumber }));
    if (paragraphLines.length === 0) paragraphStart = lineNumber;
    paragraphLines.push(line);
  });
  flushParagraph();

  for (const paragraph of paragraphs) {
    findings.push(
      ...paragraphFindings({
        file,
        paragraph: paragraph.text,
        lineNumber: paragraph.line,
      }),
    );
  }

  const headings = lines
    .map((line, index) => {
      const match = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
      if (!match) return null;
      const title = plainSentenceText(match[1] ?? "").toLowerCase();
      return title ? { title, original: line.trim(), line: index + 1 } : null;
    })
    .filter((heading): heading is { title: string; original: string; line: number } =>
      Boolean(heading),
    );
  const headingsByTitle = new Map<string, typeof headings>();
  for (const heading of headings) {
    const matches = headingsByTitle.get(heading.title) ?? [];
    matches.push(heading);
    headingsByTitle.set(heading.title, matches);
  }
  for (const matches of headingsByTitle.values()) {
    if (matches.length < 3) continue;
    const first = matches[0];
    if (!first) continue;
    findings.push({
      ruleId: "structure.repeated-heading",
      severity: "warning",
      file,
      line: first.line,
      column: 1,
      excerpt: excerpt(first.original),
      message: `This heading appears ${matches.length} times. Check for a repeated section template or intentional refrain.`,
    });
  }

  return findings.sort(
    (left, right) =>
      left.line - right.line ||
      left.column - right.column ||
      left.ruleId.localeCompare(right.ruleId),
  );
}

export function duplicateSentenceFindings(
  documents: EditorialSource[],
): EditorialFinding[] {
  const occurrences = new Map<
    string,
    Array<{ file: string; line: number; text: string }>
  >();

  for (const document of documents) {
    const lines = normalizeNewlines(document.source).split("\n");
    let inFrontmatter = lines[0]?.trim() === "---";
    let inFence = false;
    let inHtmlComment = false;
    let paragraphLines: string[] = [];
    let paragraphStart = 1;
    const flushParagraph = () => {
      if (paragraphLines.length === 0) return;
      const paragraph = paragraphLines.join(" ");
      for (const sentence of sentences(paragraph)) {
        if (wordCount(sentence) < 10) continue;
        const key = sentence
          .toLowerCase()
          .replace(/["'\u2018\u2019\u201c\u201d]/g, "")
          .replace(/[^a-z0-9]+/g, " ")
          .trim();
        if (!key) continue;
        const matches = occurrences.get(key) ?? [];
        matches.push({ file: document.file, line: paragraphStart, text: sentence });
        occurrences.set(key, matches);
      }
      paragraphLines = [];
    };
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (inFrontmatter) {
        if (index > 0 && trimmed === "---") inFrontmatter = false;
        return;
      }
      if (/^\s*```/.test(line)) {
        flushParagraph();
        inFence = !inFence;
        return;
      }
      if (inFence) return;
      if (inHtmlComment) {
        if (line.includes("-->")) inHtmlComment = false;
        return;
      }
      if (line.includes("<!--")) {
        flushParagraph();
        if (!line.includes("-->")) inHtmlComment = true;
        return;
      }
      if (
        !trimmed ||
        /^\s{0,3}#{1,6}\s+/.test(line) ||
        isThematicRule(line) ||
        /^\s*\[[^\]]+]:\s+\S+/.test(line) ||
        /^\s*\|?(?:\s*:?-+:?\s*\|)+\s*$/.test(line)
      ) {
        flushParagraph();
        return;
      }
      if (paragraphLines.length === 0) paragraphStart = index + 1;
      paragraphLines.push(line);
    });
    flushParagraph();
  }

  const findings: EditorialFinding[] = [];
  for (const matches of occurrences.values()) {
    if (matches.length < 2) continue;
    const first = matches[0];
    if (!first) continue;
    for (const match of matches.slice(1)) {
      findings.push({
        ruleId: "style.duplicate-sentence",
        severity: "warning",
        file: match.file,
        line: match.line,
        column: 1,
        excerpt: excerpt(match.text),
        message: `This sentence duplicates ${first.file}:${first.line}. Verify that it is an intentional refrain.`,
      });
    }
  }
  return findings.sort(
    (left, right) =>
      left.file.localeCompare(right.file) || left.line - right.line,
  );
}

function markdownFilesUnder(inputPath: string): string[] {
  const resolved = path.resolve(repoRoot, inputPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Editorial audit path does not exist: ${inputPath}`);
  }
  const stat = fs.statSync(resolved);
  if (stat.isFile()) {
    if (!/\.mdx?$/i.test(resolved)) {
      throw new Error(`Editorial audit expects Markdown: ${inputPath}`);
    }
    return [resolved];
  }
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(entryPath);
      else if (entry.isFile() && /\.mdx?$/i.test(entry.name)) files.push(entryPath);
    }
  };
  walk(resolved);
  return files.sort();
}

export function resolveEditorialFiles(options: Pick<EditorialCliOptions, "paths" | "volumes">): string[] {
  const configs = readVolumeConfigs();
  const selected = new Set<string>();
  if (options.volumes.length > 0) {
    const configsById = new Map(configs.map((config) => [config.volumeId, config]));
    for (const volumeId of options.volumes) {
      const config = configsById.get(volumeId);
      if (!config) {
        throw new Error(`Unknown volume '${volumeId}'.`);
      }
      selected.add(path.resolve(repoRoot, config.sourcePath));
    }
  }
  for (const inputPath of options.paths) {
    for (const filePath of markdownFilesUnder(inputPath)) selected.add(filePath);
  }
  if (selected.size === 0) {
    for (const config of configs) selected.add(path.resolve(repoRoot, config.sourcePath));
    const masterLedger = path.join(
      repoRoot,
      "sources/manuscripts/coherence-thesis-master-ledger.md",
    );
    if (fs.existsSync(masterLedger)) selected.add(masterLedger);
  }
  return [...selected].sort();
}

export function auditEditorialFiles(filePaths: string[]): EditorialAudit {
  const documents = filePaths.map((filePath) => ({
    file: path.relative(repoRoot, filePath),
    source: readUtf8(filePath),
  }));
  const findings = [
    ...documents.flatMap((document) =>
      auditMarkdown(document.source, document.file),
    ),
    ...duplicateSentenceFindings(documents),
  ];
  const byRule: Record<string, number> = {};
  for (const finding of findings) {
    byRule[finding.ruleId] = (byRule[finding.ruleId] ?? 0) + 1;
  }
  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.length - errors;
  return {
    files: filePaths.map((filePath) => path.relative(repoRoot, filePath)),
    findings,
    counts: {
      files: filePaths.length,
      errors,
      warnings,
      total: findings.length,
      byRule: Object.fromEntries(
        Object.entries(byRule).sort(([left], [right]) => left.localeCompare(right)),
      ),
    },
  };
}

function optionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

export function parseEditorialArgs(args: string[]): EditorialCliOptions {
  const options: EditorialCliOptions = {
    paths: [],
    volumes: [],
    format: "text",
    failOn: "none",
    details: false,
    maxExamples: 3,
    help: false,
    listRules: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--rules") options.listRules = true;
    else if (arg === "--details") options.details = true;
    else if (arg === "--strict") options.failOn = "error";
    else if (arg === "--volume") {
      options.volumes.push(optionValue(args, index, arg));
      index += 1;
    } else if (arg === "--format") {
      const value = optionValue(args, index, arg);
      if (value !== "text" && value !== "json") {
        throw new Error("--format must be 'text' or 'json'.");
      }
      options.format = value;
      index += 1;
    } else if (arg === "--fail-on") {
      const value = optionValue(args, index, arg);
      if (value !== "none" && value !== "error" && value !== "warning") {
        throw new Error("--fail-on must be 'none', 'error', or 'warning'.");
      }
      options.failOn = value;
      index += 1;
    } else if (arg === "--max-examples") {
      const value = Number(optionValue(args, index, arg));
      if (!Number.isInteger(value) || value < 0) {
        throw new Error("--max-examples must be a nonnegative integer.");
      }
      options.maxExamples = value;
      index += 1;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option '${arg}'.`);
    } else {
      options.paths.push(arg);
    }
  }
  return options;
}

export function shouldFailAudit(
  audit: EditorialAudit,
  failOn: EditorialCliOptions["failOn"],
): boolean {
  if (failOn === "none") return false;
  if (failOn === "error") return audit.counts.errors > 0;
  return audit.counts.total > 0;
}

export function formatEditorialAudit(
  audit: EditorialAudit,
  {
    details = false,
    maxExamples = 3,
  }: Partial<Pick<EditorialCliOptions, "details" | "maxExamples">> = {},
): string {
  const lines = [
    `Editorial audit: ${audit.counts.files.toLocaleString()} file(s)`,
    `${audit.counts.total.toLocaleString()} finding(s): ${audit.counts.errors.toLocaleString()} error(s), ${audit.counts.warnings.toLocaleString()} warning(s)`,
    "",
  ];
  for (const [ruleId, count] of Object.entries(audit.counts.byRule)) {
    lines.push(`${ruleId}: ${count.toLocaleString()}`);
    const examples = audit.findings
      .filter((finding) => finding.ruleId === ruleId)
      .slice(0, details ? Number.POSITIVE_INFINITY : maxExamples);
    for (const finding of examples) {
      lines.push(
        `  ${finding.file}:${finding.line}:${finding.column} ${finding.excerpt}`,
      );
    }
  }
  lines.push(
    "",
    "Findings are diagnostic signals. Review each one in context before editing.",
  );
  return lines.join("\n");
}

export function editorialHelp(): string {
  return [
    "Audit Coherence Thesis source prose for deterministic editorial signals.",
    "",
    "Usage:",
    "  npm run manuscripts:editorial",
    "  npm run manuscripts:editorial -- --volume <volume-id>",
    "  npm run manuscripts:editorial -- <file-or-directory> --strict",
    "",
    "Options:",
    "  --volume <id>        Audit one published volume. Repeatable.",
    "  --format text|json   Select output format.",
    "  --strict             Fail when prohibited punctuation is found.",
    "  --fail-on <level>    Fail on none, error, or warning.",
    "  --details            Print every finding in text output.",
    "  --max-examples <n>   Limit examples per rule. Default: 3.",
    "  --rules              List rule identifiers.",
    "  --help               Show this help.",
  ].join("\n");
}

export function runEditorialCli(args = process.argv.slice(2)): number {
  try {
    const options = parseEditorialArgs(args);
    if (options.help) {
      console.log(editorialHelp());
      return 0;
    }
    if (options.listRules) {
      console.log(editorialRuleIds.join("\n"));
      return 0;
    }
    const audit = auditEditorialFiles(resolveEditorialFiles(options));
    console.log(
      options.format === "json"
        ? JSON.stringify(audit, null, 2)
        : formatEditorialAudit(audit, options),
    );
    return shouldFailAudit(audit, options.failOn) ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = runEditorialCli();
}
