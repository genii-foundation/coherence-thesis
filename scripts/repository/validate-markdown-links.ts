import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  parseInlineMarkdown,
  visitInlineMarkdown,
} from "../../src/lib/markdown-inline";
import { listTrackedPaths } from "./source-boundary";
import { normalizeRepoPath, repoRoot } from "./paths";

export type MarkdownLinkKind = "image" | "link";

export type MarkdownLinkIssueReason =
  | "invalid-encoding"
  | "missing-definition"
  | "missing-target"
  | "outside-repository";

export type MarkdownLinkIssue = {
  column: number;
  destination: string;
  kind: MarkdownLinkKind;
  line: number;
  reason: MarkdownLinkIssueReason;
  sourcePath: string;
  targetPath: string;
};

export type MarkdownLinkAudit = {
  filesChecked: number;
  issues: MarkdownLinkIssue[];
  referencesChecked: number;
};

type Fence = {
  character: "`" | "~";
  length: number;
};

type ReferenceDefinition = {
  destination: string;
};

type RawRange = {
  end: number;
  start: number;
};

function fenceAt(line: string): Fence | undefined {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
  const marker = match?.[1];
  if (!marker) return undefined;
  return {
    character: marker[0] as Fence["character"],
    length: marker.length,
  };
}

function closesFence(line: string, fence: Fence): boolean {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
  const marker = match?.[1];
  return Boolean(
    marker &&
      marker[0] === fence.character &&
      marker.length >= fence.length,
  );
}

function ignoredDestination(destination: string): boolean {
  return (
    destination.startsWith("#") ||
    destination.startsWith("/") ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(destination)
  );
}

function destinationWithoutTitle(destination: string): string {
  const trimmed = destination.trim();
  if (trimmed.startsWith("<")) {
    let escaped = false;
    for (let index = 1; index < trimmed.length; index += 1) {
      const character = trimmed[index];
      if (!escaped && character === ">") {
        return trimmed.slice(1, index).replace(/\\(.)/g, "$1");
      }
      if (!escaped && character === "\\") {
        escaped = true;
      } else {
        escaped = false;
      }
    }
  }

  let pathValue = "";
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index] ?? "";
    if (character === "\\" && index + 1 < trimmed.length) {
      pathValue += trimmed[index + 1];
      index += 1;
      continue;
    }
    if (/\s/.test(character)) break;
    pathValue += character;
  }
  return pathValue;
}

function normalizeReferenceLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function referenceDefinitionAt(line: string): {
  definition: ReferenceDefinition;
  label: string;
} | null {
  const match = line.match(
    /^ {0,3}\[([^\]]+)\]:[ \t]*(?:<((?:\\.|[^>])*)>|((?:\\.|\S)+))(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?[ \t]*$/,
  );
  const label = match?.[1];
  const destination = match?.[2] ?? match?.[3];
  if (!label || !destination) return null;
  return {
    definition: { destination: destination.replace(/\\(.)/g, "$1") },
    label: normalizeReferenceLabel(label),
  };
}

function referenceDefinitionsForLines(
  lines: readonly string[],
): Map<string, ReferenceDefinition> {
  const definitions = new Map<string, ReferenceDefinition>();
  let fence: Fence | undefined;
  for (const line of lines) {
    if (fence) {
      if (closesFence(line, fence)) fence = undefined;
      continue;
    }
    const openingFence = fenceAt(line);
    if (openingFence) {
      fence = openingFence;
      continue;
    }
    const parsed = referenceDefinitionAt(line);
    if (parsed && !definitions.has(parsed.label)) {
      definitions.set(parsed.label, parsed.definition);
    }
  }
  return definitions;
}

function overlapsRange(start: number, end: number, ranges: readonly RawRange[]) {
  return ranges.some((range) => start < range.end && end > range.start);
}

function rawInlineDestination(
  line: string,
  range: RawRange,
  fallback: string,
): string {
  const raw = line.slice(range.start, range.end);
  const labelStart = raw.startsWith("![") ? 2 : raw.startsWith("[") ? 1 : -1;
  if (labelStart < 0) return fallback;

  let depth = 0;
  for (let index = labelStart; index < raw.length; index += 1) {
    const character = raw[index];
    if (character === "\\" && index + 1 < raw.length) {
      index += 1;
      continue;
    }
    if (character === "[") {
      depth += 1;
      continue;
    }
    if (character !== "]") continue;
    if (depth > 0) {
      depth -= 1;
      continue;
    }
    if (raw[index + 1] === "(") return raw.slice(index + 2, -1);
  }
  return fallback;
}

function pathWithoutSuffix(destination: string): string {
  const query = destination.indexOf("?");
  const fragment = destination.indexOf("#");
  const suffixes = [query, fragment].filter((index) => index >= 0);
  const end = suffixes.length > 0 ? Math.min(...suffixes) : destination.length;
  return destination.slice(0, end);
}

function isOutsideRepository(root: string, targetPath: string): boolean {
  const relative = path.relative(root, targetPath);
  return (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  );
}

function issueTargetPath(root: string, targetPath: string): string {
  const relative = normalizeRepoPath(path.relative(root, targetPath));
  return relative || ".";
}

export function auditMarkdownLinks({
  root = repoRoot,
  trackedPaths = listTrackedPaths(root),
}: {
  root?: string;
  trackedPaths?: readonly string[];
} = {}): MarkdownLinkAudit {
  const issues: MarkdownLinkIssue[] = [];
  let referencesChecked = 0;
  const markdownPaths = [...new Set(trackedPaths.map(normalizeRepoPath))]
    .filter((filePath) => filePath.toLowerCase().endsWith(".md"))
    .filter((filePath) => fs.existsSync(path.join(root, filePath)))
    .sort();

  for (const sourcePath of markdownPaths) {
    const absoluteSourcePath = path.join(root, sourcePath);
    const lines = fs.readFileSync(absoluteSourcePath, "utf8").split(/\r?\n/);
    const referenceDefinitions = referenceDefinitionsForLines(lines);
    let fence: Fence | undefined;

    function checkDestination({
      column,
      destination: rawDestination,
      kind,
      line,
    }: {
      column: number;
      destination: string;
      kind: MarkdownLinkKind;
      line: number;
    }): void {
      const destination = destinationWithoutTitle(rawDestination);
      if (!destination || ignoredDestination(destination)) return;
      referencesChecked += 1;

      const encodedPath = pathWithoutSuffix(destination);
      let decodedPath: string;
      try {
        decodedPath = decodeURIComponent(encodedPath);
      } catch {
        issues.push({
          column,
          destination,
          kind,
          line,
          reason: "invalid-encoding",
          sourcePath,
          targetPath: encodedPath,
        });
        return;
      }

      const absoluteTargetPath = path.resolve(
        path.dirname(absoluteSourcePath),
        decodedPath || path.basename(absoluteSourcePath),
      );
      const targetPath = issueTargetPath(root, absoluteTargetPath);
      if (isOutsideRepository(root, absoluteTargetPath)) {
        issues.push({
          column,
          destination,
          kind,
          line,
          reason: "outside-repository",
          sourcePath,
          targetPath,
        });
        return;
      }
      if (!fs.existsSync(absoluteTargetPath)) {
        issues.push({
          column,
          destination,
          kind,
          line,
          reason: "missing-target",
          sourcePath,
          targetPath,
        });
      }
    }

    for (const [lineIndex, line] of lines.entries()) {
      if (fence) {
        if (closesFence(line, fence)) fence = undefined;
        continue;
      }
      const openingFence = fenceAt(line);
      if (openingFence) {
        fence = openingFence;
        continue;
      }

      const nodes = parseInlineMarkdown(line);
      const protectedRanges: RawRange[] = [];
      visitInlineMarkdown(nodes, (node, ancestors) => {
        if (node.type === "code") {
          protectedRanges.push({ start: node.rawStart, end: node.rawEnd });
          return;
        }
        if (node.type !== "link" && node.type !== "image") return;
        if (ancestors.includes("code")) return;
        protectedRanges.push({ start: node.rawStart, end: node.rawEnd });
        checkDestination({
          column: node.rawStart + 1,
          destination: rawInlineDestination(
            line,
            { start: node.rawStart, end: node.rawEnd },
            node.destination,
          ),
          kind: node.type,
          line: lineIndex + 1,
        });
      });

      if (referenceDefinitionAt(line)) continue;

      const fullReferencePattern = /(!?)\[([^\]\n]+)\]\[([^\]\n]*)\]/g;
      for (const match of line.matchAll(fullReferencePattern)) {
        const start = match.index;
        const end = start + match[0].length;
        if (overlapsRange(start, end, protectedRanges)) continue;
        protectedRanges.push({ start, end });
        const label = normalizeReferenceLabel(match[3] || match[2] || "");
        const definition = referenceDefinitions.get(label);
        const kind: MarkdownLinkKind = match[1] ? "image" : "link";
        if (!definition) {
          referencesChecked += 1;
          issues.push({
            column: start + 1,
            destination: label,
            kind,
            line: lineIndex + 1,
            reason: "missing-definition",
            sourcePath,
            targetPath: `reference:${label}`,
          });
          continue;
        }
        checkDestination({
          column: start + 1,
          destination: definition.destination,
          kind,
          line: lineIndex + 1,
        });
      }

      const shortcutReferencePattern = /(!?)\[([^\]\n]+)\]/g;
      for (const match of line.matchAll(shortcutReferencePattern)) {
        const start = match.index;
        const end = start + match[0].length;
        if (overlapsRange(start, end, protectedRanges)) continue;
        const nextCharacter = line[end];
        if (nextCharacter === "(" || nextCharacter === "[") continue;
        const label = normalizeReferenceLabel(match[2] || "");
        const definition = referenceDefinitions.get(label);
        if (!definition) continue;
        checkDestination({
          column: start + 1,
          destination: definition.destination,
          kind: match[1] ? "image" : "link",
          line: lineIndex + 1,
        });
      }
    }
  }

  issues.sort((left, right) =>
    `${left.sourcePath}\0${String(left.line).padStart(10, "0")}\0${String(left.column).padStart(10, "0")}\0${left.destination}`.localeCompare(
      `${right.sourcePath}\0${String(right.line).padStart(10, "0")}\0${String(right.column).padStart(10, "0")}\0${right.destination}`,
    ),
  );

  return {
    filesChecked: markdownPaths.length,
    issues,
    referencesChecked,
  };
}

export function formatMarkdownLinkAudit(audit: MarkdownLinkAudit): string {
  if (audit.issues.length === 0) {
    return `Markdown links are valid. ${audit.filesChecked.toLocaleString()} tracked files and ${audit.referencesChecked.toLocaleString()} local references checked.`;
  }

  return [
    `Markdown link validation failed with ${audit.issues.length.toLocaleString()} issue${audit.issues.length === 1 ? "" : "s"}.`,
    ...audit.issues.map(
      (issue) =>
        `  ${issue.sourcePath}:${issue.line}:${issue.column} ${issue.kind} ${JSON.stringify(issue.destination)} ${issue.reason}: ${issue.targetPath}`,
    ),
  ].join("\n");
}

export function validateMarkdownLinks(
  options: Parameters<typeof auditMarkdownLinks>[0] = {},
): MarkdownLinkAudit {
  const audit = auditMarkdownLinks(options);
  if (audit.issues.length > 0) {
    throw new Error(formatMarkdownLinkAudit(audit));
  }
  return audit;
}

function runCli(): void {
  try {
    console.log(formatMarkdownLinkAudit(validateMarkdownLinks()));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
