import crypto from "node:crypto";
import fs from "node:fs";
import { semanticLinksPath } from "../repository/paths";

export type SemanticLinkRouteLevel =
  | "section"
  | "chapter"
  | "part"
  | "volume";

export type SemanticLinkLabel = {
  text: string;
  caseSensitive: boolean;
  wholeWord: boolean;
};

export type SemanticLinkApproval = {
  state: "approved";
  date: string;
  rationale: string;
};

export type SemanticLinkConceptDefinition = {
  conceptId: string;
  routeLevel: SemanticLinkRouteLevel;
  labels: SemanticLinkLabel[];
  sourceEditorialIds: string[];
  targetContinuityId: string;
};

export type SemanticLinkConcept = SemanticLinkConceptDefinition & {
  approval: SemanticLinkApproval;
};

export type SemanticLinkSuggestedConcept = SemanticLinkConceptDefinition;

export type SemanticLinkOccurrenceSource = {
  editorialId: string;
  sectionContinuityId: string;
  paragraphAnchor: string;
  matchText: string;
  matchOrdinal: number;
};

export type SemanticLinkOccurrence = {
  occurrenceId: string;
  conceptId: string;
  source: SemanticLinkOccurrenceSource;
  decision: "link" | "exclude";
  approval: SemanticLinkApproval;
};

export type SemanticLinkRegistry = {
  schemaVersion: 1;
  concepts: SemanticLinkConcept[];
  occurrences: SemanticLinkOccurrence[];
};

export type SemanticLinkConfidence = "high" | "medium" | "low";

export type SemanticLinkCandidateDisposition =
  | "candidate"
  | "approved-link"
  | "reviewed-exclusion"
  | "excluded";

export type SemanticLinkTextMatch = {
  label: SemanticLinkLabel;
  text: string;
  visibleStart: number;
  visibleEnd: number;
  ordinalKey: string;
};

export type SemanticLinkCandidateSource = SemanticLinkOccurrenceSource & {
  sourcePath: string;
  sourceHash: string;
  currentSectionId: string;
  sectionTitle: string;
  line: number;
  column: number;
  contextBefore: string;
  contextAfter: string;
};

export type SemanticLinkCandidateTarget = {
  continuityId: string;
  currentSectionId: string;
  title: string;
  href: string;
  routeLevel: SemanticLinkRouteLevel;
};

export type SemanticLinkCandidate = {
  candidateId: string;
  conceptId: string;
  confidence: SemanticLinkConfidence;
  signals: string[];
  disposition: SemanticLinkCandidateDisposition;
  exclusionReason: string | null;
  existingHref: string | null;
  suggestedConcept: SemanticLinkSuggestedConcept | null;
  source: SemanticLinkCandidateSource;
  target: SemanticLinkCandidateTarget;
};

export type SemanticLinkAuditReport = {
  schemaVersion: 1;
  registrySha256: string;
  corpusSha256: string;
  counts: {
    matches: number;
    candidates: number;
    approvedLinks: number;
    reviewedExclusions: number;
    excluded: number;
    byConfidence: Record<SemanticLinkConfidence, number>;
    byExclusionReason: Record<string, number>;
  };
  candidates: SemanticLinkCandidate[];
};

export type SemanticLinkReviewDecision = {
  candidateId: string;
  decision: "link" | "exclude";
  rationale: string;
};

export type SemanticLinkReview = {
  schemaVersion: 1;
  reportSha256: string;
  date: string;
  decisions: SemanticLinkReviewDecision[];
};

const routeLevels = new Set<SemanticLinkRouteLevel>([
  "section",
  "chapter",
  "part",
  "volume",
]);
const semanticLinkWordCharacter = /[\p{L}\p{N}_]/u;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function objectValue(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!isObject(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function exactFields(
  value: Record<string, unknown>,
  fields: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  const missing = expected.filter((field) => !actual.includes(field));
  const extra = actual.filter((field) => !expected.includes(field));
  if (missing.length === 0 && extra.length === 0) return;
  const details = [
    missing.length > 0 ? `missing ${missing.join(", ")}` : "",
    extra.length > 0 ? `unexpected ${extra.join(", ")}` : "",
  ].filter(Boolean);
  throw new Error(`${label} fields are invalid (${details.join("; ")}).`);
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a nonempty string.`);
  }
  return value.trim();
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value as number;
}

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value);
}

function slugValue(value: unknown, label: string): string {
  const result = stringValue(value, label);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result)) {
    throw new Error(`${label} must be a lowercase slug.`);
  }
  return result;
}

function editorialIdValue(value: unknown, label: string): string {
  const result = stringValue(value, label);
  if (!/^volume-\d{2}$/.test(result)) {
    throw new Error(`${label} must use the volume-01 form.`);
  }
  return result;
}

function approvalValue(value: unknown, label: string): SemanticLinkApproval {
  const approval = objectValue(value, label);
  exactFields(approval, ["state", "date", "rationale"], label);
  if (approval.state !== "approved") {
    throw new Error(`${label}.state must be approved.`);
  }
  const date = stringValue(approval.date, `${label}.date`);
  if (!validIsoDate(date)) {
    throw new Error(`${label}.date must be a real ISO date.`);
  }
  return {
    state: "approved",
    date,
    rationale: stringValue(approval.rationale, `${label}.rationale`),
  };
}

function labelValue(value: unknown, label: string): SemanticLinkLabel {
  const record = objectValue(value, label);
  exactFields(record, ["text", "caseSensitive", "wholeWord"], label);
  return {
    text: stringValue(record.text, `${label}.text`),
    caseSensitive: booleanValue(
      record.caseSensitive,
      `${label}.caseSensitive`,
    ),
    wholeWord: booleanValue(record.wholeWord, `${label}.wholeWord`),
  };
}

function occurrenceSourceValue(
  value: unknown,
  label: string,
): SemanticLinkOccurrenceSource {
  const source = objectValue(value, label);
  exactFields(
    source,
    [
      "editorialId",
      "sectionContinuityId",
      "paragraphAnchor",
      "matchText",
      "matchOrdinal",
    ],
    label,
  );
  const paragraphAnchor = stringValue(
    source.paragraphAnchor,
    `${label}.paragraphAnchor`,
  );
  if (!/^p-h[0-9a-f]{16}(?:-\d+)?$/.test(paragraphAnchor)) {
    throw new Error(
      `${label}.paragraphAnchor must use the generated p-h fingerprint form.`,
    );
  }
  return {
    editorialId: editorialIdValue(
      source.editorialId,
      `${label}.editorialId`,
    ),
    sectionContinuityId: slugValue(
      source.sectionContinuityId,
      `${label}.sectionContinuityId`,
    ),
    paragraphAnchor,
    matchText: stringValue(source.matchText, `${label}.matchText`),
    matchOrdinal: positiveInteger(
      source.matchOrdinal,
      `${label}.matchOrdinal`,
    ),
  };
}

export function semanticLinkOccurrenceId(
  conceptId: string,
  source: SemanticLinkOccurrenceSource,
): string {
  const identity = JSON.stringify([
    conceptId,
    source.editorialId,
    source.sectionContinuityId,
    source.paragraphAnchor,
    source.matchText,
    source.matchOrdinal,
  ]);
  return `semantic-link-${crypto.createHash("sha256").update(identity).digest("hex").slice(0, 16)}`;
}

export function semanticLinkRegistrySha256(
  registry: SemanticLinkRegistry,
): string {
  return crypto
    .createHash("sha256")
    .update(`${JSON.stringify(registry, null, 2)}\n`)
    .digest("hex");
}

export function semanticLinkAuditReportSha256(
  report: SemanticLinkAuditReport,
): string {
  return crypto
    .createHash("sha256")
    .update(`${JSON.stringify(report, null, 2)}\n`)
    .digest("hex");
}

export function semanticLinkLabelMatches(
  label: SemanticLinkLabel,
  text: string,
): boolean {
  return label.caseSensitive
    ? label.text === text
    : label.text.toLocaleLowerCase() === text.toLocaleLowerCase();
}

export function semanticLinkMatchOrdinalKey(
  label: SemanticLinkLabel,
  text: string,
): string {
  return label.caseSensitive ? text : text.toLocaleLowerCase();
}

export function semanticLinkTextMatches(
  labels: readonly SemanticLinkLabel[],
  text: string,
): SemanticLinkTextMatch[] {
  const matches: SemanticLinkTextMatch[] = [];
  for (const label of labels) {
    if (label.text.length === 0 || label.text.length > text.length) continue;
    for (let start = 0; start <= text.length - label.text.length; start += 1) {
      const candidate = text.slice(start, start + label.text.length);
      if (!semanticLinkLabelMatches(label, candidate)) continue;
      if (label.wholeWord) {
        const before = text[start - 1] ?? "";
        const after = text[start + label.text.length] ?? "";
        if (
          (before && semanticLinkWordCharacter.test(before)) ||
          (after && semanticLinkWordCharacter.test(after))
        ) {
          continue;
        }
      }
      matches.push({
        label,
        text: candidate,
        visibleStart: start,
        visibleEnd: start + candidate.length,
        ordinalKey: semanticLinkMatchOrdinalKey(label, candidate),
      });
    }
  }

  matches.sort(
    (left, right) =>
      left.visibleStart - right.visibleStart ||
      right.text.length - left.text.length ||
      left.text.localeCompare(right.text),
  );
  const selected: SemanticLinkTextMatch[] = [];
  for (const match of matches) {
    if (
      selected.some(
        (existing) =>
          match.visibleStart < existing.visibleEnd &&
          match.visibleEnd > existing.visibleStart,
      )
    ) {
      continue;
    }
    selected.push(match);
  }
  return selected.sort(
    (left, right) => left.visibleStart - right.visibleStart,
  );
}

export function conceptMatchesText(
  concept: SemanticLinkConceptDefinition,
  text: string,
): boolean {
  return concept.labels.some((label) => semanticLinkLabelMatches(label, text));
}

export function validateSemanticLinkRegistryShape(
  input: unknown,
): SemanticLinkRegistry {
  const registry = objectValue(input, "semantic link registry");
  exactFields(
    registry,
    ["schemaVersion", "concepts", "occurrences"],
    "semantic link registry",
  );
  if (registry.schemaVersion !== 1) {
    throw new Error("semantic link registry schemaVersion must be 1.");
  }
  if (!Array.isArray(registry.concepts)) {
    throw new Error("semantic link registry concepts must be an array.");
  }
  if (!Array.isArray(registry.occurrences)) {
    throw new Error("semantic link registry occurrences must be an array.");
  }

  const concepts = registry.concepts.map((value, index): SemanticLinkConcept => {
    const label = `semantic link registry concepts[${index}]`;
    const concept = objectValue(value, label);
    exactFields(
      concept,
      [
        "conceptId",
        "routeLevel",
        "labels",
        "sourceEditorialIds",
        "targetContinuityId",
        "approval",
      ],
      label,
    );
    const conceptId = slugValue(concept.conceptId, `${label}.conceptId`);
    if (!routeLevels.has(concept.routeLevel as SemanticLinkRouteLevel)) {
      throw new Error(
        `${label}.routeLevel must be section, chapter, part, or volume.`,
      );
    }
    if (!Array.isArray(concept.labels) || concept.labels.length === 0) {
      throw new Error(`${label}.labels must be a nonempty array.`);
    }
    const labels = concept.labels.map((entry, labelIndex) =>
      labelValue(entry, `${label}.labels[${labelIndex}]`),
    );
    const labelKeys = labels.map((entry) =>
      JSON.stringify([
        entry.caseSensitive ? entry.text : entry.text.toLocaleLowerCase(),
        entry.caseSensitive,
        entry.wholeWord,
      ]),
    );
    if (new Set(labelKeys).size !== labelKeys.length) {
      throw new Error(`${label}.labels contains a duplicate.`);
    }
    if (
      !Array.isArray(concept.sourceEditorialIds) ||
      concept.sourceEditorialIds.length === 0
    ) {
      throw new Error(`${label}.sourceEditorialIds must be a nonempty array.`);
    }
    const sourceEditorialIds = concept.sourceEditorialIds.map(
      (entry, sourceIndex) =>
        editorialIdValue(entry, `${label}.sourceEditorialIds[${sourceIndex}]`),
    );
    if (new Set(sourceEditorialIds).size !== sourceEditorialIds.length) {
      throw new Error(`${label}.sourceEditorialIds contains a duplicate.`);
    }
    return {
      conceptId,
      routeLevel: concept.routeLevel as SemanticLinkRouteLevel,
      labels,
      sourceEditorialIds,
      targetContinuityId: slugValue(
        concept.targetContinuityId,
        `${label}.targetContinuityId`,
      ),
      approval: approvalValue(concept.approval, `${label}.approval`),
    };
  });

  const conceptsById = new Map<string, SemanticLinkConcept>();
  for (const concept of concepts) {
    if (conceptsById.has(concept.conceptId)) {
      throw new Error(`Duplicate semantic link concept '${concept.conceptId}'.`);
    }
    conceptsById.set(concept.conceptId, concept);
  }

  const occurrences = registry.occurrences.map(
    (value, index): SemanticLinkOccurrence => {
      const label = `semantic link registry occurrences[${index}]`;
      const occurrence = objectValue(value, label);
      exactFields(
        occurrence,
        ["occurrenceId", "conceptId", "source", "decision", "approval"],
        label,
      );
      const conceptId = slugValue(occurrence.conceptId, `${label}.conceptId`);
      const concept = conceptsById.get(conceptId);
      if (!concept) {
        throw new Error(`${label} references unknown concept '${conceptId}'.`);
      }
      const source = occurrenceSourceValue(occurrence.source, `${label}.source`);
      if (!concept.sourceEditorialIds.includes(source.editorialId)) {
        throw new Error(
          `${label}.source.editorialId is outside concept '${conceptId}' scope.`,
        );
      }
      if (!conceptMatchesText(concept, source.matchText)) {
        throw new Error(
          `${label}.source.matchText does not match a label for concept '${conceptId}'.`,
        );
      }
      if (occurrence.decision !== "link" && occurrence.decision !== "exclude") {
        throw new Error(`${label}.decision must be link or exclude.`);
      }
      const occurrenceId = stringValue(
        occurrence.occurrenceId,
        `${label}.occurrenceId`,
      );
      const expectedId = semanticLinkOccurrenceId(conceptId, source);
      if (occurrenceId !== expectedId) {
        throw new Error(`${label}.occurrenceId must be '${expectedId}'.`);
      }
      return {
        occurrenceId,
        conceptId,
        source,
        decision: occurrence.decision,
        approval: approvalValue(occurrence.approval, `${label}.approval`),
      };
    },
  );

  const occurrenceIds = new Set<string>();
  const linkedLocators = new Map<string, string>();
  for (const occurrence of occurrences) {
    if (occurrenceIds.has(occurrence.occurrenceId)) {
      throw new Error(
        `Duplicate semantic link occurrence '${occurrence.occurrenceId}'.`,
      );
    }
    occurrenceIds.add(occurrence.occurrenceId);
    if (occurrence.decision !== "link") continue;
    const locator = JSON.stringify(Object.values(occurrence.source));
    const existing = linkedLocators.get(locator);
    if (existing && existing !== occurrence.conceptId) {
      throw new Error(
        `Semantic link source '${occurrence.source.paragraphAnchor}' is approved for both '${existing}' and '${occurrence.conceptId}'.`,
      );
    }
    linkedLocators.set(locator, occurrence.conceptId);
  }

  return { schemaVersion: 1, concepts, occurrences };
}

export function readSemanticLinkRegistry(
  filePath = semanticLinksPath,
): SemanticLinkRegistry {
  let input: unknown;
  try {
    input = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${filePath}: could not read semantic link registry (${reason}).`);
  }
  try {
    return validateSemanticLinkRegistryShape(input);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${filePath}: ${reason}`);
  }
}
