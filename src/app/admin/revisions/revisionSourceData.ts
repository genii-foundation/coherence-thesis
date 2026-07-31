import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { splitMarkdownBlocks } from "@/lib/markdown-blocks";

type OriginalCheckpoint = {
  checkpointId: string;
  snapshotPath: string;
};

export type RevisionOriginalContext = {
  checkpointId: string;
  heading: string;
  blocks: string[];
  selectedBlockIndexes: number[];
};

export function extractOriginalSection(
  markdown: string,
  heading: string,
): string[] {
  const lines = markdown.split("\n");
  const target = heading.trim().toLocaleLowerCase();
  let start = -1;
  let level = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+(.*)$/.exec(lines[index] ?? "");
    if (!match) continue;
    if ((match[2] ?? "").trim().toLocaleLowerCase() !== target) continue;
    start = index + 1;
    level = (match[1] ?? "").length;
    break;
  }
  if (start < 0) return [];

  const body: string[] = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const nextHeading = /^(#{1,6})\s+/.exec(line);
    if (nextHeading && (nextHeading[1] ?? "").length <= level) break;
    if (/^---+$/.test(line.trim())) break;
    body.push(line);
  }

  return splitMarkdownBlocks(body.join("\n").trim());
}

function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[*_`>#|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function selectedBlocks(blocks: string[], selection: string): number[] {
  const target = plainText(selection).toLocaleLowerCase();
  if (!target) return [];
  const normalized = blocks.map((block) =>
    plainText(block).toLocaleLowerCase(),
  );
  const exact = normalized
    .map((block, index) => (block.includes(target) ? index : -1))
    .filter((index) => index >= 0);
  if (exact.length > 0) return exact;

  const targetTerms = new Set(
    target.split(/\s+/).filter((term) => term.length > 3),
  );
  if (targetTerms.size === 0) return [];
  let bestIndex = -1;
  let bestScore = 0;
  normalized.forEach((block, index) => {
    const terms = new Set(block.split(/\s+/).filter((term) => term.length > 3));
    const overlap = [...targetTerms].filter((term) => terms.has(term)).length;
    const score = overlap / targetTerms.size;
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });
  return bestIndex >= 0 && bestScore >= 0.25 ? [bestIndex] : [];
}

function readOriginalCheckpoint(
  root: string,
  editorialId: string,
): OriginalCheckpoint | null {
  const manifestPath = path.join(
    root,
    "publishing",
    "continuity",
    "manuscript-checkpoints.json",
  );
  if (!existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      volumes?: {
        editorialId?: string;
        originalCheckpointId?: string;
        checkpoints?: {
          checkpointId?: string;
          kind?: string;
          snapshotPath?: string;
        }[];
      }[];
    };
    const volume = manifest.volumes?.find(
      (candidate) => candidate.editorialId === editorialId,
    );
    const checkpoint = volume?.checkpoints?.find(
      (candidate) =>
        candidate.kind === "original" &&
        candidate.checkpointId === volume.originalCheckpointId,
    );
    if (
      !checkpoint?.checkpointId ||
      typeof checkpoint.snapshotPath !== "string"
    ) {
      return null;
    }
    return {
      checkpointId: checkpoint.checkpointId,
      snapshotPath: checkpoint.snapshotPath,
    };
  } catch {
    return null;
  }
}

export function readRevisionOriginalContext(
  editorialId: string,
  heading: string,
  selectedPassage: string,
): RevisionOriginalContext | null {
  if (!/^volume-\d{2}$/.test(editorialId) || !heading.trim()) return null;
  const root = process.cwd();
  const checkpoint = readOriginalCheckpoint(root, editorialId);
  if (!checkpoint) return null;
  const baselinePath = path.resolve(root, checkpoint.snapshotPath);
  if (
    !baselinePath.startsWith(`${root}${path.sep}`) ||
    !existsSync(baselinePath)
  ) {
    return null;
  }

  const blocks = extractOriginalSection(
    readFileSync(baselinePath, "utf8"),
    heading,
  );
  if (blocks.length === 0) return null;

  return {
    checkpointId: checkpoint.checkpointId,
    heading,
    blocks,
    selectedBlockIndexes: selectedBlocks(blocks, selectedPassage),
  };
}
