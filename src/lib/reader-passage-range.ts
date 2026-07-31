import type { ProgressParagraph } from "./manuscript-data";

/**
 * One boundary of a contiguous passage inside a reader section.
 *
 * Offsets use the rendered block's visible textContent coordinate space. The
 * content hash lets the boundary survive an occurrence suffix change when an
 * identical Markdown block is inserted earlier in the same section.
 */
export type ReaderPassagePoint = {
  paragraphAnchor: string;
  paragraphContentHash: string;
  offset: number;
};

/**
 * A normalized, forward range. Section identity lives on the owning bookmark
 * or editorial session, so a range cannot quietly cross into another section.
 */
export type ReaderPassageRange = {
  start: ReaderPassagePoint;
  end: ReaderPassagePoint;
};

export type ReaderPassageRangeResolution =
  | {
      status: "exact" | "renamed";
      startAnchor: string;
      endAnchor: string;
    }
  | {
      status: "missing";
      startAnchor: null;
      endAnchor: null;
    };

type LegacyPassageRecord = {
  paragraphAnchor?: unknown;
  paragraphContentHash?: unknown;
  startOffset?: unknown;
  endOffset?: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteOffset(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.trunc(value));
}

// "p-h<16hex>[-N]" to the bare hash. Returns "" for the legacy "p-<n>"
// ordinal form, which carries no content identity.
export function paragraphHashFromAnchor(anchor: string): string {
  const match = /^p-h([0-9a-f]{16})(?:-\d+)?$/.exec(anchor);
  return match?.[1] ?? "";
}

function passagePoint(value: unknown): ReaderPassagePoint | null {
  if (!isObject(value)) return null;
  const paragraphAnchor = value.paragraphAnchor;
  const offset = finiteOffset(value.offset);
  if (
    typeof paragraphAnchor !== "string" ||
    paragraphAnchor.length === 0 ||
    offset === null
  ) {
    return null;
  }
  return {
    paragraphAnchor,
    paragraphContentHash:
      typeof value.paragraphContentHash === "string"
        ? value.paragraphContentHash
        : paragraphHashFromAnchor(paragraphAnchor),
    offset,
  };
}

export function createReaderPassageRange(
  start: Omit<ReaderPassagePoint, "paragraphContentHash"> & {
    paragraphContentHash?: string;
  },
  end: Omit<ReaderPassagePoint, "paragraphContentHash"> & {
    paragraphContentHash?: string;
  },
): ReaderPassageRange {
  return {
    start: {
      paragraphAnchor: start.paragraphAnchor,
      paragraphContentHash:
        start.paragraphContentHash ??
        paragraphHashFromAnchor(start.paragraphAnchor),
      offset: Math.max(0, Math.trunc(start.offset)),
    },
    end: {
      paragraphAnchor: end.paragraphAnchor,
      paragraphContentHash:
        end.paragraphContentHash ?? paragraphHashFromAnchor(end.paragraphAnchor),
      offset: Math.max(0, Math.trunc(end.offset)),
    },
  };
}

/**
 * Parses the current range shape, or migrates a version 1 single-paragraph
 * record into a same-paragraph range.
 */
export function parseReaderPassageRange(
  value: unknown,
  legacy: LegacyPassageRecord = {},
): ReaderPassageRange | null {
  if (isObject(value)) {
    const start = passagePoint(value.start);
    const end = passagePoint(value.end);
    if (start && end) return { start, end };
  }

  const paragraphAnchor = legacy.paragraphAnchor;
  const startOffset = finiteOffset(legacy.startOffset) ?? 0;
  const endOffset = finiteOffset(legacy.endOffset) ?? 0;
  if (
    typeof paragraphAnchor !== "string" ||
    paragraphAnchor.length === 0
  ) {
    return null;
  }
  const paragraphContentHash =
    typeof legacy.paragraphContentHash === "string"
      ? legacy.paragraphContentHash
      : paragraphHashFromAnchor(paragraphAnchor);
  return createReaderPassageRange(
    { paragraphAnchor, paragraphContentHash, offset: startOffset },
    { paragraphAnchor, paragraphContentHash, offset: endOffset },
  );
}

function resolvePoint(
  point: ReaderPassagePoint,
  paragraphs: readonly ProgressParagraph[],
): { status: "exact" | "renamed"; anchor: string } | null {
  if (paragraphs.some((paragraph) => paragraph.anchor === point.paragraphAnchor)) {
    return { status: "exact", anchor: point.paragraphAnchor };
  }
  if (!point.paragraphContentHash) return null;
  const renamed = paragraphs.find(
    (paragraph) => paragraph.contentHash === point.paragraphContentHash,
  );
  return renamed ? { status: "renamed", anchor: renamed.anchor } : null;
}

export function resolveReaderPassageRange(
  range: ReaderPassageRange,
  paragraphs: readonly ProgressParagraph[],
): ReaderPassageRangeResolution {
  const start = resolvePoint(range.start, paragraphs);
  const end = resolvePoint(range.end, paragraphs);
  if (!start || !end) {
    return { status: "missing", startAnchor: null, endAnchor: null };
  }

  const startIndex = paragraphs.findIndex(
    (paragraph) => paragraph.anchor === start.anchor,
  );
  const endIndex = paragraphs.findIndex(
    (paragraph) => paragraph.anchor === end.anchor,
  );
  const invalidOrder =
    startIndex < 0 ||
    endIndex < startIndex ||
    (startIndex === endIndex && range.end.offset < range.start.offset);
  if (invalidOrder) {
    return { status: "missing", startAnchor: null, endAnchor: null };
  }

  return {
    status:
      start.status === "exact" && end.status === "exact" ? "exact" : "renamed",
    startAnchor: start.anchor,
    endAnchor: end.anchor,
  };
}

export function passageRangeParagraphCount(
  range: ReaderPassageRange,
  paragraphs: readonly ProgressParagraph[],
): number | null {
  const resolved = resolveReaderPassageRange(range, paragraphs);
  if (resolved.status === "missing") return null;
  const startIndex = paragraphs.findIndex(
    (paragraph) => paragraph.anchor === resolved.startAnchor,
  );
  const endIndex = paragraphs.findIndex(
    (paragraph) => paragraph.anchor === resolved.endAnchor,
  );
  return startIndex < 0 || endIndex < startIndex
    ? null
    : endIndex - startIndex + 1;
}

export function isSingleParagraphRange(range: ReaderPassageRange): boolean {
  return range.start.paragraphAnchor === range.end.paragraphAnchor;
}
