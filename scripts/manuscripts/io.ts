// Filesystem, hashing, and text utilities for the manuscript compiler.
// Split out of shared.ts (MAINT-05). Re-exported from ./shared for stable imports.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readingMinutesForWords } from "../../src/lib/reading-time";
import type { CompiledParagraph } from "./types";

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function cleanDir(dirPath: string): void {
  fs.rmSync(dirPath, { recursive: true, force: true });
  ensureDir(dirPath);
}

export function readUtf8(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

export function writeUtf8(filePath: string, value: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value);
}

export function writeJson(filePath: string, value: unknown): void {
  writeUtf8(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function fileHash(filePath: string): string {
  return sha256(fs.readFileSync(filePath));
}

export function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-") || "untitled";
}

export function wordCount(value: string): number {
  const words = stripMarkdown(value).match(/[A-Za-z0-9]+(?:['\u2019][A-Za-z0-9]+)?/g);
  return words ? words.length : 0;
}

// The reading pace lives in one place (src/lib/reading-time.ts) so the
// build-time section headers and the client-side outline durations cannot
// disagree for the same content.
export const readingMinutes = readingMinutesForWords;

export function stripMarkdown(value: string): string {
  return value
    .replace(/^---[\s\S]*?---\n?/, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\|.*\|$/gm, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[*_`>#|\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function paragraphFingerprints(markdown: string): CompiledParagraph[] {
  return markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) => {
      const order = index + 1;
      const text = stripMarkdown(block);
      return {
        paragraphId: `p-${order}`,
        anchor: `p-${order}`,
        order,
        contentHash: sha256(text || block).slice(0, 16),
        text,
      };
    });
}
