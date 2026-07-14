import {
  eligibleInlineTextSpans,
  parseInlineMarkdown,
  type MarkdownInlineNode,
  type MarkdownInlineTextSpan,
} from "../../src/lib/markdown-inline";
import { splitMarkdownBlocks } from "../../src/lib/markdown-blocks";
import {
  readSemanticLinkRegistry,
  semanticLinkTextMatches,
  type SemanticLinkLabel,
  type SemanticLinkOccurrence,
  type SemanticLinkRegistry,
  type SemanticLinkRouteLevel,
} from "../editorial/semantic-links";
import type {
  CompiledParagraph,
  CompiledSection,
  CompiledVolume,
} from "./types";

export type SemanticReferenceOwnerRole = "source" | "target";

export type SemanticReferenceCompilationInput = {
  sections: readonly CompiledSection[];
  volumes: readonly CompiledVolume[];
  registry: SemanticLinkRegistry;
};

export type SemanticReferenceBodyEdit = {
  occurrenceId: string;
  sourceSectionId: string;
  targetSectionId: string;
  paragraphAnchor: string;
  href: string;
  rawStart: number;
  rawEnd: number;
};

type MarkdownBlockRange = {
  value: string;
  rawStart: number;
  rawEnd: number;
};

type ParagraphRange = MarkdownBlockRange & {
  paragraph: CompiledParagraph;
};

type InlineContainerRange = {
  type: "strong" | "emphasis";
  rawStart: number;
  rawEnd: number;
  visibleStart: number;
  visibleEnd: number;
};

type InlineMatch = {
  rawStart: number;
  rawEnd: number;
  visibleStart: number;
  visibleEnd: number;
};

type VisibleInlineMatch = {
  spans: readonly MarkdownInlineTextSpan[];
  text: string;
  ordinalKey: string;
  visibleStart: number;
  visibleEnd: number;
};

function continuityIds(section: CompiledSection): string[] {
  return [section.continuityId, ...section.legacyContinuityIds].filter(Boolean);
}

export function resolveSemanticReferenceOwner(
  sections: readonly CompiledSection[],
  continuityId: string,
  role: SemanticReferenceOwnerRole,
): CompiledSection {
  const owners = sections.filter((section) =>
    continuityIds(section).includes(continuityId),
  );
  const label = `Semantic reference ${role} continuity identity '${continuityId}'`;
  if (owners.length === 0) {
    throw new Error(`${label} has no current section owner.`);
  }
  if (owners.length > 1) {
    throw new Error(
      `${label} has multiple current section owners: ${owners
        .map((section) => section.sectionId)
        .sort()
        .join(", ")}.`,
    );
  }
  return owners[0]!;
}

function hierarchyOwner<T>(
  matches: readonly T[],
  routeLevel: "part" | "volume",
  target: CompiledSection,
): T {
  if (matches.length === 0) {
    throw new Error(
      `Semantic reference target section '${target.sectionId}' has no current ${routeLevel} route owner.`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `Semantic reference target section '${target.sectionId}' has multiple current ${routeLevel} route owners.`,
    );
  }
  return matches[0]!;
}

function requiredHref(
  href: string,
  routeLevel: SemanticLinkRouteLevel,
  target: CompiledSection,
): string {
  if (href.trim()) return href;
  throw new Error(
    `Semantic reference target section '${target.sectionId}' has no ${routeLevel} href.`,
  );
}

export function resolveSemanticReferenceHref(
  volumes: readonly CompiledVolume[],
  target: CompiledSection,
  routeLevel: SemanticLinkRouteLevel,
): string {
  if (routeLevel === "section") {
    return requiredHref(target.readerHref, routeLevel, target);
  }
  if (routeLevel === "chapter") {
    return requiredHref(target.chapterHref, routeLevel, target);
  }

  const volume = hierarchyOwner(
    volumes.filter(
      (candidate) =>
        candidate.volumeId === target.volumeId &&
        candidate.sectionIds.includes(target.sectionId),
    ),
    "volume",
    target,
  );
  if (routeLevel === "volume") {
    return requiredHref(volume.href, routeLevel, target);
  }

  const part = hierarchyOwner(
    volume.parts.filter(
      (candidate) =>
        candidate.partId === target.partId &&
        candidate.sectionIds.includes(target.sectionId),
    ),
    "part",
    target,
  );
  return requiredHref(part.href, routeLevel, target);
}

function markdownBlockRanges(markdown: string): MarkdownBlockRange[] {
  const blocks = splitMarkdownBlocks(markdown);
  const ranges: MarkdownBlockRange[] = [];
  let cursor = 0;
  for (const value of blocks) {
    const rawStart = markdown.indexOf(value, cursor);
    if (rawStart < 0) {
      throw new Error(
        "Could not map a compiled Markdown block to its raw body.",
      );
    }
    const rawEnd = rawStart + value.length;
    ranges.push({ value, rawStart, rawEnd });
    cursor = rawEnd;
  }
  return ranges;
}

export function resolveSemanticReferenceParagraph(
  section: CompiledSection,
  paragraphAnchor: string,
): ParagraphRange {
  const paragraphs = section.paragraphs.filter(
    (paragraph) => paragraph.anchor === paragraphAnchor,
  );
  const label = `Semantic reference paragraph '${paragraphAnchor}' in section '${section.sectionId}'`;
  if (paragraphs.length === 0) {
    throw new Error(`${label} does not exist.`);
  }
  if (paragraphs.length > 1) {
    throw new Error(`${label} is not unique.`);
  }

  const blocks = markdownBlockRanges(section.body);
  if (blocks.length !== section.paragraphs.length) {
    throw new Error(
      `Semantic reference section '${section.sectionId}' has ${blocks.length.toLocaleString()} Markdown blocks but ${section.paragraphs.length.toLocaleString()} paragraph identities.`,
    );
  }
  const paragraph = paragraphs[0]!;
  const block = blocks[paragraph.order - 1];
  if (!block) {
    throw new Error(`${label} has invalid paragraph order ${paragraph.order}.`);
  }
  return { paragraph, ...block };
}

function formattingContainers(
  nodes: readonly MarkdownInlineNode[],
): InlineContainerRange[] {
  const containers: InlineContainerRange[] = [];
  const visit = (items: readonly MarkdownInlineNode[]) => {
    for (const node of items) {
      if (node.type === "strong" || node.type === "emphasis") {
        containers.push({
          type: node.type,
          rawStart: node.rawStart,
          rawEnd: node.rawEnd,
          visibleStart: node.visibleStart,
          visibleEnd: node.visibleEnd,
        });
        visit(node.children);
      } else if (node.type === "link") {
        visit(node.children);
      }
    }
  };
  visit(nodes);
  return containers;
}

function rawOffsetForVisiblePosition(
  span: MarkdownInlineTextSpan,
  visiblePosition: number,
  end = false,
): number {
  const visibleOffset = Math.max(0, visiblePosition - span.visibleStart);
  const visibleLength = span.visibleEnd - span.visibleStart;
  const rawLength = span.rawEnd - span.rawStart;
  if (visibleLength === rawLength) return span.rawStart + visibleOffset;
  if (visibleOffset === 0) return span.rawStart;
  if (visibleOffset >= visibleLength) return span.rawEnd;
  return end ? span.rawEnd : span.rawStart;
}

function wrapSafeRawRange(
  spans: readonly MarkdownInlineTextSpan[],
  containers: readonly InlineContainerRange[],
  visibleStart: number,
  visibleEnd: number,
): InlineMatch {
  const overlapping = spans.filter(
    (span) => visibleStart < span.visibleEnd && visibleEnd > span.visibleStart,
  );
  const first = overlapping[0];
  const last = overlapping.at(-1);
  if (!first || !last) {
    throw new Error(
      "Eligible semantic reference text has no raw Markdown range.",
    );
  }

  let rawStart = rawOffsetForVisiblePosition(first, visibleStart);
  let rawEnd = rawOffsetForVisiblePosition(last, visibleEnd, true);
  for (const container of containers) {
    const overlaps =
      visibleStart < container.visibleEnd &&
      visibleEnd > container.visibleStart;
    if (!overlaps) continue;
    const matchInsideContainer =
      visibleStart >= container.visibleStart &&
      visibleEnd <= container.visibleEnd;
    if (matchInsideContainer) continue;
    const containerInsideMatch =
      container.visibleStart >= visibleStart &&
      container.visibleEnd <= visibleEnd;
    if (!containerInsideMatch) {
      throw new Error(
        "Approved semantic reference crosses only part of an emphasis boundary.",
      );
    }
    rawStart = Math.min(rawStart, container.rawStart);
    rawEnd = Math.max(rawEnd, container.rawEnd);
  }

  return { rawStart, rawEnd, visibleStart, visibleEnd };
}

export function locateSemanticReferenceMatch(
  markdown: string,
  labels: readonly SemanticLinkLabel[],
  matchText: string,
  matchOrdinal: number,
): InlineMatch {
  if (!matchText) {
    throw new Error("Semantic reference match text must not be empty.");
  }
  if (!Number.isInteger(matchOrdinal) || matchOrdinal < 1) {
    throw new Error(
      "Semantic reference match ordinal must be a positive integer.",
    );
  }

  const nodes = parseInlineMarkdown(markdown);
  const spans = eligibleInlineTextSpans(nodes).sort(
    (left, right) => left.visibleStart - right.visibleStart,
  );
  const containers = formattingContainers(nodes);
  const groups: MarkdownInlineTextSpan[][] = [];
  for (const span of spans) {
    const current = groups.at(-1);
    if (current?.at(-1)?.visibleEnd === span.visibleStart) {
      current.push(span);
    } else {
      groups.push([span]);
    }
  }

  const matches: VisibleInlineMatch[] = [];
  for (const group of groups) {
    const first = group[0];
    if (!first) continue;
    const visible = group.map((span) => span.text).join("");
    for (const match of semanticLinkTextMatches(labels, visible)) {
      matches.push({
        spans: group,
        text: match.text,
        ordinalKey: match.ordinalKey,
        visibleStart: first.visibleStart + match.visibleStart,
        visibleEnd: first.visibleStart + match.visibleEnd,
      });
    }
  }
  matches.sort((left, right) => left.visibleStart - right.visibleStart);

  const ordinals = new Map<string, number>();
  let selected: VisibleInlineMatch | undefined;
  for (const match of matches) {
    const ordinal = (ordinals.get(match.ordinalKey) ?? 0) + 1;
    ordinals.set(match.ordinalKey, ordinal);
    if (match.text === matchText && ordinal === matchOrdinal) {
      selected = match;
      break;
    }
  }
  if (!selected) {
    const found = matches.filter((match) => match.text === matchText).length;
    throw new Error(
      `Could not locate eligible occurrence ${matchOrdinal.toLocaleString()} of exact text '${matchText}'. Found ${found.toLocaleString()}.`,
    );
  }
  return wrapSafeRawRange(
    selected.spans,
    containers,
    selected.visibleStart,
    selected.visibleEnd,
  );
}

function occurrenceEdit(
  occurrence: SemanticLinkOccurrence,
  input: SemanticReferenceCompilationInput,
): SemanticReferenceBodyEdit {
  const concept = input.registry.concepts.find(
    (candidate) => candidate.conceptId === occurrence.conceptId,
  );
  if (!concept) {
    throw new Error(
      `Approved semantic reference '${occurrence.occurrenceId}' names unknown concept '${occurrence.conceptId}'.`,
    );
  }
  const source = resolveSemanticReferenceOwner(
    input.sections,
    occurrence.source.sectionContinuityId,
    "source",
  );
  const sourceDoc = source.sourceDoc?.replaceAll("\\", "/") ?? "";
  if (
    !sourceDoc.includes(
      `/volumes/${occurrence.source.editorialId}/`,
    )
  ) {
    throw new Error(
      `Approved semantic reference '${occurrence.occurrenceId}' resolves to section '${source.sectionId}', but that section does not belong to '${occurrence.source.editorialId}'.`,
    );
  }
  const target = resolveSemanticReferenceOwner(
    input.sections,
    concept.targetContinuityId,
    "target",
  );
  const paragraph = resolveSemanticReferenceParagraph(
    source,
    occurrence.source.paragraphAnchor,
  );
  const match = locateSemanticReferenceMatch(
    paragraph.value,
    concept.labels,
    occurrence.source.matchText,
    occurrence.source.matchOrdinal,
  );
  return {
    occurrenceId: occurrence.occurrenceId,
    sourceSectionId: source.sectionId,
    targetSectionId: target.sectionId,
    paragraphAnchor: occurrence.source.paragraphAnchor,
    href: resolveSemanticReferenceHref(
      input.volumes,
      target,
      concept.routeLevel,
    ),
    rawStart: paragraph.rawStart + match.rawStart,
    rawEnd: paragraph.rawStart + match.rawEnd,
  };
}

function assertNonoverlappingEdits(
  sectionId: string,
  edits: readonly SemanticReferenceBodyEdit[],
): void {
  const ordered = [...edits].sort(
    (left, right) =>
      left.rawStart - right.rawStart || left.rawEnd - right.rawEnd,
  );
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!;
    const current = ordered[index]!;
    if (current.rawStart >= previous.rawEnd) continue;
    throw new Error(
      `Approved semantic references '${previous.occurrenceId}' and '${current.occurrenceId}' overlap in section '${sectionId}'.`,
    );
  }
}

export function planSemanticReferenceBodyEdits(
  input: SemanticReferenceCompilationInput,
): SemanticReferenceBodyEdit[] {
  return input.registry.occurrences
    .filter((occurrence) => occurrence.decision === "link")
    .map((occurrence) => occurrenceEdit(occurrence, input));
}

export function applySemanticReferences(
  input: SemanticReferenceCompilationInput,
): CompiledSection[] {
  const editsBySectionId = new Map<string, SemanticReferenceBodyEdit[]>();
  for (const edit of planSemanticReferenceBodyEdits(input)) {
    const edits = editsBySectionId.get(edit.sourceSectionId) ?? [];
    edits.push(edit);
    editsBySectionId.set(edit.sourceSectionId, edits);
  }

  return input.sections.map((section) => {
    const edits = editsBySectionId.get(section.sectionId);
    if (!edits?.length) return section;
    assertNonoverlappingEdits(section.sectionId, edits);
    let body = section.body;
    for (const edit of [...edits].sort(
      (left, right) => right.rawStart - left.rawStart,
    )) {
      const rawLabel = section.body.slice(edit.rawStart, edit.rawEnd);
      body = `${body.slice(0, edit.rawStart)}[${rawLabel}](${edit.href})${body.slice(edit.rawEnd)}`;
    }
    return { ...section, body };
  });
}

export function enrichSemanticReferences(
  sections: readonly CompiledSection[],
  volumes: readonly CompiledVolume[],
  registry = readSemanticLinkRegistry(),
): CompiledSection[] {
  return applySemanticReferences({ sections, volumes, registry });
}
