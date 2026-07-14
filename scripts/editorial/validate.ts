import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  loadSentenceSections,
  parseSentenceLedger,
  validateSentenceLedger,
  validateSentenceLedgerCoverage,
  validateSentenceLedgerCurrent,
  type BaselineSentenceSection,
  type SentenceLedgerRecord,
} from "./sentence-ledger";
import {
  extractStructureUnits,
  parseStructureLedger,
  validateStructureLedger,
  type StructureLedgerRecord,
} from "./structure-ledger";
import {
  editorialReviewsRoot,
  editorialVolumesRoot,
  isCanonicalManuscriptPath,
  normalizeRepoPath,
  repoRoot,
  volumeManifestPaths,
  volumePackageDirectories,
  type VolumePathManifest,
} from "../repository/paths";

export const expectedVolumePackageCount = 9;
export const expectedEditorialLedgerRecordCount = 12_179;

export const requiredVoiceCardSections = [
  "Identity",
  "Register",
  "Cadence",
  "Language",
  "Images and structure",
  "Controls",
  "Approval",
] as const;

export type ApprovalState = "pending" | "approved";

export type VolumeManifest = VolumePathManifest & {
  title: string;
  subtitle: string;
  order: number;
  numberLabel: string;
  planet: string;
  coverImage: string;
  coverAlt: string;
  import: {
    startMarkers: string[];
  };
};

export type ReviewSourceIdentity = {
  commit: string;
  path: string;
  sha256: string;
  snapshotPath?: string;
};

export type ReviewedSourceIdentity = Omit<
  ReviewSourceIdentity,
  "commit" | "snapshotPath"
> & {
  commit: string | null;
};

export type ReviewEvidence = {
  path: string;
  sha256: string;
};

export type ReviewManifest = {
  schemaVersion: 1;
  batchId: string;
  editorialId: string;
  approvalState: ApprovalState;
  standing: "current" | "historical" | "superseded";
  scope: {
    coverage: "complete-volume";
    sentenceRecords: number;
    structureRecords: number;
  };
  validationState: "pending" | "validated";
  openQueryCount: number;
  residualRisk: "low" | "medium" | "high" | "unassessed";
  publicationState: "unpublished" | "published";
  baseline: ReviewSourceIdentity;
  reviewed: ReviewedSourceIdentity;
  canonicalSourcePath: string;
  evidence: ReviewEvidence[];
};

export type RevisionFileReader = (
  commit: string,
  filePath: string,
  root: string,
) => Buffer;

export type SentenceSectionsLoader = (
  ref: string,
  sourceFiles: string[],
) => BaselineSentenceSection[];

export type EditorialValidationOptions = {
  root?: string;
  volumesRoot?: string;
  reviewsRoot?: string;
  expectedLedgerRecordCount?: number;
  readRevisionFile?: RevisionFileReader;
  loadSections?: SentenceSectionsLoader;
};

export type EditorialValidationReport = {
  volumePackageCount: number;
  reviewBatchCount: number;
  pendingVoiceCardCount: number;
  approvedVoiceCardCount: number;
  pendingReviewBatchCount: number;
  approvedReviewBatchCount: number;
  sentenceRecordCount: number;
  structureRecordCount: number;
  totalLedgerRecordCount: number;
};

type ParsedVolumePackage = {
  directory: string;
  manifestPath: string;
  manifest: VolumeManifest;
  voiceCardApprovalState: ApprovalState;
};

type ReviewValidationContext = {
  manifestPath: string;
  manifest: ReviewManifest;
  volume: ParsedVolumePackage;
  sentenceFile: string;
  structureFile: string;
  sentenceRecords: SentenceLedgerRecord[];
  structureRecords: StructureLedgerRecord[];
  baselineSource: string;
  reviewedSource: string;
};

const volumeManifestFields = [
  "schemaVersion",
  "editorialId",
  "volumeId",
  "title",
  "subtitle",
  "order",
  "numberLabel",
  "planet",
  "coverImage",
  "coverAlt",
  "sourcePath",
  "voiceCardPath",
  "historicalSourcePaths",
  "import",
] as const;

const reviewManifestFields = [
  "schemaVersion",
  "batchId",
  "editorialId",
  "approvalState",
  "standing",
  "scope",
  "validationState",
  "openQueryCount",
  "residualRisk",
  "publicationState",
  "baseline",
  "reviewed",
  "canonicalSourcePath",
  "evidence",
] as const;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function relativePath(root: string, filePath: string): string {
  return normalizeRepoPath(path.relative(root, filePath));
}

function displayPath(root: string, filePath: string): string {
  const relative = relativePath(root, filePath);
  return relative.startsWith("../") ? filePath : relative;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireObject(
  value: unknown,
  label: string,
  file: string,
): Record<string, unknown> {
  if (!isObject(value)) throw new Error(`${file}: ${label} must be an object.`);
  return value;
}

function requireExactFields(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
  file: string,
): void {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  const missing = required.filter((field) => !actual.includes(field));
  const extra = actual.filter((field) => !required.includes(field));
  if (missing.length === 0 && extra.length === 0) return;
  const details = [
    missing.length > 0 ? `missing ${missing.join(", ")}` : "",
    extra.length > 0 ? `unexpected ${extra.join(", ")}` : "",
  ].filter(Boolean);
  throw new Error(`${file}: ${label} fields are invalid (${details.join("; ")}).`);
}

function requireString(
  value: unknown,
  label: string,
  file: string,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${file}: ${label} must be a nonempty string.`);
  }
  return value;
}

function requireNonnegativeInteger(
  value: unknown,
  label: string,
  file: string,
): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${file}: ${label} must be a nonnegative integer.`);
  }
  return value as number;
}

function requireSha256(value: unknown, label: string, file: string): string {
  const hash = requireString(value, label, file);
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error(`${file}: ${label} must be a lowercase SHA-256 hash.`);
  }
  return hash;
}

function requireCommit(value: unknown, label: string, file: string): string {
  const commit = requireString(value, label, file);
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commit)) {
    throw new Error(`${file}: ${label} must be a full lowercase commit hash.`);
  }
  return commit;
}

function requireRepoPath(value: unknown, label: string, file: string): string {
  const filePath = requireString(value, label, file);
  const segments = filePath.split("/");
  if (
    path.posix.isAbsolute(filePath) ||
    filePath.includes("\\") ||
    filePath.includes("\0") ||
    normalizeRepoPath(filePath) !== filePath ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`${file}: ${label} must be a normalized repository-relative path.`);
  }
  return filePath;
}

function readJsonObject(filePath: string, root: string): Record<string, unknown> {
  const display = displayPath(root, filePath);
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${display}: invalid JSON (${message}).`);
  }
  return requireObject(value, "document", display);
}

function requireFile(filePath: string, root: string, label: string): void {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(filePath);
  } catch {
    throw new Error(`${displayPath(root, filePath)}: missing ${label}.`);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`${displayPath(root, filePath)}: ${label} must be a regular file.`);
  }
}

function approvalStateFromVoiceCard(
  source: string,
  file: string,
): ApprovalState {
  const headings = [...source.matchAll(/^## ([^\r\n]+)\s*$/gm)].map(
    (match) => ({ title: match[1]!.trim(), index: match.index ?? 0 }),
  );
  for (const required of requiredVoiceCardSections) {
    const matches = headings.filter((heading) => heading.title === required);
    if (matches.length !== 1) {
      throw new Error(`${file}: voice card needs exactly one '${required}' section.`);
    }
    const headingIndex = headings.findIndex((heading) => heading.title === required);
    const start = matches[0]!.index + `## ${required}`.length;
    const end = headings[headingIndex + 1]?.index ?? source.length;
    if (source.slice(start, end).trim() === "") {
      throw new Error(`${file}: voice card section '${required}' is empty.`);
    }
  }
  const positions = requiredVoiceCardSections.map((required) =>
    headings.findIndex((heading) => heading.title === required),
  );
  if (positions.some((position, index) => index > 0 && position <= positions[index - 1]!)) {
    throw new Error(`${file}: voice card sections are out of order.`);
  }

  const approvalHeading = headings.find((heading) => heading.title === "Approval")!;
  const approvalIndex = headings.findIndex((heading) => heading.title === "Approval");
  const approvalEnd = headings[approvalIndex + 1]?.index ?? source.length;
  const approvalSource = source.slice(approvalHeading.index, approvalEnd);
  const states = [...approvalSource.matchAll(/^- Author approved:\s*(.+?)\s*$/gim)].map(
    (match) => match[1]!.trim().toLowerCase(),
  );
  if (states.length !== 1) {
    throw new Error(`${file}: voice card needs exactly one Author approved value.`);
  }
  if (states[0]!.startsWith("pending")) return "pending";
  if (states[0]!.startsWith("approved")) return "approved";
  throw new Error(`${file}: Author approved must begin with pending or approved.`);
}

function parseVolumePackage(
  directory: string,
  manifestPath: string,
  root: string,
): ParsedVolumePackage {
  const display = displayPath(root, manifestPath);
  const raw = readJsonObject(manifestPath, root);
  requireExactFields(raw, volumeManifestFields, "volume manifest", display);
  if (raw.schemaVersion !== 1) {
    throw new Error(`${display}: schemaVersion must be 1.`);
  }

  const directoryName = path.basename(directory);
  const expectedOrder = Number(directoryName.slice("volume-".length));
  const editorialId = requireString(raw.editorialId, "editorialId", display);
  if (editorialId !== directoryName) {
    throw new Error(`${display}: editorialId must match package '${directoryName}'.`);
  }
  const volumeId = requireString(raw.volumeId, "volumeId", display);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(volumeId)) {
    throw new Error(`${display}: volumeId must be a lowercase slug.`);
  }
  const order = raw.order;
  if (!Number.isInteger(order) || order !== expectedOrder) {
    throw new Error(`${display}: order must be ${expectedOrder}.`);
  }
  for (const field of [
    "title",
    "subtitle",
    "numberLabel",
    "planet",
    "coverImage",
    "coverAlt",
  ] as const) {
    requireString(raw[field], field, display);
  }

  const packagePath = relativePath(root, directory);
  const sourcePath = requireRepoPath(raw.sourcePath, "sourcePath", display);
  const voiceCardPath = requireRepoPath(raw.voiceCardPath, "voiceCardPath", display);
  if (sourcePath !== `${packagePath}/manuscript.md` || !isCanonicalManuscriptPath(sourcePath)) {
    throw new Error(`${display}: sourcePath must name the adjacent manuscript.md.`);
  }
  if (voiceCardPath !== `${packagePath}/voice-card.md`) {
    throw new Error(`${display}: voiceCardPath must name the adjacent voice-card.md.`);
  }
  const historicalSourcePaths = raw.historicalSourcePaths;
  if (
    !Array.isArray(historicalSourcePaths) ||
    historicalSourcePaths.length === 0 ||
    historicalSourcePaths.some((entry) => typeof entry !== "string")
  ) {
    throw new Error(`${display}: historicalSourcePaths must be a nonempty string array.`);
  }
  const normalizedHistoricalPaths = historicalSourcePaths.map((entry, index) =>
    requireRepoPath(entry, `historicalSourcePaths[${index}]`, display),
  );
  if (new Set(normalizedHistoricalPaths).size !== normalizedHistoricalPaths.length) {
    throw new Error(`${display}: historicalSourcePaths contains a duplicate.`);
  }
  if (normalizedHistoricalPaths.includes(sourcePath)) {
    throw new Error(`${display}: current sourcePath cannot also be historical.`);
  }

  const importConfig = requireObject(raw.import, "import", display);
  requireExactFields(importConfig, ["startMarkers"], "import", display);
  if (
    !Array.isArray(importConfig.startMarkers) ||
    importConfig.startMarkers.length === 0 ||
    importConfig.startMarkers.some(
      (marker) => typeof marker !== "string" || marker.trim() === "",
    )
  ) {
    throw new Error(`${display}: import.startMarkers must be a nonempty string array.`);
  }
  if (new Set(importConfig.startMarkers).size !== importConfig.startMarkers.length) {
    throw new Error(`${display}: import.startMarkers contains a duplicate.`);
  }

  const manuscriptFile = path.join(root, sourcePath);
  const voiceCardFile = path.join(root, voiceCardPath);
  requireFile(manuscriptFile, root, "canonical manuscript");
  requireFile(voiceCardFile, root, "voice card");
  const voiceCardApprovalState = approvalStateFromVoiceCard(
    fs.readFileSync(voiceCardFile, "utf8"),
    voiceCardPath,
  );

  return {
    directory,
    manifestPath,
    manifest: {
      schemaVersion: 1,
      editorialId,
      volumeId,
      title: raw.title as string,
      subtitle: raw.subtitle as string,
      order,
      numberLabel: raw.numberLabel as string,
      planet: raw.planet as string,
      coverImage: raw.coverImage as string,
      coverAlt: raw.coverAlt as string,
      sourcePath,
      voiceCardPath,
      historicalSourcePaths: normalizedHistoricalPaths,
      import: { startMarkers: importConfig.startMarkers as string[] },
    },
    voiceCardApprovalState,
  };
}

function parseSourceIdentity(
  value: unknown,
  label: "baseline" | "reviewed",
  file: string,
): ReviewSourceIdentity | ReviewedSourceIdentity {
  const identity = requireObject(value, label, file);
  const hasSnapshot = label === "baseline" && identity.snapshotPath !== undefined;
  requireExactFields(
    identity,
    hasSnapshot
      ? ["commit", "path", "sha256", "snapshotPath"]
      : ["commit", "path", "sha256"],
    label,
    file,
  );
  const commit =
    label === "reviewed" && identity.commit === null
      ? null
      : requireCommit(identity.commit, `${label}.commit`, file);
  const parsed = {
    commit,
    path: requireRepoPath(identity.path, `${label}.path`, file),
    sha256: requireSha256(identity.sha256, `${label}.sha256`, file),
  } as ReviewSourceIdentity | ReviewedSourceIdentity;
  if (hasSnapshot) {
    (parsed as ReviewSourceIdentity).snapshotPath = requireRepoPath(
      identity.snapshotPath,
      "baseline.snapshotPath",
      file,
    );
  }
  return parsed;
}

function parseReviewManifest(filePath: string, root: string): ReviewManifest {
  const display = displayPath(root, filePath);
  const raw = readJsonObject(filePath, root);
  requireExactFields(raw, reviewManifestFields, "review manifest", display);
  if (raw.schemaVersion !== 1) {
    throw new Error(`${display}: schemaVersion must be 1.`);
  }
  const batchId = requireString(raw.batchId, "batchId", display);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(batchId)) {
    throw new Error(`${display}: batchId must be a lowercase slug.`);
  }
  const editorialId = requireString(raw.editorialId, "editorialId", display);
  if (!/^volume-\d{2}$/.test(editorialId)) {
    throw new Error(`${display}: editorialId must use the volume-01 form.`);
  }
  if (raw.approvalState !== "pending" && raw.approvalState !== "approved") {
    throw new Error(`${display}: approvalState must be pending or approved.`);
  }
  if (
    raw.standing !== "current" &&
    raw.standing !== "historical" &&
    raw.standing !== "superseded"
  ) {
    throw new Error(
      `${display}: standing must be current, historical, or superseded.`,
    );
  }
  const scope = requireObject(raw.scope, "scope", display);
  requireExactFields(
    scope,
    ["coverage", "sentenceRecords", "structureRecords"],
    "scope",
    display,
  );
  if (scope.coverage !== "complete-volume") {
    throw new Error(`${display}: scope.coverage must be complete-volume.`);
  }
  const parsedScope = {
    coverage: "complete-volume" as const,
    sentenceRecords: requireNonnegativeInteger(
      scope.sentenceRecords,
      "scope.sentenceRecords",
      display,
    ),
    structureRecords: requireNonnegativeInteger(
      scope.structureRecords,
      "scope.structureRecords",
      display,
    ),
  };
  if (raw.validationState !== "pending" && raw.validationState !== "validated") {
    throw new Error(`${display}: validationState must be pending or validated.`);
  }
  const openQueryCount = requireNonnegativeInteger(
    raw.openQueryCount,
    "openQueryCount",
    display,
  );
  if (
    raw.residualRisk !== "low" &&
    raw.residualRisk !== "medium" &&
    raw.residualRisk !== "high" &&
    raw.residualRisk !== "unassessed"
  ) {
    throw new Error(
      `${display}: residualRisk must be low, medium, high, or unassessed.`,
    );
  }
  if (
    raw.publicationState !== "unpublished" &&
    raw.publicationState !== "published"
  ) {
    throw new Error(
      `${display}: publicationState must be unpublished or published.`,
    );
  }
  if (raw.publicationState === "published" && raw.approvalState !== "approved") {
    throw new Error(
      `${display}: published review evidence requires author approval.`,
    );
  }
  if (!Array.isArray(raw.evidence) || raw.evidence.length === 0) {
    throw new Error(`${display}: evidence must be a nonempty array.`);
  }
  const evidence = raw.evidence.map((entry, index) => {
    const record = requireObject(entry, `evidence[${index}]`, display);
    requireExactFields(record, ["path", "sha256"], `evidence[${index}]`, display);
    const evidencePath = requireRepoPath(
      record.path,
      `evidence[${index}].path`,
      display,
    );
    if (path.posix.basename(evidencePath) === "review.json") {
      throw new Error(`${display}: review.json cannot list itself as evidence.`);
    }
    return {
      path: evidencePath,
      sha256: requireSha256(
        record.sha256,
        `evidence[${index}].sha256`,
        display,
      ),
    };
  });
  if (new Set(evidence.map((entry) => entry.path)).size !== evidence.length) {
    throw new Error(`${display}: evidence contains a duplicate path.`);
  }
  return {
    schemaVersion: 1,
    batchId,
    editorialId,
    approvalState: raw.approvalState,
    standing: raw.standing,
    scope: parsedScope,
    validationState: raw.validationState,
    openQueryCount,
    residualRisk: raw.residualRisk,
    publicationState: raw.publicationState,
    baseline: parseSourceIdentity(raw.baseline, "baseline", display) as ReviewSourceIdentity,
    reviewed: parseSourceIdentity(raw.reviewed, "reviewed", display) as ReviewedSourceIdentity,
    canonicalSourcePath: requireRepoPath(
      raw.canonicalSourcePath,
      "canonicalSourcePath",
      display,
    ),
    evidence,
  };
}

function listEvidenceFiles(batchDirectory: string): string[] {
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      const relative = normalizeRepoPath(path.relative(batchDirectory, entryPath));
      if (entry.isSymbolicLink()) {
        throw new Error(`${relative}: review evidence cannot be a symbolic link.`);
      }
      if (entry.isDirectory()) walk(entryPath);
      else if (entry.isFile() && relative !== "review.json") files.push(relative);
      else if (!entry.isFile()) {
        throw new Error(`${relative}: review evidence must be a regular file.`);
      }
    }
  };
  walk(batchDirectory);
  return files.sort();
}

function defaultRevisionReader(
  commit: string,
  filePath: string,
  root: string,
): Buffer {
  try {
    return execFileSync("git", ["show", `${commit}:${filePath}`], {
      cwd: root,
      maxBuffer: 128 * 1024 * 1024,
    });
  } catch {
    throw new Error(`${filePath}: cannot read baseline at commit ${commit}.`);
  }
}

function validateFileHash(
  content: string | Buffer,
  expected: string,
  label: string,
): void {
  const actual = sha256(content);
  if (actual !== expected) {
    throw new Error(`${label}: SHA-256 mismatch, expected ${expected}, found ${actual}.`);
  }
}

function validateStructureBaseline(
  records: StructureLedgerRecord[],
  baselineSource: string,
  baselineHash: string,
  file: string,
): void {
  if (records.length === 0) throw new Error(`${file}: structure ledger is empty.`);
  const units = extractStructureUnits(baselineSource);
  if (records.length !== units.length) {
    throw new Error(
      `${file}: structure ledger covers ${records.length.toLocaleString()} of ${units.length.toLocaleString()} baseline units.`,
    );
  }
  const recordsByOrdinal = new Map<number, StructureLedgerRecord>();
  for (const [index, record] of records.entries()) {
    if (record.sourceHash !== baselineHash) {
      throw new Error(`${file}:${index + 1}: sourceHash does not match review baseline.`);
    }
    if (recordsByOrdinal.has(record.unitOrdinal)) {
      throw new Error(`${file}:${index + 1}: duplicate structure unit address.`);
    }
    recordsByOrdinal.set(record.unitOrdinal, record);
  }
  for (const unit of units) {
    const record = recordsByOrdinal.get(unit.unitOrdinal);
    if (!record) {
      throw new Error(`${file}: baseline structure unit ${unit.unitOrdinal} is missing.`);
    }
    if (record.unitType !== unit.unitType || record.originalText !== unit.text) {
      throw new Error(`${file}: baseline structure unit ${unit.unitOrdinal} does not match.`);
    }
    if (record.originalHash !== sha256(unit.text).slice(0, 16)) {
      throw new Error(`${file}: baseline structure unit ${unit.unitOrdinal} has the wrong hash.`);
    }
  }
}

function validateLedgerSourcePaths(
  context: ReviewValidationContext,
  lineage: Map<string, ParsedVolumePackage>,
): void {
  const validate = (sourceFile: string, location: string) => {
    const resolved = lineage.get(normalizeRepoPath(sourceFile));
    if (!resolved) {
      throw new Error(`${location}: sourceFile '${sourceFile}' has no volume manifest lineage.`);
    }
    if (resolved.manifest.editorialId !== context.manifest.editorialId) {
      throw new Error(`${location}: sourceFile '${sourceFile}' resolves to another volume.`);
    }
  };
  context.sentenceRecords.forEach((record, index) =>
    validate(record.sourceFile, `${context.sentenceFile}:${index + 1}`),
  );
  context.structureRecords.forEach((record, index) => {
    validate(record.sourceFile, `${context.structureFile}:${index + 1}`);
    record.resultLocations.forEach((location) =>
      validate(location.sourceFile, `${context.structureFile}:${index + 1}`),
    );
  });
}

function validateLedgerBaselineHashes(context: ReviewValidationContext): void {
  const expected = context.manifest.baseline.sha256;
  context.sentenceRecords.forEach((record, index) => {
    if (record.sourceHash !== expected) {
      throw new Error(
        `${context.sentenceFile}:${index + 1}: sourceHash does not match review baseline.`,
      );
    }
  });
  context.structureRecords.forEach((record, index) => {
    if (record.sourceHash !== expected) {
      throw new Error(
        `${context.structureFile}:${index + 1}: sourceHash does not match review baseline.`,
      );
    }
  });
}

function relevantSections(
  sections: BaselineSentenceSection[],
  volume: ParsedVolumePackage,
  lineage: Map<string, ParsedVolumePackage>,
): BaselineSentenceSection[] {
  return sections.filter(
    (section) =>
      lineage.get(normalizeRepoPath(section.sourceFile))?.manifest.editorialId ===
      volume.manifest.editorialId,
  );
}

function validateBaselineSentenceCoverage(
  context: ReviewValidationContext,
  lineage: Map<string, ParsedVolumePackage>,
  loadSections: SentenceSectionsLoader,
): void {
  const sections = relevantSections(
    loadSections(context.manifest.baseline.commit, [context.manifest.baseline.path]),
    context.volume,
    lineage,
  );
  if (sections.length === 0) {
    throw new Error(`${context.sentenceFile}: baseline source has no sentence sections.`);
  }
  validateSentenceLedgerCoverage(
    context.sentenceRecords,
    sections,
    context.sentenceFile,
    { requiredSectionIds: sections.map((section) => section.sectionId) },
  );
}

function validateApprovedReconstruction(
  context: ReviewValidationContext,
  lineage: Map<string, ParsedVolumePackage>,
  loadSections: SentenceSectionsLoader,
): void {
  validateSentenceLedger(context.sentenceRecords, context.sentenceFile, {
    requireApproved: true,
  });
  const reviewedRef = context.manifest.reviewed.commit ?? "WORKTREE";
  const currentSections = relevantSections(
    loadSections(reviewedRef, [context.manifest.reviewed.path]),
    context.volume,
    lineage,
  );
  if (currentSections.length === 0) {
    throw new Error(`${context.sentenceFile}: reviewed source has no sentence sections.`);
  }
  validateSentenceLedgerCurrent(
    context.sentenceRecords,
    currentSections,
    currentSections.map((section) => section.sectionId),
    context.sentenceFile,
  );
  const sourceFiles = new Set(context.structureRecords.map((record) => record.sourceFile));
  if (sourceFiles.size !== 1) {
    throw new Error(`${context.structureFile}: approved batch must bind one sourceFile.`);
  }
  validateStructureLedger(
    context.structureRecords,
    [...sourceFiles][0]!,
    context.baselineSource,
    context.reviewedSource,
    { requireApproved: true },
    context.structureFile,
  );
}

function reviewBatchDirectories(volumeReviewRoot: string): string[] {
  return fs
    .readdirSync(volumeReviewRoot, { withFileTypes: true })
    .map((entry) => {
      if (!entry.isDirectory()) {
        throw new Error(`${path.join(volumeReviewRoot, entry.name)}: review batch must be a directory.`);
      }
      return path.join(volumeReviewRoot, entry.name);
    })
    .sort();
}

export function validateEditorialRepository(
  options: EditorialValidationOptions = {},
): EditorialValidationReport {
  const root = options.root ?? repoRoot;
  const volumesRoot = options.volumesRoot ?? editorialVolumesRoot;
  const reviewsRoot = options.reviewsRoot ?? editorialReviewsRoot;
  const expectedRecords =
    options.expectedLedgerRecordCount ?? expectedEditorialLedgerRecordCount;
  const readRevisionFile = options.readRevisionFile ?? defaultRevisionReader;
  const loadSections = options.loadSections ?? loadSentenceSections;

  const expectedDirectoryNames = Array.from(
    { length: expectedVolumePackageCount },
    (_, index) => `volume-${String(index + 1).padStart(2, "0")}`,
  );
  const allVolumeDirectories = fs
    .readdirSync(volumesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (JSON.stringify(allVolumeDirectories) !== JSON.stringify(expectedDirectoryNames)) {
    throw new Error(
      `${displayPath(root, volumesRoot)}: expected exactly ${expectedDirectoryNames.join(", ")}.`,
    );
  }
  const packageDirectories = volumePackageDirectories(volumesRoot);
  const manifestPaths = volumeManifestPaths(volumesRoot);
  if (
    packageDirectories.length !== expectedVolumePackageCount ||
    manifestPaths.length !== expectedVolumePackageCount
  ) {
    throw new Error(
      `${displayPath(root, volumesRoot)}: expected exactly ${expectedVolumePackageCount} stable volume packages.`,
    );
  }
  const packages = packageDirectories.map((directory, index) =>
    parseVolumePackage(directory, manifestPaths[index]!, root),
  );

  const editorialIds = new Set<string>();
  const volumeIds = new Set<string>();
  const orders = new Set<number>();
  const lineage = new Map<string, ParsedVolumePackage>();
  for (const volume of packages) {
    const manifest = volume.manifest;
    if (editorialIds.has(manifest.editorialId)) {
      throw new Error(`${manifest.editorialId}: duplicate editorialId.`);
    }
    if (volumeIds.has(manifest.volumeId)) {
      throw new Error(`${manifest.volumeId}: duplicate volumeId.`);
    }
    if (orders.has(manifest.order)) {
      throw new Error(`${manifest.order}: duplicate volume order.`);
    }
    editorialIds.add(manifest.editorialId);
    volumeIds.add(manifest.volumeId);
    orders.add(manifest.order);
    for (const sourcePath of [manifest.sourcePath, ...manifest.historicalSourcePaths]) {
      const normalized = normalizeRepoPath(sourcePath);
      const existing = lineage.get(normalized);
      if (existing) {
        throw new Error(
          `${sourcePath}: source path lineage is shared by ${existing.manifest.editorialId} and ${manifest.editorialId}.`,
        );
      }
      lineage.set(normalized, volume);
    }
  }

  const reviewVolumesRoot = path.join(reviewsRoot, "volumes");
  if (!fs.existsSync(reviewVolumesRoot)) {
    throw new Error(`${displayPath(root, reviewVolumesRoot)}: review volume root is missing.`);
  }
  const reviewVolumeNames = fs
    .readdirSync(reviewVolumesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (JSON.stringify(reviewVolumeNames) !== JSON.stringify(expectedDirectoryNames)) {
    throw new Error(
      `${displayPath(root, reviewVolumesRoot)}: review volume directories must match stable volume packages.`,
    );
  }

  let reviewBatchCount = 0;
  let pendingReviewBatchCount = 0;
  let approvedReviewBatchCount = 0;
  let sentenceRecordCount = 0;
  let structureRecordCount = 0;

  for (const volume of packages) {
    const volumeReviewRoot = path.join(reviewVolumesRoot, volume.manifest.editorialId);
    const batchDirectories = reviewBatchDirectories(volumeReviewRoot);
    if (batchDirectories.length === 0) {
      throw new Error(`${displayPath(root, volumeReviewRoot)}: volume needs a review batch.`);
    }
    for (const batchDirectory of batchDirectories) {
      const manifestPath = path.join(batchDirectory, "review.json");
      requireFile(manifestPath, root, "review.json manifest");
      const manifest = parseReviewManifest(manifestPath, root);
      const manifestDisplay = displayPath(root, manifestPath);
      if (manifest.editorialId !== volume.manifest.editorialId) {
        throw new Error(`${manifestDisplay}: editorialId does not match its review directory.`);
      }
      if (manifest.batchId !== path.basename(batchDirectory)) {
        throw new Error(`${manifestDisplay}: batchId does not match its review directory.`);
      }
      if (manifest.canonicalSourcePath !== volume.manifest.sourcePath) {
        throw new Error(`${manifestDisplay}: canonicalSourcePath does not match volume.json.`);
      }
      for (const [label, sourcePath] of [
        ["baseline.path", manifest.baseline.path],
        ["reviewed.path", manifest.reviewed.path],
        ["canonicalSourcePath", manifest.canonicalSourcePath],
      ] as const) {
        const resolved = lineage.get(normalizeRepoPath(sourcePath));
        if (!resolved || resolved.manifest.editorialId !== manifest.editorialId) {
          throw new Error(`${manifestDisplay}: ${label} does not resolve through its volume manifest.`);
        }
      }

      const actualEvidence = listEvidenceFiles(batchDirectory);
      const declaredEvidence = manifest.evidence.map((entry) => entry.path).sort();
      if (JSON.stringify(actualEvidence) !== JSON.stringify(declaredEvidence)) {
        throw new Error(
          `${manifestDisplay}: evidence must enumerate every batch file except review.json.`,
        );
      }
      for (const evidence of manifest.evidence) {
        const evidenceFile = path.resolve(batchDirectory, evidence.path);
        const relative = path.relative(batchDirectory, evidenceFile);
        if (relative.startsWith("..") || path.isAbsolute(relative)) {
          throw new Error(`${manifestDisplay}: evidence path escapes its batch.`);
        }
        requireFile(evidenceFile, root, "review evidence");
        validateFileHash(
          fs.readFileSync(evidenceFile),
          evidence.sha256,
          displayPath(root, evidenceFile),
        );
      }
      for (const requiredLedger of ["sentence-ledger.jsonl", "structure-ledger.jsonl"]) {
        if (!manifest.evidence.some((entry) => entry.path === requiredLedger)) {
          throw new Error(`${manifestDisplay}: evidence must include ${requiredLedger}.`);
        }
      }

      const baselineSnapshotPath = manifest.baseline.snapshotPath;
      if (
        baselineSnapshotPath &&
        !manifest.evidence.some((entry) => entry.path === baselineSnapshotPath)
      ) {
        throw new Error(
          `${manifestDisplay}: baseline.snapshotPath must be declared as evidence.`,
        );
      }

      let baselineBuffer: Buffer;
      if (baselineSnapshotPath) {
        const snapshotFile = path.resolve(batchDirectory, baselineSnapshotPath);
        const relative = path.relative(batchDirectory, snapshotFile);
        if (relative.startsWith("..") || path.isAbsolute(relative)) {
          throw new Error(`${manifestDisplay}: baseline snapshot escapes its batch.`);
        }
        baselineBuffer = fs.readFileSync(snapshotFile);
        let revisionBuffer: Buffer | null = null;
        try {
          revisionBuffer = readRevisionFile(
            manifest.baseline.commit,
            manifest.baseline.path,
            root,
          );
        } catch {
          revisionBuffer = null;
        }
        if (revisionBuffer && !revisionBuffer.equals(baselineBuffer)) {
          throw new Error(
            `${manifestDisplay}: baseline snapshot differs from ${manifest.baseline.path} at ${manifest.baseline.commit}.`,
          );
        }
      } else {
        baselineBuffer = readRevisionFile(
          manifest.baseline.commit,
          manifest.baseline.path,
          root,
        );
      }
      validateFileHash(
        baselineBuffer,
        manifest.baseline.sha256,
        `${manifest.baseline.path} at ${manifest.baseline.commit}`,
      );
      const reviewedBuffer =
        manifest.approvalState === "approved"
          ? manifest.reviewed.commit === null
            ? fs.readFileSync(path.join(root, volume.manifest.sourcePath))
            : readRevisionFile(manifest.reviewed.commit, manifest.reviewed.path, root)
          : null;
      if (reviewedBuffer) {
        validateFileHash(
          reviewedBuffer,
          manifest.reviewed.sha256,
          manifest.reviewed.commit === null
            ? manifest.reviewed.path
            : `${manifest.reviewed.path} at ${manifest.reviewed.commit}`,
        );
      }

      const sentenceFile = path.join(batchDirectory, "sentence-ledger.jsonl");
      const structureFile = path.join(batchDirectory, "structure-ledger.jsonl");
      const sentenceDisplay = displayPath(root, sentenceFile);
      const structureDisplay = displayPath(root, structureFile);
      const sentenceRecords = parseSentenceLedger(
        fs.readFileSync(sentenceFile, "utf8"),
        sentenceDisplay,
      );
      const structureRecords = parseStructureLedger(
        fs.readFileSync(structureFile, "utf8"),
        structureDisplay,
      );
      validateSentenceLedger(sentenceRecords, sentenceDisplay);
      if (
        manifest.scope.sentenceRecords !== sentenceRecords.length ||
        manifest.scope.structureRecords !== structureRecords.length
      ) {
        throw new Error(
          `${manifestDisplay}: scope record counts do not match the declared ledgers.`,
        );
      }
      const openQueryCount = [...sentenceRecords, ...structureRecords].filter(
        (record) => record.reviewStatus === "query",
      ).length;
      if (manifest.openQueryCount !== openQueryCount) {
        throw new Error(
          `${manifestDisplay}: openQueryCount does not match the declared ledgers.`,
        );
      }
      if (
        manifest.approvalState === "approved" &&
        (manifest.validationState !== "validated" || openQueryCount > 0)
      ) {
        throw new Error(
          `${manifestDisplay}: approved review evidence must be validated with no open queries.`,
        );
      }
      const context: ReviewValidationContext = {
        manifestPath: manifestDisplay,
        manifest,
        volume,
        sentenceFile: sentenceDisplay,
        structureFile: structureDisplay,
        sentenceRecords,
        structureRecords,
        baselineSource: baselineBuffer.toString("utf8"),
        reviewedSource: reviewedBuffer?.toString("utf8") ?? "",
      };
      validateLedgerSourcePaths(context, lineage);
      validateLedgerBaselineHashes(context);
      if (manifest.approvalState === "approved") {
        validateBaselineSentenceCoverage(context, lineage, loadSections);
        validateStructureBaseline(
          structureRecords,
          context.baselineSource,
          manifest.baseline.sha256,
          structureDisplay,
        );
        validateApprovedReconstruction(context, lineage, loadSections);
        approvedReviewBatchCount += 1;
      } else {
        pendingReviewBatchCount += 1;
      }
      sentenceRecordCount += sentenceRecords.length;
      structureRecordCount += structureRecords.length;
      reviewBatchCount += 1;
    }
  }

  const totalLedgerRecordCount = sentenceRecordCount + structureRecordCount;
  if (totalLedgerRecordCount !== expectedRecords) {
    throw new Error(
      `Editorial review ledgers contain ${totalLedgerRecordCount.toLocaleString()} records, expected ${expectedRecords.toLocaleString()}.`,
    );
  }
  const approvedVoiceCardCount = packages.filter(
    (volume) => volume.voiceCardApprovalState === "approved",
  ).length;
  const pendingVoiceCardCount = packages.length - approvedVoiceCardCount;
  return {
    volumePackageCount: packages.length,
    reviewBatchCount,
    pendingVoiceCardCount,
    approvedVoiceCardCount,
    pendingReviewBatchCount,
    approvedReviewBatchCount,
    sentenceRecordCount,
    structureRecordCount,
    totalLedgerRecordCount,
  };
}

export function runEditorialValidationCli(): number {
  try {
    const report = validateEditorialRepository();
    console.log(
      `Validated ${report.volumePackageCount.toLocaleString()} stable volume packages and ${report.reviewBatchCount.toLocaleString()} review batches.`,
    );
    console.log(
      `Validated ${report.sentenceRecordCount.toLocaleString()} sentence records and ${report.structureRecordCount.toLocaleString()} structure records, ${report.totalLedgerRecordCount.toLocaleString()} total.`,
    );
    console.log(
      `Voice cards: ${report.approvedVoiceCardCount.toLocaleString()} approved, ${report.pendingVoiceCardCount.toLocaleString()} pending. Review batches: ${report.approvedReviewBatchCount.toLocaleString()} approved, ${report.pendingReviewBatchCount.toLocaleString()} pending.`,
    );
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runEditorialValidationCli();
}
