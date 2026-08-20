import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  nodeVersionFilePath,
  packageLockPath,
  packageManifestPath,
  publisherCandidatesRoot,
  repoRoot,
} from "./paths";

const PUBLISHER_REPOSITORY =
  "https://github.com/genii-foundation/publisher";
const PUBLISHER_PACKAGE_VERSION = "0.1.0-alpha.0";
const PUBLISHER_NODE_VERSION = "22.12.0";
const PUBLISHER_NPM_VERSION = "10.9.0";
const PUBLISHER_NODE_ENGINE = ">=22.12.0 <23";
const requiredProductionPins = Object.freeze({
  next: "16.3.1",
  react: "19.2.8",
  "react-dom": "19.2.8",
});
const requiredDevelopmentPins = Object.freeze({
  "@playwright/test": "1.61.1",
  "@types/node": "22.20.1",
  "@types/react": "19.2.17",
  "@types/react-dom": "19.2.3",
  "eslint-config-next": "16.3.1",
  sharp: "0.35.3",
  typescript: "5.9.3",
  "typescript-eslint": "8.55.0",
});
const requiredNextOverrides = Object.freeze({
  nanoid: "3.3.18",
  postcss: "8.5.24",
  sharp: "0.35.3",
});
const requiredLockVersions = Object.freeze({
  ...requiredProductionPins,
  ...requiredDevelopmentPins,
  nanoid: "3.3.18",
  postcss: "8.5.24",
  "eslint-visitor-keys": "4.2.1",
});
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;

const expectedPackages = Object.freeze([
  Object.freeze({
    name: "@genii-foundation/publisher-schema",
    archive: "genii-foundation-publisher-schema-0.1.0-alpha.0.tgz",
  }),
  Object.freeze({
    name: "@genii-foundation/publisher-content",
    archive: "genii-foundation-publisher-content-0.1.0-alpha.0.tgz",
  }),
  Object.freeze({
    name: "@genii-foundation/publisher-reader",
    archive: "genii-foundation-publisher-reader-0.1.0-alpha.0.tgz",
  }),
  Object.freeze({
    name: "@genii-foundation/publisher",
    archive: "genii-foundation-publisher-0.1.0-alpha.0.tgz",
  }),
  Object.freeze({
    name: "@genii-foundation/publisher-next",
    archive: "genii-foundation-publisher-next-0.1.0-alpha.0.tgz",
  }),
]);

const candidateKeys = Object.freeze([
  "nodeVersion",
  "npmVersion",
  "packages",
  "publisherCommit",
  "publisherRepository",
  "schemaVersion",
]);
const packageRecordKeys = Object.freeze([
  "archive",
  "byteSize",
  "name",
  "sha256",
  "version",
]);

export type PublisherCandidateIssueCode =
  | "archive-digest"
  | "archive-entry"
  | "archive-file"
  | "archive-size"
  | "candidate-commit"
  | "candidate-directory"
  | "candidate-file"
  | "candidate-package"
  | "candidate-size"
  | "candidate-shape"
  | "candidate-version"
  | "dependency-spec"
  | "dependency-version"
  | "lockfile-spec"
  | "runtime-version";

export type PublisherCandidateIssue = {
  code: PublisherCandidateIssueCode;
  message: string;
  path: string;
};

export type PublisherCandidateAudit = {
  archiveCount: number;
  candidateCommit?: string;
  issues: PublisherCandidateIssue[];
};

export type PublisherCandidateValidationPaths = {
  nodeVersionFilePath: string;
  packageLockPath: string;
  packageManifestPath: string;
  publisherCandidatesRoot: string;
  repoRoot: string;
};

export const defaultPublisherCandidateValidationPaths = Object.freeze({
  nodeVersionFilePath,
  packageLockPath,
  packageManifestPath,
  publisherCandidatesRoot,
  repoRoot,
});

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function displayPath(
  paths: PublisherCandidateValidationPaths,
  filePath: string,
): string {
  const relativePath = path.relative(paths.repoRoot, filePath);
  if (relativePath === "") return ".";
  if (relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    return filePath;
  }
  return relativePath.split(path.sep).join("/");
}

function addIssue(
  issues: PublisherCandidateIssue[],
  paths: PublisherCandidateValidationPaths,
  code: PublisherCandidateIssueCode,
  filePath: string,
  message: string,
): void {
  issues.push({ code, message, path: displayPath(paths, filePath) });
}

function sortIssues(
  issues: PublisherCandidateIssue[],
): PublisherCandidateIssue[] {
  return issues.sort((left, right) => {
    const leftKey = `${left.path}:${left.code}:${left.message}`;
    const rightKey = `${right.path}:${right.code}:${right.message}`;
    if (leftKey < rightKey) return -1;
    if (leftKey > rightKey) return 1;
    return 0;
  });
}

function readRegularFile(
  issues: PublisherCandidateIssue[],
  paths: PublisherCandidateValidationPaths,
  filePath: string,
  code: PublisherCandidateIssueCode,
  label: string,
): Buffer | undefined {
  let stats: fs.Stats;
  try {
    stats = fs.lstatSync(filePath);
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : String(error);
    addIssue(issues, paths, code, filePath, `${label} is unavailable: ${reason}`);
    return undefined;
  }
  if (stats.isSymbolicLink()) {
    addIssue(issues, paths, code, filePath, `${label} must not be a symbolic link.`);
    return undefined;
  }
  if (!stats.isFile()) {
    addIssue(issues, paths, code, filePath, `${label} must be a regular file.`);
    return undefined;
  }
  try {
    return fs.readFileSync(filePath);
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : String(error);
    addIssue(issues, paths, code, filePath, `${label} could not be read: ${reason}`);
    return undefined;
  }
}

function parseJsonRecord(
  issues: PublisherCandidateIssue[],
  paths: PublisherCandidateValidationPaths,
  filePath: string,
  code: PublisherCandidateIssueCode,
  label: string,
): JsonRecord | undefined {
  const bytes = readRegularFile(
    issues,
    paths,
    filePath,
    code,
    label,
  );
  if (!bytes) return undefined;
  try {
    const value: unknown = JSON.parse(bytes.toString("utf8"));
    if (!isRecord(value)) {
      addIssue(issues, paths, code, filePath, `${label} must contain one JSON object.`);
      return undefined;
    }
    return value;
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : String(error);
    addIssue(issues, paths, code, filePath, `${label} is not valid JSON: ${reason}`);
    return undefined;
  }
}

function hasExactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return JSON.stringify(actual) === JSON.stringify(sortedExpected);
}

function objectProperty(
  value: JsonRecord | undefined,
  key: string,
): JsonRecord | undefined {
  const property = value?.[key];
  return isRecord(property) ? property : undefined;
}

function dependencySpec(
  publisherCommit: string,
  archive: string,
): string {
  return `file:vendor/genii-publisher/${publisherCommit}/${archive}`;
}

function candidateCommitFromDependencies(
  issues: PublisherCandidateIssue[],
  paths: PublisherCandidateValidationPaths,
  dependencies: JsonRecord | undefined,
): string | undefined {
  const commits = new Set<string>();
  const expectedNames = new Set<string>(
    expectedPackages.map(({ name }) => name),
  );

  for (const packageRecord of expectedPackages) {
    const spec = dependencies?.[packageRecord.name];
    if (typeof spec !== "string") {
      addIssue(
        issues,
        paths,
        "dependency-spec",
        paths.packageManifestPath,
        `${packageRecord.name} must be a direct file dependency.`,
      );
      continue;
    }
    const prefix = "file:vendor/genii-publisher/";
    if (!spec.startsWith(prefix)) {
      addIssue(
        issues,
        paths,
        "dependency-spec",
        paths.packageManifestPath,
        `${packageRecord.name} must resolve below vendor/genii-publisher.`,
      );
      continue;
    }
    const parts = spec.slice(prefix.length).split("/");
    const [publisherCommit, archive] = parts;
    if (
      parts.length !== 2 ||
      publisherCommit === undefined ||
      !FULL_SHA_PATTERN.test(publisherCommit) ||
      archive !== packageRecord.archive
    ) {
      addIssue(
        issues,
        paths,
        "dependency-spec",
        paths.packageManifestPath,
        `${packageRecord.name} must name its exact archive below one full-SHA candidate directory.`,
      );
      continue;
    }
    commits.add(publisherCommit);
  }

  for (const name of Object.keys(dependencies ?? {})) {
    if (
      name.startsWith("@genii-foundation/publisher") &&
      !expectedNames.has(name)
    ) {
      addIssue(
        issues,
        paths,
        "dependency-spec",
        paths.packageManifestPath,
        `Unexpected Publisher dependency ${name}.`,
      );
    }
  }

  if (commits.size !== 1) {
    if (commits.size > 1) {
      addIssue(
        issues,
        paths,
        "dependency-spec",
        paths.packageManifestPath,
        "All Publisher file dependencies must use the same candidate commit.",
      );
    }
    return undefined;
  }
  return [...commits][0];
}

function validateRuntimeVersions(
  issues: PublisherCandidateIssue[],
  paths: PublisherCandidateValidationPaths,
  packageManifest: JsonRecord | undefined,
  packageLock: JsonRecord | undefined,
): void {
  const nodeVersionBytes = readRegularFile(
    issues,
    paths,
    paths.nodeVersionFilePath,
    "runtime-version",
    ".nvmrc",
  );
  if (
    nodeVersionBytes &&
    nodeVersionBytes.toString("utf8") !== `${PUBLISHER_NODE_VERSION}\n`
  ) {
    addIssue(
      issues,
      paths,
      "runtime-version",
      paths.nodeVersionFilePath,
      `.nvmrc must contain exactly ${PUBLISHER_NODE_VERSION} followed by one newline.`,
    );
  }

  const expectedPackageManager = `npm@${PUBLISHER_NPM_VERSION}`;
  if (packageManifest?.packageManager !== expectedPackageManager) {
    addIssue(
      issues,
      paths,
      "runtime-version",
      paths.packageManifestPath,
      `packageManager must be exactly ${expectedPackageManager}.`,
    );
  }
  const engines = objectProperty(packageManifest, "engines");
  if (engines?.node !== PUBLISHER_NODE_ENGINE) {
    addIssue(
      issues,
      paths,
      "runtime-version",
      paths.packageManifestPath,
      `engines.node must be exactly ${PUBLISHER_NODE_ENGINE}.`,
    );
  }
  if (engines?.npm !== PUBLISHER_NPM_VERSION) {
    addIssue(
      issues,
      paths,
      "runtime-version",
      paths.packageManifestPath,
      `engines.npm must be exactly ${PUBLISHER_NPM_VERSION}.`,
    );
  }

  const lockRoot = objectProperty(objectProperty(packageLock, "packages"), "");
  const lockEngines = objectProperty(lockRoot, "engines");
  if (
    lockEngines?.node !== PUBLISHER_NODE_ENGINE ||
    lockEngines?.npm !== PUBLISHER_NPM_VERSION
  ) {
    addIssue(
      issues,
      paths,
      "runtime-version",
      paths.packageLockPath,
      "The lockfile root must repeat the exact Node and npm engine requirements.",
    );
  }
}

function validateCandidateShape(
  issues: PublisherCandidateIssue[],
  paths: PublisherCandidateValidationPaths,
  candidatePath: string,
  publisherCommit: string,
  candidate: JsonRecord,
): JsonRecord[] {
  if (!hasExactKeys(candidate, candidateKeys)) {
    addIssue(
      issues,
      paths,
      "candidate-shape",
      candidatePath,
      `candidate.json must contain only ${candidateKeys.join(", ")}.`,
    );
  }
  if (candidate.schemaVersion !== 1) {
    addIssue(
      issues,
      paths,
      "candidate-version",
      candidatePath,
      "candidate.json schemaVersion must be 1.",
    );
  }
  if (candidate.publisherRepository !== PUBLISHER_REPOSITORY) {
    addIssue(
      issues,
      paths,
      "candidate-shape",
      candidatePath,
      `publisherRepository must be ${PUBLISHER_REPOSITORY}.`,
    );
  }
  if (candidate.publisherCommit !== publisherCommit) {
    addIssue(
      issues,
      paths,
      "candidate-commit",
      candidatePath,
      "publisherCommit must equal the full-SHA candidate directory name.",
    );
  }
  if (candidate.nodeVersion !== PUBLISHER_NODE_VERSION) {
    addIssue(
      issues,
      paths,
      "candidate-version",
      candidatePath,
      `nodeVersion must be ${PUBLISHER_NODE_VERSION}.`,
    );
  }
  if (candidate.npmVersion !== PUBLISHER_NPM_VERSION) {
    addIssue(
      issues,
      paths,
      "candidate-version",
      candidatePath,
      `npmVersion must be ${PUBLISHER_NPM_VERSION}.`,
    );
  }

  const records = Array.isArray(candidate.packages)
    ? candidate.packages.filter(isRecord)
    : [];
  if (
    !Array.isArray(candidate.packages) ||
    records.length !== expectedPackages.length ||
    records.length !== candidate.packages.length
  ) {
    addIssue(
      issues,
      paths,
      "candidate-package",
      candidatePath,
      `packages must contain exactly ${expectedPackages.length} package records.`,
    );
  }

  for (const [index, expected] of expectedPackages.entries()) {
    const record = records[index];
    if (!record) continue;
    if (!hasExactKeys(record, packageRecordKeys)) {
      addIssue(
        issues,
        paths,
        "candidate-shape",
        candidatePath,
        `packages[${index}] must contain only ${packageRecordKeys.join(", ")}.`,
      );
    }
    if (
      record.name !== expected.name ||
      record.version !== PUBLISHER_PACKAGE_VERSION ||
      record.archive !== expected.archive
    ) {
      addIssue(
        issues,
        paths,
        "candidate-package",
        candidatePath,
        `packages[${index}] must describe ${expected.name} ${PUBLISHER_PACKAGE_VERSION} in ${expected.archive}.`,
      );
    }
    if (!Number.isSafeInteger(record.byteSize) || Number(record.byteSize) <= 0) {
      addIssue(
        issues,
        paths,
        "candidate-size",
        candidatePath,
        `packages[${index}].byteSize must be a positive safe integer.`,
      );
    }
    if (typeof record.sha256 !== "string" || !SHA256_PATTERN.test(record.sha256)) {
      addIssue(
        issues,
        paths,
        "archive-digest",
        candidatePath,
        `packages[${index}].sha256 must be one lowercase SHA-256 digest.`,
      );
    }
  }
  return records;
}

function validateCandidateDirectory(
  issues: PublisherCandidateIssue[],
  paths: PublisherCandidateValidationPaths,
  candidateDirectory: string,
): string[] {
  for (const directoryPath of [
    paths.publisherCandidatesRoot,
    candidateDirectory,
  ]) {
    let stats: fs.Stats;
    try {
      stats = fs.lstatSync(directoryPath);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      addIssue(
        issues,
        paths,
        "candidate-directory",
        directoryPath,
        `Candidate directory is unavailable: ${reason}`,
      );
      return [];
    }
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      addIssue(
        issues,
        paths,
        "candidate-directory",
        directoryPath,
        "Candidate path must be a real directory, not a symbolic link.",
      );
      return [];
    }
    const repositoryIdentity = fs.realpathSync(paths.repoRoot);
    const expectedIdentity = path.resolve(
      repositoryIdentity,
      path.relative(paths.repoRoot, directoryPath),
    );
    if (fs.realpathSync(directoryPath) !== expectedIdentity) {
      addIssue(
        issues,
        paths,
        "candidate-directory",
        directoryPath,
        "Candidate paths must not descend through symbolic links.",
      );
      return [];
    }
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(candidateDirectory, {
      withFileTypes: true,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    addIssue(
      issues,
      paths,
      "candidate-directory",
      candidateDirectory,
      `Candidate directory could not be read: ${reason}`,
    );
    return [];
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      addIssue(
        issues,
        paths,
        "archive-entry",
        path.join(candidateDirectory, entry.name),
        "Candidate directory entries must not be symbolic links.",
      );
    }
  }
  const entryNames = entries.map(({ name }) => name).sort();
  const expectedArchiveNames = expectedPackages
    .map(({ archive }) => archive)
    .sort();
  const expectedEntryNames = ["candidate.json", ...expectedArchiveNames].sort();
  if (JSON.stringify(entryNames) !== JSON.stringify(expectedEntryNames)) {
    addIssue(
      issues,
      paths,
      "archive-entry",
      candidateDirectory,
      "Candidate directory must contain only candidate.json and the five declared package archives.",
    );
  }
  return entryNames.filter((name) => name.toLowerCase().endsWith(".tgz"));
}

function validateDependencyVersions(
  issues: PublisherCandidateIssue[],
  paths: PublisherCandidateValidationPaths,
  packageManifest: JsonRecord | undefined,
  packageLock: JsonRecord | undefined,
): void {
  const dependencies = objectProperty(packageManifest, "dependencies");
  const developmentDependencies = objectProperty(
    packageManifest,
    "devDependencies",
  );
  const lockRoot = objectProperty(objectProperty(packageLock, "packages"), "");
  const lockDependencies = objectProperty(lockRoot, "dependencies");
  const lockDevelopmentDependencies = objectProperty(
    lockRoot,
    "devDependencies",
  );
  const lockPackages = objectProperty(packageLock, "packages");

  for (const [name, version] of Object.entries(requiredProductionPins)) {
    if (
      dependencies?.[name] !== version ||
      lockDependencies?.[name] !== version
    ) {
      addIssue(
        issues,
        paths,
        "dependency-version",
        paths.packageManifestPath,
        `${name} must be pinned to ${version} in package.json and the lockfile root.`,
      );
    }
  }
  for (const [name, version] of Object.entries(requiredDevelopmentPins)) {
    if (
      developmentDependencies?.[name] !== version ||
      lockDevelopmentDependencies?.[name] !== version
    ) {
      addIssue(
        issues,
        paths,
        "dependency-version",
        paths.packageManifestPath,
        `${name} must be pinned to ${version} in package.json and the lockfile root.`,
      );
    }
  }

  const overrides = objectProperty(packageManifest, "overrides");
  const nextOverrides = objectProperty(overrides, "next@16.3.1");
  if (
    !overrides ||
    !hasExactKeys(overrides, ["next@16.3.1", "typescript-eslint"]) ||
    overrides["typescript-eslint"] !== "8.55.0" ||
    !nextOverrides ||
    !hasExactKeys(nextOverrides, Object.keys(requiredNextOverrides)) ||
    Object.entries(requiredNextOverrides).some(
      ([name, version]) => nextOverrides[name] !== version,
    )
  ) {
    addIssue(
      issues,
      paths,
      "dependency-version",
      paths.packageManifestPath,
      "Publisher migration overrides must keep exact Next transitives and TypeScript ESLint 8.55.0.",
    );
  }

  for (const [name, version] of Object.entries(requiredLockVersions)) {
    const lockEntry = objectProperty(lockPackages, `node_modules/${name}`);
    if (lockEntry?.version !== version) {
      addIssue(
        issues,
        paths,
        "dependency-version",
        paths.packageLockPath,
        `The selected lock entry for ${name} must resolve to ${version}.`,
      );
    }
  }

  for (const [entryPath, value] of Object.entries(lockPackages ?? {})) {
    if (
      (/(?:^|\/)node_modules\/typescript-eslint$/u.test(entryPath) ||
        /(?:^|\/)node_modules\/@typescript-eslint\/[^/]+$/u.test(entryPath)) &&
      (!isRecord(value) || value.version !== "8.55.0")
    ) {
      addIssue(
        issues,
        paths,
        "dependency-version",
        paths.packageLockPath,
        `TypeScript ESLint lock entry ${entryPath} must resolve to 8.55.0.`,
      );
    }
  }
}

function validateDependenciesAndLockfile(
  issues: PublisherCandidateIssue[],
  paths: PublisherCandidateValidationPaths,
  publisherCommit: string,
  packageManifest: JsonRecord | undefined,
  packageLock: JsonRecord | undefined,
  archiveBytes: ReadonlyMap<string, Buffer>,
): void {
  const dependencies = objectProperty(packageManifest, "dependencies");
  const lockRoot = objectProperty(objectProperty(packageLock, "packages"), "");
  const lockDependencies = objectProperty(lockRoot, "dependencies");
  const lockPackages = objectProperty(packageLock, "packages");
  const allowedPublisherLockEntries = new Set(
    expectedPackages.map(({ name }) => `node_modules/${name}`),
  );

  for (const sectionName of [
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    const section = objectProperty(packageManifest, sectionName);
    for (const name of Object.keys(section ?? {})) {
      if (
        name.startsWith("@genii-foundation/publisher") &&
        !expectedPackages.some((candidate) => candidate.name === name)
      ) {
        addIssue(
          issues,
          paths,
          "dependency-spec",
          paths.packageManifestPath,
          `Unexpected Publisher package ${name} is not part of this candidate.`,
        );
      }
    }
  }

  for (const entryPath of Object.keys(lockPackages ?? {})) {
    const publisherPackage = entryPath.match(
      /(?:^|\/)node_modules\/@genii-foundation\/(publisher[^/]*)$/u,
    );
    if (
      publisherPackage &&
      !allowedPublisherLockEntries.has(entryPath)
    ) {
      addIssue(
        issues,
        paths,
        "lockfile-spec",
        paths.packageLockPath,
        `Unexpected Publisher lock entry ${entryPath} is not part of this candidate.`,
      );
    }
  }

  for (const packageRecord of expectedPackages) {
    const spec = dependencySpec(publisherCommit, packageRecord.archive);
    if (dependencies?.[packageRecord.name] !== spec) {
      addIssue(
        issues,
        paths,
        "dependency-spec",
        paths.packageManifestPath,
        `${packageRecord.name} must use ${spec}.`,
      );
    }
    if (lockDependencies?.[packageRecord.name] !== spec) {
      addIssue(
        issues,
        paths,
        "lockfile-spec",
        paths.packageLockPath,
        `The lockfile root must bind ${packageRecord.name} to ${spec}.`,
      );
    }

    const lockEntry = objectProperty(
      lockPackages,
      `node_modules/${packageRecord.name}`,
    );
    const bytes = archiveBytes.get(packageRecord.archive);
    const expectedIntegrity = bytes
      ? `sha512-${createHash("sha512").update(bytes).digest("base64")}`
      : undefined;
    if (
      lockEntry?.version !== PUBLISHER_PACKAGE_VERSION ||
      lockEntry?.resolved !== spec ||
      (expectedIntegrity !== undefined && lockEntry.integrity !== expectedIntegrity)
    ) {
      addIssue(
        issues,
        paths,
        "lockfile-spec",
        paths.packageLockPath,
        `The lockfile entry for ${packageRecord.name} must bind the exact archive version, path, and integrity.`,
      );
    }
  }
}

export function auditPublisherCandidate(
  paths: PublisherCandidateValidationPaths =
    defaultPublisherCandidateValidationPaths,
): PublisherCandidateAudit {
  const issues: PublisherCandidateIssue[] = [];
  const packageManifest = parseJsonRecord(
    issues,
    paths,
    paths.packageManifestPath,
    "dependency-spec",
    "Root package manifest",
  );
  const packageLock = parseJsonRecord(
    issues,
    paths,
    paths.packageLockPath,
    "lockfile-spec",
    "Root package lockfile",
  );
  validateRuntimeVersions(issues, paths, packageManifest, packageLock);
  validateDependencyVersions(issues, paths, packageManifest, packageLock);

  const dependencies = objectProperty(packageManifest, "dependencies");
  const publisherCommit = candidateCommitFromDependencies(
    issues,
    paths,
    dependencies,
  );
  if (!publisherCommit) {
    return {
      archiveCount: 0,
      issues: sortIssues(issues),
    };
  }

  const candidateDirectory = path.join(
    paths.publisherCandidatesRoot,
    publisherCommit,
  );
  const archiveNames = validateCandidateDirectory(
    issues,
    paths,
    candidateDirectory,
  );
  const candidatePath = path.join(candidateDirectory, "candidate.json");
  const candidate = parseJsonRecord(
    issues,
    paths,
    candidatePath,
    "candidate-file",
    "Publisher candidate record",
  );
  const records = candidate
    ? validateCandidateShape(
        issues,
        paths,
        candidatePath,
        publisherCommit,
        candidate,
      )
    : [];

  const archiveBytes = new Map<string, Buffer>();
  for (const [index, expected] of expectedPackages.entries()) {
    const archivePath = path.join(candidateDirectory, expected.archive);
    const bytes = readRegularFile(
      issues,
      paths,
      archivePath,
      "archive-file",
      `${expected.name} archive`,
    );
    if (!bytes) continue;
    archiveBytes.set(expected.archive, bytes);
    const record = records[index];
    if (record && record.byteSize !== bytes.byteLength) {
      addIssue(
        issues,
        paths,
        "archive-size",
        archivePath,
        `Archive byte size ${bytes.byteLength} does not match candidate.json.`,
      );
    }
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (record && record.sha256 !== digest) {
      addIssue(
        issues,
        paths,
        "archive-digest",
        archivePath,
        "Archive SHA-256 does not match candidate.json.",
      );
    }
  }

  validateDependenciesAndLockfile(
    issues,
    paths,
    publisherCommit,
    packageManifest,
    packageLock,
    archiveBytes,
  );

  return {
    archiveCount: archiveNames.length,
    candidateCommit: publisherCommit,
    issues: sortIssues(issues),
  };
}

export function formatPublisherCandidateFailure(
  audit: PublisherCandidateAudit,
): string {
  return [
    "Publisher candidate validation failed.",
    "",
    ...audit.issues.map(
      (issue) => `  [${issue.code}] ${issue.path}: ${issue.message}`,
    ),
  ].join("\n");
}

function runCli(): void {
  const audit = auditPublisherCandidate();
  if (audit.issues.length > 0) {
    console.error(formatPublisherCandidateFailure(audit));
    process.exitCode = 1;
    return;
  }
  console.log(
    `Publisher candidate ${audit.candidateCommit} is valid with ${audit.archiveCount} exact package archives, Node ${PUBLISHER_NODE_VERSION}, and npm ${PUBLISHER_NPM_VERSION}.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
