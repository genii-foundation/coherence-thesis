import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileHash, repoRoot } from "../manuscripts/shared";
import {
  generatedSemanticLinksReportsRoot,
  semanticLinksPath,
} from "../repository/paths";
import {
  readSemanticLinkRegistry,
  semanticLinkAuditReportSha256,
  semanticLinkOccurrenceId,
  semanticLinkRegistrySha256,
  validateSemanticLinkRegistryShape,
  type SemanticLinkAuditReport,
  type SemanticLinkCandidate,
  type SemanticLinkRegistry,
  type SemanticLinkReview,
  type SemanticLinkReviewDecision,
} from "./semantic-links";

export type SemanticLinkReviewCliOptions = {
  reportPath: string;
  decisionsPath: string;
  write: boolean;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function nonemptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a nonempty string.`);
  }
  return value.trim();
}

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value);
}

function reviewDecision(
  value: unknown,
  index: number,
): SemanticLinkReviewDecision {
  const label = `semantic link review decisions[${index}]`;
  if (!isObject(value)) throw new Error(`${label} must be an object.`);
  exactFields(value, ["candidateId", "decision", "rationale"], label);
  if (value.decision !== "link" && value.decision !== "exclude") {
    throw new Error(`${label}.decision must be link or exclude.`);
  }
  return {
    candidateId: nonemptyString(value.candidateId, `${label}.candidateId`),
    decision: value.decision,
    rationale: nonemptyString(value.rationale, `${label}.rationale`),
  };
}

export function validateSemanticLinkReviewShape(input: unknown): SemanticLinkReview {
  if (!isObject(input)) throw new Error("semantic link review must be an object.");
  exactFields(
    input,
    ["schemaVersion", "reportSha256", "date", "decisions"],
    "semantic link review",
  );
  if (input.schemaVersion !== 1) {
    throw new Error("semantic link review schemaVersion must be 1.");
  }
  const reportSha256 = nonemptyString(
    input.reportSha256,
    "semantic link review reportSha256",
  );
  if (!/^[0-9a-f]{64}$/.test(reportSha256)) {
    throw new Error(
      "semantic link review reportSha256 must be a lowercase SHA-256 hash.",
    );
  }
  const date = nonemptyString(input.date, "semantic link review date");
  if (!validIsoDate(date)) {
    throw new Error("semantic link review date must be a real ISO date.");
  }
  if (!Array.isArray(input.decisions) || input.decisions.length === 0) {
    throw new Error("semantic link review decisions must be a nonempty array.");
  }
  const decisions = input.decisions.map(reviewDecision);
  if (new Set(decisions.map((decision) => decision.candidateId)).size !== decisions.length) {
    throw new Error("semantic link review repeats a candidate decision.");
  }
  return { schemaVersion: 1, reportSha256, date, decisions };
}

function reportCandidate(value: unknown, index: number): SemanticLinkCandidate {
  const label = `semantic link report candidates[${index}]`;
  if (!isObject(value)) throw new Error(`${label} must be an object.`);
  for (const field of [
    "candidateId",
    "conceptId",
    "confidence",
    "signals",
    "disposition",
    "exclusionReason",
    "existingHref",
    "suggestedConcept",
    "source",
    "target",
  ]) {
    if (!(field in value)) throw new Error(`${label} is missing ${field}.`);
  }
  if (!isObject(value.source)) throw new Error(`${label}.source must be an object.`);
  for (const field of [
    "editorialId",
    "sectionContinuityId",
    "paragraphAnchor",
    "matchText",
    "matchOrdinal",
  ]) {
    if (!(field in value.source)) throw new Error(`${label}.source is missing ${field}.`);
  }
  return value as SemanticLinkCandidate;
}

export function validateSemanticLinkAuditReportShape(
  input: unknown,
): SemanticLinkAuditReport {
  if (!isObject(input)) throw new Error("semantic link report must be an object.");
  for (const field of [
    "schemaVersion",
    "registrySha256",
    "corpusSha256",
    "counts",
    "candidates",
  ]) {
    if (!(field in input)) throw new Error(`semantic link report is missing ${field}.`);
  }
  if (input.schemaVersion !== 1) {
    throw new Error("semantic link report schemaVersion must be 1.");
  }
  if (!Array.isArray(input.candidates)) {
    throw new Error("semantic link report candidates must be an array.");
  }
  const candidates = input.candidates.map(reportCandidate);
  if (new Set(candidates.map((candidate) => candidate.candidateId)).size !== candidates.length) {
    throw new Error("semantic link report repeats a candidate ID.");
  }
  return { ...input, candidates } as SemanticLinkAuditReport;
}

export function assertSemanticLinkReportSourcesCurrent(
  report: SemanticLinkAuditReport,
  {
    root = repoRoot,
    hashFile = fileHash,
  }: {
    root?: string;
    hashFile?: (filePath: string) => string;
  } = {},
): void {
  const expectedByPath = new Map<string, string>();
  for (const candidate of report.candidates) {
    const sourcePath = candidate.source.sourcePath;
    const expectedHash = candidate.source.sourceHash;
    const previous = expectedByPath.get(sourcePath);
    if (previous && previous !== expectedHash) {
      throw new Error(
        `Semantic link report contains conflicting hashes for '${sourcePath}'.`,
      );
    }
    expectedByPath.set(sourcePath, expectedHash);
  }
  for (const [sourcePath, expectedHash] of expectedByPath) {
    const resolved = path.resolve(root, sourcePath);
    const relative = path.relative(root, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(
        `Semantic link report source '${sourcePath}' is outside the repository.`,
      );
    }
    const currentHash = hashFile(resolved);
    if (currentHash !== expectedHash) {
      throw new Error(
        `Semantic link report is stale for '${sourcePath}'. Run the audit again before reviewing.`,
      );
    }
  }
}

function candidateSource(candidate: SemanticLinkCandidate) {
  return {
    editorialId: candidate.source.editorialId,
    sectionContinuityId: candidate.source.sectionContinuityId,
    paragraphAnchor: candidate.source.paragraphAnchor,
    matchText: candidate.source.matchText,
    matchOrdinal: candidate.source.matchOrdinal,
  };
}

export function applySemanticLinkReview(
  registry: SemanticLinkRegistry,
  report: SemanticLinkAuditReport,
  review: SemanticLinkReview,
): SemanticLinkRegistry {
  const validatedRegistry = validateSemanticLinkRegistryShape(registry);
  const validatedReport = validateSemanticLinkAuditReportShape(report);
  const validatedReview = validateSemanticLinkReviewShape(review);
  if (validatedReport.registrySha256 !== semanticLinkRegistrySha256(validatedRegistry)) {
    throw new Error(
      "Semantic link report was generated from a different registry. Run the audit again.",
    );
  }
  const reportHash = semanticLinkAuditReportSha256(validatedReport);
  if (validatedReview.reportSha256 !== reportHash) {
    throw new Error(
      "Semantic link review does not match the candidate report SHA-256 hash.",
    );
  }

  const candidatesById = new Map(
    validatedReport.candidates.map((candidate) => [
      candidate.candidateId,
      candidate,
    ]),
  );
  const nextConcepts = [...validatedRegistry.concepts];
  const nextOccurrences = [...validatedRegistry.occurrences];
  for (const decision of validatedReview.decisions) {
    const candidate = candidatesById.get(decision.candidateId);
    if (!candidate) {
      throw new Error(
        `Semantic link review names unknown candidate '${decision.candidateId}'.`,
      );
    }
    if (candidate.disposition !== "candidate") {
      throw new Error(
        `Semantic link candidate '${candidate.candidateId}' is ${candidate.disposition} and cannot receive a new decision.`,
      );
    }
    let concept = nextConcepts.find(
      (item) => item.conceptId === candidate.conceptId,
    );
    if (!concept) {
      if (!candidate.suggestedConcept) {
        throw new Error(
          `Semantic link candidate '${candidate.candidateId}' references unknown concept '${candidate.conceptId}'.`,
        );
      }
      concept = {
        ...candidate.suggestedConcept,
        approval: {
          state: "approved",
          date: validatedReview.date,
          rationale:
            "This exact unique section title maps to its reviewed continuity identity for candidate evaluation.",
        },
      };
      nextConcepts.push(concept);
    }
    if (candidate.target.continuityId !== concept.targetContinuityId) {
      throw new Error(
        `Semantic link candidate '${candidate.candidateId}' no longer targets concept '${candidate.conceptId}'.`,
      );
    }
    const source = candidateSource(candidate);
    const occurrenceId = semanticLinkOccurrenceId(candidate.conceptId, source);
    if (occurrenceId !== candidate.candidateId) {
      throw new Error(
        `Semantic link candidate '${candidate.candidateId}' has a stale source identity.`,
      );
    }
    nextOccurrences.push({
      occurrenceId,
      conceptId: candidate.conceptId,
      source,
      decision: decision.decision,
      approval: {
        state: "approved",
        date: validatedReview.date,
        rationale: decision.rationale,
      },
    });
  }

  nextOccurrences.sort((left, right) =>
    left.occurrenceId.localeCompare(right.occurrenceId),
  );
  nextConcepts.sort((left, right) => left.conceptId.localeCompare(right.conceptId));
  return validateSemanticLinkRegistryShape({
    ...validatedRegistry,
    concepts: nextConcepts,
    occurrences: nextOccurrences,
  });
}

function readJson(filePath: string, label: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} '${filePath}' could not be read (${reason}).`);
  }
}

function checkedReportPath(filePath: string): string {
  const resolved = path.resolve(repoRoot, filePath);
  const relative = path.relative(generatedSemanticLinksReportsRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(
      `Semantic link review reports must come from ${path.relative(repoRoot, generatedSemanticLinksReportsRoot)}.`,
    );
  }
  return resolved;
}

function optionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

export function parseSemanticLinkReviewArgs(
  args: string[],
): SemanticLinkReviewCliOptions {
  let reportPath = "";
  let decisionsPath = "";
  let write = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "--report") {
      reportPath = optionValue(args, index, arg);
      index += 1;
    } else if (arg === "--decisions") {
      decisionsPath = optionValue(args, index, arg);
      index += 1;
    } else if (arg === "--write") {
      write = true;
    } else {
      throw new Error(`Unknown semantic link review option '${arg}'.`);
    }
  }
  if (!reportPath || !decisionsPath) {
    throw new Error(
      "Semantic link review requires --report <generated-report> and --decisions <review-file>.",
    );
  }
  return { reportPath, decisionsPath, write };
}

function writeRegistryAtomically(registry: SemanticLinkRegistry): void {
  const temporaryPath = `${semanticLinksPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(registry, null, 2)}\n`);
  try {
    fs.renameSync(temporaryPath, semanticLinksPath);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
}

export function runSemanticLinkReviewCli(args = process.argv.slice(2)): number {
  try {
    const options = parseSemanticLinkReviewArgs(args);
    const report = validateSemanticLinkAuditReportShape(
      readJson(checkedReportPath(options.reportPath), "Semantic link report"),
    );
    assertSemanticLinkReportSourcesCurrent(report);
    const review = validateSemanticLinkReviewShape(
      readJson(path.resolve(repoRoot, options.decisionsPath), "Semantic link review"),
    );
    const next = applySemanticLinkReview(
      readSemanticLinkRegistry(),
      report,
      review,
    );
    if (options.write) {
      writeRegistryAtomically(next);
      console.log(
        `Recorded ${review.decisions.length.toLocaleString()} reviewed semantic link decision(s).`,
      );
    } else {
      console.log(
        `Dry run: ${review.decisions.length.toLocaleString()} semantic link decision(s) are valid. Re-run with --write after reviewing the canonical diff.`,
      );
    }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = runSemanticLinkReviewCli();
}
