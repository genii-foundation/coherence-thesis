import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  inlineMarkdownVisibleText,
  inlineTextSpans,
  parseInlineMarkdown,
  visitInlineMarkdown,
  type MarkdownInlineLinkNode,
  type MarkdownInlineTextSpan,
} from "../../src/lib/markdown-inline";
import {
  buildCatalog,
  paragraphFingerprints,
  readMarkdownDocuments,
  readVolumeConfigs,
  repoRoot,
  sha256,
  writeJson,
  writeUtf8,
  type CompiledCatalog,
} from "../manuscripts/shared";
import { generatedSemanticLinksReportsRoot } from "../repository/paths";
import {
  readSemanticLinkRegistry,
  semanticLinkOccurrenceId,
  semanticLinkRegistrySha256,
  semanticLinkTextMatches,
  type SemanticLinkAuditReport,
  type SemanticLinkCandidate,
  type SemanticLinkCandidateTarget,
  type SemanticLinkConceptDefinition,
  type SemanticLinkConfidence,
  type SemanticLinkOccurrence,
  type SemanticLinkRegistry,
  type SemanticLinkSuggestedConcept,
  type SemanticLinkTextMatch,
} from "./semantic-links";

export type SemanticLinkAuditSection = {
  editorialId: string;
  sourcePath: string;
  sourceHash: string;
  currentSectionId: string;
  currentRouteHrefs: string[];
  continuityIds: string[];
  sectionTitle: string;
  body: string;
  sourceLineNumbers: number[];
};

export type SemanticLinkAuditInput = {
  registry: SemanticLinkRegistry;
  suggestedConcepts?: SemanticLinkSuggestedConcept[];
  conceptIds?: string[];
  sections: SemanticLinkAuditSection[];
  targetsByConceptId: Map<string, SemanticLinkCandidateTarget>;
};

export type SemanticLinkAuditCliOptions = {
  volumes: string[];
  concepts: string[];
  outputDirectory: string;
  stdout: boolean;
};

type MarkdownBlock = {
  value: string;
  rawStart: number;
};

type CandidateContext = {
  match: SemanticLinkTextMatch;
  spans: MarkdownInlineTextSpan[];
  rawStart: number;
  rawEnd: number;
  link: MarkdownInlineLinkNode | null;
};

export const semanticLinkReportsRoot = generatedSemanticLinksReportsRoot;

const structuralCue =
  /\b(?:book|chapter|movement|part|section|volume)\b/i;

function markdownBlocks(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const pattern = /(?:^|\n{2,})([\s\S]*?)(?=\n{2,}|$)/g;
  for (const match of source.matchAll(pattern)) {
    const captured = match[1] ?? "";
    const leading = captured.match(/^\s*/)?.[0].length ?? 0;
    const value = captured.trim();
    if (!value) continue;
    blocks.push({
      value,
      rawStart: (match.index ?? 0) + match[0].indexOf(captured) + leading,
    });
  }
  return blocks;
}

function isHeading(block: string): boolean {
  return /^#{1,6}\s+/.test(block);
}

function inlineSource(block: string): { value: string; rawOffset: number } {
  const heading = block.match(/^#{1,6}\s+/)?.[0];
  if (heading) return { value: block.slice(heading.length), rawOffset: heading.length };
  return { value: block, rawOffset: 0 };
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

function candidateContext(
  match: SemanticLinkTextMatch,
  spans: MarkdownInlineTextSpan[],
  links: MarkdownInlineLinkNode[],
): CandidateContext | null {
  const overlapping = spans.filter(
    (span) =>
      match.visibleStart < span.visibleEnd && match.visibleEnd > span.visibleStart,
  );
  const first = overlapping[0];
  const last = overlapping.at(-1);
  if (!first || !last) return null;
  const link =
    links.find(
      (candidate) =>
        match.visibleStart >= candidate.visibleStart &&
        match.visibleEnd <= candidate.visibleEnd,
    ) ?? null;
  return {
    match,
    spans: overlapping,
    rawStart: rawOffsetForVisiblePosition(first, match.visibleStart),
    rawEnd: rawOffsetForVisiblePosition(last, match.visibleEnd, true),
    link,
  };
}

function lineAndColumn(source: string, rawOffset: number): { line: number; column: number } {
  const before = source.slice(0, rawOffset);
  const lines = before.split("\n");
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

function compactContext(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function contextAround(
  visible: string,
  start: number,
  end: number,
): { contextBefore: string; contextAfter: string } {
  return {
    contextBefore: compactContext(visible.slice(Math.max(0, start - 100), start)),
    contextAfter: compactContext(visible.slice(end, Math.min(visible.length, end + 100))),
  };
}

function isStructuralLabel(
  block: string,
  visible: string,
  match: SemanticLinkTextMatch,
): boolean {
  const stripped = block
    .replace(/^#{1,6}\s+/, "")
    .replace(/[*_`]/g, "")
    .replace(/[.:;!?]+$/g, "")
    .trim();
  return (
    stripped.localeCompare(match.text, undefined, { sensitivity: "accent" }) === 0 ||
    (visible.trim().length === match.text.length && stripped === visible.trim())
  );
}

function targetTitleSignal(target: SemanticLinkCandidateTarget, text: string): boolean {
  const normalizedTarget = target.title.toLocaleLowerCase();
  const normalizedText = text.toLocaleLowerCase();
  return normalizedTarget === normalizedText;
}

function confidenceFor(
  context: CandidateContext,
  visible: string,
  target: SemanticLinkCandidateTarget,
): { confidence: SemanticLinkConfidence; signals: string[] } {
  const signals: string[] = [];
  const emphasized = context.spans.some(
    (span) =>
      span.ancestors.includes("strong") || span.ancestors.includes("emphasis"),
  );
  if (emphasized) signals.push("emphasized-label");
  if (targetTitleSignal(target, context.match.text)) {
    signals.push("target-title-label");
  }
  const nearby = visible.slice(
    Math.max(0, context.match.visibleStart - 48),
    Math.min(visible.length, context.match.visibleEnd + 48),
  );
  if (structuralCue.test(nearby)) signals.push("structural-cue");
  if (/^\p{Lu}/u.test(context.match.text)) signals.push("title-case-label");
  if (signals.includes("emphasized-label") || signals.includes("target-title-label")) {
    return { confidence: "high", signals };
  }
  if (signals.includes("structural-cue") || signals.includes("title-case-label")) {
    return { confidence: "medium", signals };
  }
  return {
    confidence: "low",
    signals: ["ordinary-language-risk"],
  };
}

function establishedOccurrence(
  registry: SemanticLinkRegistry,
  concept: SemanticLinkConceptDefinition,
  section: SemanticLinkAuditSection,
  paragraphAnchor: string,
  matchText: string,
  matchOrdinal: number,
): SemanticLinkOccurrence | undefined {
  return registry.occurrences.find(
    (occurrence) =>
      occurrence.conceptId === concept.conceptId &&
      occurrence.source.editorialId === section.editorialId &&
      section.continuityIds.includes(occurrence.source.sectionContinuityId) &&
      occurrence.source.paragraphAnchor === paragraphAnchor &&
      occurrence.source.matchText === matchText &&
      occurrence.source.matchOrdinal === matchOrdinal,
  );
}

function occurrenceDisposition(
  occurrence: SemanticLinkOccurrence | undefined,
): Pick<SemanticLinkCandidate, "disposition" | "exclusionReason"> | null {
  if (occurrence?.decision === "link") {
    return { disposition: "approved-link", exclusionReason: null };
  }
  if (occurrence?.decision === "exclude") {
    return {
      disposition: "reviewed-exclusion",
      exclusionReason: "reviewed-exclusion",
    };
  }
  return null;
}

function exclusionFor(
  block: string,
  visible: string,
  context: CandidateContext,
  section: SemanticLinkAuditSection,
  target: SemanticLinkCandidateTarget,
): { reason: string; existingHref: string | null } | null {
  if (isHeading(block)) return { reason: "heading", existingHref: null };
  if (context.spans.some((span) => span.ancestors.includes("code"))) {
    return { reason: "inline-code", existingHref: null };
  }
  if (context.link) {
    return { reason: "existing-link", existingHref: context.link.destination };
  }
  if (isStructuralLabel(block, visible, context.match)) {
    return { reason: "structural-label", existingHref: null };
  }
  if (section.currentRouteHrefs.includes(target.href)) {
    return { reason: "same-target", existingHref: null };
  }
  return null;
}

function candidateSortKey(candidate: SemanticLinkCandidate): string {
  return [
    candidate.source.sourcePath,
    String(candidate.source.line).padStart(9, "0"),
    String(candidate.source.column).padStart(9, "0"),
    candidate.conceptId,
    candidate.candidateId,
  ].join("\0");
}

function corpusFingerprint(sections: SemanticLinkAuditSection[]): string {
  return sha256(
    JSON.stringify(
      sections
        .map((section) => ({
          editorialId: section.editorialId,
          sourcePath: section.sourcePath,
          sourceHash: section.sourceHash,
          currentSectionId: section.currentSectionId,
          continuityIds: [...section.continuityIds].sort(),
          body: section.body,
        }))
        .sort((left, right) =>
          `${left.sourcePath}\0${left.currentSectionId}`.localeCompare(
            `${right.sourcePath}\0${right.currentSectionId}`,
          ),
        ),
    ),
  );
}

export function auditSemanticLinks({
  registry,
  suggestedConcepts = [],
  conceptIds,
  sections,
  targetsByConceptId,
}: SemanticLinkAuditInput): SemanticLinkAuditReport {
  const candidates: SemanticLinkCandidate[] = [];
  const selectedSections = [...sections].sort((left, right) =>
    `${left.sourcePath}\0${left.currentSectionId}`.localeCompare(
      `${right.sourcePath}\0${right.currentSectionId}`,
    ),
  );

  for (const section of selectedSections) {
    const concepts = [
      ...registry.concepts,
      ...suggestedConcepts,
    ].filter(
      (concept) =>
        concept.sourceEditorialIds.includes(section.editorialId) &&
        (!conceptIds || conceptIds.includes(concept.conceptId)),
    );
    if (concepts.length === 0) continue;
    const blocks = markdownBlocks(section.body);
    const fingerprints = paragraphFingerprints(section.body);

    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
      const block = blocks[blockIndex]!;
      const paragraphAnchor = fingerprints[blockIndex]?.anchor;
      if (!paragraphAnchor) {
        throw new Error(
          `${section.sourcePath}:${section.currentSectionId}: paragraph fingerprints do not match Markdown blocks.`,
        );
      }
      const inline = inlineSource(block.value);
      const nodes = parseInlineMarkdown(inline.value);
      const spans = inlineTextSpans(nodes);
      const links: MarkdownInlineLinkNode[] = [];
      visitInlineMarkdown(nodes, (node) => {
        if (node.type === "link") links.push(node);
      });
      const visible = inlineMarkdownVisibleText(nodes);

      for (const concept of concepts) {
        const target = targetsByConceptId.get(concept.conceptId);
        if (!target) {
          throw new Error(
            `Semantic link concept '${concept.conceptId}' has no resolved target.`,
          );
        }
        const matches = semanticLinkTextMatches(concept.labels, visible);
        const eligibleOrdinals = new Map<string, number>();
        const excludedOrdinals = new Map<string, number>();
        for (const match of matches) {
          const context = candidateContext(match, spans, links);
          if (!context) continue;
          const ordinalKey = match.ordinalKey;
          const eligibleForCompilation =
            !context.link &&
            !context.spans.some((span) => span.ancestors.includes("code"));
          const ordinals = eligibleForCompilation
            ? eligibleOrdinals
            : excludedOrdinals;
          const matchOrdinal = (ordinals.get(ordinalKey) ?? 0) + 1;
          ordinals.set(ordinalKey, matchOrdinal);
          const established = establishedOccurrence(
            registry,
            concept,
            section,
            paragraphAnchor,
            match.text,
            matchOrdinal,
          );
          const sectionContinuityId =
            established?.source.sectionContinuityId ?? section.continuityIds[0];
          if (!sectionContinuityId) {
            throw new Error(
              `${section.sourcePath}:${section.currentSectionId}: section has no continuity identity.`,
            );
          }
          const source = {
            editorialId: section.editorialId,
            sectionContinuityId,
            paragraphAnchor,
            matchText: match.text,
            matchOrdinal,
          };
          const blockRawOffset = block.rawStart + inline.rawOffset + context.rawStart;
          const candidateId = established?.occurrenceId ??
            (eligibleForCompilation
              ? semanticLinkOccurrenceId(concept.conceptId, source)
              : `semantic-link-excluded-${sha256(JSON.stringify([
                  concept.conceptId,
                  source,
                  blockRawOffset,
                ])).slice(0, 16)}`);
          const local = lineAndColumn(section.body, blockRawOffset);
          const sourceLine = section.sourceLineNumbers[local.line - 1];
          if (!sourceLine) {
            throw new Error(
              `${section.sourcePath}:${section.currentSectionId}: no canonical source line maps to generated body line ${local.line}.`,
            );
          }
          const sourceLocation = {
            ...source,
            sourcePath: section.sourcePath,
            sourceHash: section.sourceHash,
            currentSectionId: section.currentSectionId,
            sectionTitle: section.sectionTitle,
            line: sourceLine,
            column: local.column,
            ...contextAround(visible, match.visibleStart, match.visibleEnd),
          };
          const reviewed = occurrenceDisposition(established);
          const excluded = exclusionFor(
            block.value,
            visible,
            context,
            section,
            target,
          );
          const { confidence, signals } = confidenceFor(context, visible, target);
          const reviewedDisposition = reviewed?.disposition;
          const invalidApprovedLink =
            reviewedDisposition === "approved-link" && Boolean(excluded);
          candidates.push({
            candidateId,
            conceptId: concept.conceptId,
            confidence,
            signals,
            disposition: invalidApprovedLink
              ? "excluded"
              : reviewedDisposition ?? (excluded ? "excluded" : "candidate"),
            exclusionReason:
              invalidApprovedLink
                ? excluded?.reason ?? "invalid-approved-context"
                : reviewed?.exclusionReason ?? excluded?.reason ?? null,
            existingHref: excluded?.existingHref ?? null,
            suggestedConcept:
              "approval" in concept ? null : { ...concept },
            source: sourceLocation,
            target,
          });
        }
      }
    }
  }

  candidates.sort((left, right) =>
    candidateSortKey(left).localeCompare(candidateSortKey(right)),
  );
  const byExclusionReason: Record<string, number> = {};
  for (const candidate of candidates) {
    if (!candidate.exclusionReason) continue;
    byExclusionReason[candidate.exclusionReason] =
      (byExclusionReason[candidate.exclusionReason] ?? 0) + 1;
  }
  const byConfidence: Record<SemanticLinkConfidence, number> = {
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const candidate of candidates) {
    byConfidence[candidate.confidence] += 1;
  }
  return {
    schemaVersion: 1,
    registrySha256: semanticLinkRegistrySha256(registry),
    corpusSha256: corpusFingerprint(sections),
    counts: {
      matches: candidates.length,
      candidates: candidates.filter((item) => item.disposition === "candidate").length,
      approvedLinks: candidates.filter(
        (item) => item.disposition === "approved-link",
      ).length,
      reviewedExclusions: candidates.filter(
        (item) => item.disposition === "reviewed-exclusion",
      ).length,
      excluded: candidates.filter((item) => item.disposition === "excluded").length,
      byConfidence,
      byExclusionReason: Object.fromEntries(
        Object.entries(byExclusionReason).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
    },
    candidates,
  };
}

function sectionOwner(
  catalog: CompiledCatalog,
  continuityId: string,
): (typeof catalog.sections)[number] {
  const owners = catalog.sections.filter((section) =>
    [section.continuityId, ...section.legacyContinuityIds].includes(continuityId),
  );
  if (owners.length !== 1) {
    throw new Error(
      `Continuity identity '${continuityId}' has ${owners.length.toLocaleString()} current section owners.`,
    );
  }
  return owners[0]!;
}

export function targetForSemanticLinkConcept(
  catalog: CompiledCatalog,
  concept: SemanticLinkConceptDefinition,
): SemanticLinkCandidateTarget {
  const section = sectionOwner(catalog, concept.targetContinuityId);
  const volume = catalog.volumes.find((item) => item.volumeId === section.volumeId);
  const part = volume?.parts.find((item) => item.partId === section.partId);
  const chapter = part?.chapters.find((item) => item.chapterId === section.chapterId);
  if (!volume || !part || !chapter) {
    throw new Error(
      `Could not resolve the ${concept.routeLevel} route for semantic link concept '${concept.conceptId}'.`,
    );
  }
  if (concept.routeLevel === "volume") {
    return {
      continuityId: concept.targetContinuityId,
      currentSectionId: section.sectionId,
      title: volume.title,
      href: volume.href,
      routeLevel: concept.routeLevel,
    };
  }
  if (concept.routeLevel === "part") {
    return {
      continuityId: concept.targetContinuityId,
      currentSectionId: section.sectionId,
      title: part.title,
      href: part.href,
      routeLevel: concept.routeLevel,
    };
  }
  if (concept.routeLevel === "chapter") {
    return {
      continuityId: concept.targetContinuityId,
      currentSectionId: section.sectionId,
      title: chapter.title,
      href: chapter.href,
      routeLevel: concept.routeLevel,
    };
  }
  return {
    continuityId: concept.targetContinuityId,
    currentSectionId: section.sectionId,
    title: section.title,
    href: section.readerHref,
    routeLevel: concept.routeLevel,
  };
}

function titleIsDistinctive(title: string): boolean {
  const words = title.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (title.trim().length < 12) return false;
  if (words.length >= 3) return true;
  if (words.length !== 2) return false;
  return !/^(?:a|an|its|our|that|the|their|this|what|why|how)\b/i.test(
    title.trim(),
  );
}

export function suggestedSectionTitleConcepts(
  catalog: CompiledCatalog,
  registry: SemanticLinkRegistry,
  sourceEditorialIds: string[],
): SemanticLinkSuggestedConcept[] {
  const sectionsByTitle = new Map<string, typeof catalog.sections>();
  for (const section of catalog.sections) {
    if (!titleIsDistinctive(section.title)) continue;
    const key = section.title.trim().toLocaleLowerCase();
    const sections = sectionsByTitle.get(key) ?? [];
    sections.push(section);
    sectionsByTitle.set(key, sections);
  }
  const registeredTargets = new Set(
    registry.concepts.map((concept) => concept.targetContinuityId),
  );
  const registeredConceptIds = new Set(
    registry.concepts.map((concept) => concept.conceptId),
  );

  return [...sectionsByTitle.values()]
    .filter((sections) => sections.length === 1)
    .map((sections) => sections[0]!)
    .filter(
      (section) =>
        ![section.continuityId, ...section.legacyContinuityIds].some(
          (continuityId) => registeredTargets.has(continuityId),
        ),
    )
    .map((section) => ({
      conceptId: `section-title-${section.continuityId}`,
      routeLevel: "section" as const,
      labels: [
        {
          text: section.title,
          caseSensitive: false,
          wholeWord: true,
        },
      ],
      sourceEditorialIds: [...sourceEditorialIds],
      targetContinuityId: section.continuityId,
    }))
    .filter((concept) => !registeredConceptIds.has(concept.conceptId))
    .sort((left, right) => left.conceptId.localeCompare(right.conceptId));
}

export function loadSemanticLinkAuditInput(
  registry = readSemanticLinkRegistry(),
): SemanticLinkAuditInput {
  // Candidate recovery must remain available when a reviewed source locator has
  // gone stale. The normal catalog path still applies semantic references and
  // fails closed, while the advisory audit reads the same imported hierarchy
  // before link enrichment.
  const catalog = buildCatalog(undefined, { semanticReferences: "omit" });
  const documents = readMarkdownDocuments();
  const configs = readVolumeConfigs();
  const editorialIdByVolumeId = new Map(
    configs.map((config) => [config.volumeId, config.editorialId]),
  );
  const suggestedConcepts = suggestedSectionTitleConcepts(
    catalog,
    registry,
    configs.map((config) => config.editorialId),
  );
  const catalogBySectionId = new Map(
    catalog.sections.map((section) => [section.sectionId, section]),
  );
  const sections = documents.flatMap((document): SemanticLinkAuditSection[] => {
    const section = catalogBySectionId.get(document.frontmatter.sectionId);
    if (!section) return [];
    const volume = catalog.volumes.find(
      (candidate) => candidate.volumeId === section.volumeId,
    );
    const part = volume?.parts.find(
      (candidate) => candidate.partId === section.partId,
    );
    if (!volume || !part) {
      throw new Error(
        `${document.relativePath}: section '${section.sectionId}' has no current hierarchy.`,
      );
    }
    const editorialId = editorialIdByVolumeId.get(document.frontmatter.volumeId);
    if (!editorialId) {
      throw new Error(
        `${document.relativePath}: volume '${document.frontmatter.volumeId}' has no editorial identity.`,
      );
    }
    const sourcePath = document.frontmatter.sourceDoc;
    const sourceHash = document.frontmatter.sourceHash;
    if (!sourcePath || !sourceHash) {
      throw new Error(
        `${document.relativePath}: generated section is missing source identity. Run npm run manuscripts:prepare.`,
      );
    }
    return [{
      editorialId,
      sourcePath,
      sourceHash,
      currentSectionId: section.sectionId,
      currentRouteHrefs: [
        section.readerHref,
        section.chapterHref,
        part.href,
        volume.href,
      ],
      continuityIds: [section.continuityId, ...section.legacyContinuityIds],
      sectionTitle: section.title,
      body: document.body,
      sourceLineNumbers: document.frontmatter.sourceLineNumbers ?? [],
    }];
  });
  return {
    registry,
    suggestedConcepts,
    sections,
    targetsByConceptId: new Map(
      [...registry.concepts, ...suggestedConcepts].map((concept) => [
        concept.conceptId,
        targetForSemanticLinkConcept(catalog, concept),
      ]),
    ),
  };
}

function escapeTable(value: string): string {
  return value.replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

export function formatSemanticLinkAuditReport(
  report: SemanticLinkAuditReport,
): string {
  const lines = [
    "# Semantic Link Candidate Report",
    "",
    "This report is advisory. It does not approve or modify canonical editorial state.",
    "",
    `Matches: ${report.counts.matches.toLocaleString()}. Candidates: ${report.counts.candidates.toLocaleString()}. Approved links: ${report.counts.approvedLinks.toLocaleString()}. Reviewed exclusions: ${report.counts.reviewedExclusions.toLocaleString()}. Automatic exclusions: ${report.counts.excluded.toLocaleString()}.`,
    "",
    "| Candidate | Concept | Confidence | Disposition | Source | Context | Target |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const candidate of report.candidates) {
    const context = `${candidate.source.contextBefore} **${candidate.source.matchText}** ${candidate.source.contextAfter}`;
    lines.push(
      `| \`${candidate.candidateId}\` | ${escapeTable(candidate.conceptId)} | ${candidate.confidence} | ${escapeTable(candidate.disposition)}${candidate.exclusionReason ? `: ${escapeTable(candidate.exclusionReason)}` : ""} | ${escapeTable(candidate.source.sourcePath)}:${candidate.source.line}:${candidate.source.column} | ${escapeTable(context)} | [${escapeTable(candidate.target.title)}](${candidate.target.href}) |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function checkedOutputDirectory(outputDirectory: string): string {
  const resolved = path.resolve(repoRoot, outputDirectory);
  const relative = path.relative(semanticLinkReportsRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(
      `Semantic link reports must stay under ${path.relative(repoRoot, semanticLinkReportsRoot)}.`,
    );
  }
  return resolved;
}

export function writeSemanticLinkAuditReport(
  report: SemanticLinkAuditReport,
  outputDirectory = semanticLinkReportsRoot,
): { jsonPath: string; markdownPath: string } {
  const directory = checkedOutputDirectory(outputDirectory);
  fs.mkdirSync(directory, { recursive: true });
  const jsonPath = path.join(directory, "candidates.json");
  const markdownPath = path.join(directory, "candidates.md");
  writeJson(jsonPath, report);
  writeUtf8(markdownPath, formatSemanticLinkAuditReport(report));
  return { jsonPath, markdownPath };
}

function optionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

export function parseSemanticLinkAuditArgs(
  args: string[],
): SemanticLinkAuditCliOptions {
  const options: SemanticLinkAuditCliOptions = {
    volumes: [],
    concepts: [],
    outputDirectory: semanticLinkReportsRoot,
    stdout: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "--volume") {
      options.volumes.push(optionValue(args, index, arg));
      index += 1;
    } else if (arg === "--concept") {
      options.concepts.push(optionValue(args, index, arg));
      index += 1;
    } else if (arg === "--output") {
      options.outputDirectory = optionValue(args, index, arg);
      index += 1;
    } else if (arg === "--stdout") {
      options.stdout = true;
    } else {
      throw new Error(`Unknown semantic link audit option '${arg}'.`);
    }
  }
  return options;
}

export function runSemanticLinkAuditCli(args = process.argv.slice(2)): number {
  try {
    const options = parseSemanticLinkAuditArgs(args);
    const input = loadSemanticLinkAuditInput();
    if (options.concepts.length > 0) {
      const selected = new Set(options.concepts);
      const allConcepts = [
        ...input.registry.concepts,
        ...(input.suggestedConcepts ?? []),
      ];
      const unknown = [...selected].filter(
        (conceptId) =>
          !allConcepts.some((concept) => concept.conceptId === conceptId),
      );
      if (unknown.length > 0) {
        throw new Error(`Unknown semantic link concept(s): ${unknown.join(", ")}.`);
      }
      input.conceptIds = [...selected].sort();
    }
    if (options.volumes.length > 0) {
      const selected = new Set(options.volumes);
      input.sections = input.sections.filter((section) =>
        selected.has(section.editorialId),
      );
    }
    const report = auditSemanticLinks(input);
    if (options.stdout) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      const output = writeSemanticLinkAuditReport(
        report,
        options.outputDirectory,
      );
      console.log(
        `Semantic link audit found ${report.counts.candidates.toLocaleString()} advisory candidate(s).`,
      );
      console.log(`JSON: ${path.relative(repoRoot, output.jsonPath)}`);
      console.log(`Markdown: ${path.relative(repoRoot, output.markdownPath)}`);
    }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = runSemanticLinkAuditCli();
}
