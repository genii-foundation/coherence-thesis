import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  auditPublisherCandidate,
  defaultPublisherCandidateValidationPaths,
  type PublisherCandidateIssueCode,
  type PublisherCandidateValidationPaths,
} from "./publisher-candidate";
import trackedCandidate from "../../src/publisher/embedded-offline-candidate.json";

const publisherCommit = "ab4c5733764ee3a24ad9bcbe9bf2d85b61c032ba";
const packageVersion = "0.1.0-alpha.0";
const packageRecords = [
  {
    name: "@genii-foundation/publisher-schema",
    archive: "genii-foundation-publisher-schema-0.1.0-alpha.0.tgz",
  },
  {
    name: "@genii-foundation/publisher-content",
    archive: "genii-foundation-publisher-content-0.1.0-alpha.0.tgz",
  },
  {
    name: "@genii-foundation/publisher-reader",
    archive: "genii-foundation-publisher-reader-0.1.0-alpha.0.tgz",
  },
  {
    name: "@genii-foundation/publisher",
    archive: "genii-foundation-publisher-0.1.0-alpha.0.tgz",
  },
  {
    name: "@genii-foundation/publisher-next",
    archive: "genii-foundation-publisher-next-0.1.0-alpha.0.tgz",
  },
] as const;
const checkedInPackageRecords = [
  {
    name: "@genii-foundation/publisher-schema",
    version: packageVersion,
    archive: "genii-foundation-publisher-schema-0.1.0-alpha.0.tgz",
    byteSize: 1_012_543,
    sha256:
      "sha256:842ea24cd5c12e318e5a34d8692bfa7f77f435fcdb9d415474be6df487432a05",
  },
  {
    name: "@genii-foundation/publisher-content",
    version: packageVersion,
    archive: "genii-foundation-publisher-content-0.1.0-alpha.0.tgz",
    byteSize: 973_861,
    sha256:
      "sha256:44967f33db5a2a7846187aa350bf6020d93469e228eff3b31e4cb2a84c38e246",
  },
  {
    name: "@genii-foundation/publisher-reader",
    version: packageVersion,
    archive: "genii-foundation-publisher-reader-0.1.0-alpha.0.tgz",
    byteSize: 367_088,
    sha256:
      "sha256:fa23c7c361e2bbbeca5d1505edb3a2507d7cf43634fb06187dc73dfe14d7a0ef",
  },
  {
    name: "@genii-foundation/publisher",
    version: packageVersion,
    archive: "genii-foundation-publisher-0.1.0-alpha.0.tgz",
    byteSize: 186_447,
    sha256:
      "sha256:c26f226388dee2ac57c7d1d8b04d5264126c9dacec5fa5acda59a71d6a3e2d22",
  },
  {
    name: "@genii-foundation/publisher-next",
    version: packageVersion,
    archive: "genii-foundation-publisher-next-0.1.0-alpha.0.tgz",
    byteSize: 252_955,
    sha256:
      "sha256:f68663a07b4195c4c93c2f5afa63d40a07ebd2ae093b12491aeaebfe9b597d83",
  },
] as const;
const productionPins = {
  next: "16.3.1",
  react: "19.2.8",
  "react-dom": "19.2.8",
} as const;
const developmentPins = {
  "@playwright/test": "1.61.1",
  "@types/node": "22.20.1",
  "@types/react": "19.2.17",
  "@types/react-dom": "19.2.3",
  "eslint-config-next": "16.3.1",
  sharp: "0.35.3",
  typescript: "5.9.3",
  "typescript-eslint": "8.55.0",
} as const;
const selectedTransitives = {
  nanoid: "3.3.18",
  postcss: "8.5.24",
  "eslint-visitor-keys": "4.2.1",
} as const;

type Fixture = {
  candidate: Record<string, unknown>;
  candidateDirectory: string;
  packageLock: Record<string, unknown>;
  packageManifest: Record<string, unknown>;
  paths: PublisherCandidateValidationPaths;
  root: string;
};

const fixtureRoots: string[] = [];

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createFixture(): Fixture {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "publisher-candidate-validator-"),
  );
  fixtureRoots.push(root);
  const publisherCandidatesRoot = path.join(
    root,
    "vendor",
    "genii-publisher",
  );
  const candidateDirectory = path.join(
    publisherCandidatesRoot,
    publisherCommit,
  );
  fs.mkdirSync(candidateDirectory, { recursive: true });

  const dependencies: Record<string, string> = {};
  const lockEntries: Record<string, unknown> = {};
  const candidatePackages = packageRecords.map((record, index) => {
    const bytes = Buffer.from(`archive-${index}-${record.name}\n`, "utf8");
    const archivePath = path.join(candidateDirectory, record.archive);
    fs.writeFileSync(archivePath, bytes);
    const spec = `file:vendor/genii-publisher/${publisherCommit}/${record.archive}`;
    dependencies[record.name] = spec;
    lockEntries[`node_modules/${record.name}`] = {
      version: packageVersion,
      resolved: spec,
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    };
    return {
      name: record.name,
      version: packageVersion,
      archive: record.archive,
      byteSize: bytes.byteLength,
      sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    };
  });
  Object.assign(dependencies, productionPins);
  for (const [name, version] of Object.entries({
    ...productionPins,
    ...developmentPins,
    ...selectedTransitives,
  })) {
    lockEntries[`node_modules/${name}`] = { version };
  }

  const candidate: Record<string, unknown> = {
    schemaVersion: 1,
    publisherRepository: "https://github.com/genii-foundation/publisher",
    publisherCommit,
    nodeVersion: "22.12.0",
    npmVersion: "10.9.0",
    packages: candidatePackages,
  };
  const packageManifest: Record<string, unknown> = {
    packageManager: "npm@10.9.0",
    engines: { node: ">=22.12.0 <23", npm: "10.9.0" },
    dependencies,
    devDependencies: developmentPins,
    overrides: {
      "next@16.3.1": {
        nanoid: "3.3.18",
        postcss: "8.5.24",
        sharp: "0.35.3",
      },
      "typescript-eslint": "8.55.0",
    },
  };
  const packageLock: Record<string, unknown> = {
    lockfileVersion: 3,
    packages: {
      "": {
        dependencies,
        devDependencies: developmentPins,
        engines: { node: ">=22.12.0 <23", npm: "10.9.0" },
      },
      ...lockEntries,
    },
  };
  const paths: PublisherCandidateValidationPaths = {
    repoRoot: root,
    publisherCandidatesRoot,
    packageManifestPath: path.join(root, "package.json"),
    packageLockPath: path.join(root, "package-lock.json"),
    nodeVersionFilePath: path.join(root, ".nvmrc"),
  };
  writeJson(path.join(candidateDirectory, "candidate.json"), candidate);
  writeJson(paths.packageManifestPath, packageManifest);
  writeJson(paths.packageLockPath, packageLock);
  fs.writeFileSync(paths.nodeVersionFilePath, "22.12.0\n");
  return {
    candidate,
    candidateDirectory,
    packageLock,
    packageManifest,
    paths,
    root,
  };
}

function issueCodes(fixture: Fixture): PublisherCandidateIssueCode[] {
  return auditPublisherCandidate(fixture.paths).issues.map(({ code }) => code);
}

function saveFixture(fixture: Fixture): void {
  writeJson(
    path.join(fixture.candidateDirectory, "candidate.json"),
    fixture.candidate,
  );
  writeJson(fixture.paths.packageManifestPath, fixture.packageManifest);
  writeJson(fixture.paths.packageLockPath, fixture.packageLock);
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

describe("Publisher candidate validation", () => {
  it("accepts the checked-in Publisher candidate", () => {
    const audit = auditPublisherCandidate(
      defaultPublisherCandidateValidationPaths,
    );
    const candidate = JSON.parse(
      fs.readFileSync(
        path.join(
          defaultPublisherCandidateValidationPaths.publisherCandidatesRoot,
          publisherCommit,
          "candidate.json",
        ),
        "utf8",
      ),
    ) as { packages: unknown };
    expect(audit.issues).toEqual([]);
    expect(audit.candidateBuildId).toBe(trackedCandidate.buildId);
    expect(audit.candidateCommit).toBe(publisherCommit);
    expect(audit.archiveCount).toBe(5);
    expect(candidate.packages).toEqual(checkedInPackageRecords);
    const trackedIdentity = Object.fromEntries(
      Object.entries(trackedCandidate).filter(([key]) => key !== "buildId"),
    );
    expect(audit.candidateIdentity).toEqual(trackedIdentity);
  });

  it("accepts one exact synthetic candidate", () => {
    const fixture = createFixture();
    const audit = auditPublisherCandidate(fixture.paths);
    expect(audit).toEqual({
      archiveCount: 5,
      candidateBuildId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      candidateCommit: publisherCommit,
      candidateIdentity: fixture.candidate,
      issues: [],
    });
  });

  it("rejects reordered package authority and exposes no candidate identity", () => {
    const fixture = createFixture();
    const packages = fixture.candidate.packages as Record<string, unknown>[];
    [packages[0], packages[1]] = [packages[1]!, packages[0]!];
    saveFixture(fixture);

    const audit = auditPublisherCandidate(fixture.paths);
    expect(audit.issues.map(({ code }) => code)).toContain("candidate-package");
    expect(audit.candidateBuildId).toBeUndefined();
    expect(audit.candidateIdentity).toBeUndefined();
  });

  it("rejects extra candidate and package record fields", () => {
    const fixture = createFixture();
    fixture.candidate.extra = true;
    const packages = fixture.candidate.packages as Record<string, unknown>[];
    packages[0]!.extra = true;
    saveFixture(fixture);
    expect(issueCodes(fixture)).toEqual([
      "candidate-shape",
      "candidate-shape",
    ]);
  });

  it("rejects a candidate commit that differs from its full-SHA directory", () => {
    const fixture = createFixture();
    fixture.candidate.publisherCommit = "a".repeat(40);
    saveFixture(fixture);
    expect(issueCodes(fixture)).toContain("candidate-commit");
  });

  it("rejects incomplete SHA dependency directories", () => {
    const fixture = createFixture();
    const dependencies = fixture.packageManifest.dependencies as Record<
      string,
      string
    >;
    dependencies[packageRecords[0].name] = dependencies[
      packageRecords[0].name
    ]!.replace(publisherCommit, publisherCommit.slice(0, 12));
    saveFixture(fixture);
    expect(issueCodes(fixture)).toContain("dependency-spec");
  });

  it("rejects a changed package identity", () => {
    const fixture = createFixture();
    const packages = fixture.candidate.packages as Record<string, unknown>[];
    packages[2]!.version = "0.1.0-alpha.1";
    saveFixture(fixture);
    expect(issueCodes(fixture)).toContain("candidate-package");
  });

  it("rejects an incomplete package census", () => {
    const fixture = createFixture();
    const packages = fixture.candidate.packages as Record<string, unknown>[];
    packages.pop();
    saveFixture(fixture);
    expect(issueCodes(fixture)).toContain("candidate-package");
  });

  it("rejects archive size and digest drift", () => {
    const fixture = createFixture();
    fs.appendFileSync(
      path.join(fixture.candidateDirectory, packageRecords[1].archive),
      "changed",
    );
    const codes = issueCodes(fixture);
    expect(codes).toContain("archive-size");
    expect(codes).toContain("archive-digest");
    expect(codes).toContain("lockfile-spec");
    const audit = auditPublisherCandidate(fixture.paths);
    expect(audit.candidateBuildId).toBeUndefined();
    expect(audit.candidateIdentity).toBeUndefined();
  });

  it("rejects symbolic-link archives", () => {
    const fixture = createFixture();
    const archivePath = path.join(
      fixture.candidateDirectory,
      packageRecords[3].archive,
    );
    const targetPath = path.join(fixture.root, "outside.tgz");
    fs.writeFileSync(targetPath, "outside");
    fs.rmSync(archivePath);
    fs.symlinkSync(targetPath, archivePath);
    const codes = issueCodes(fixture);
    expect(codes).toContain("archive-entry");
    expect(codes).toContain("archive-file");
  });

  it("rejects a symbolic-link candidate root", () => {
    const fixture = createFixture();
    const realCandidatesRoot = path.join(fixture.root, "real-candidates");
    fs.renameSync(fixture.paths.publisherCandidatesRoot, realCandidatesRoot);
    fs.symlinkSync(realCandidatesRoot, fixture.paths.publisherCandidatesRoot);
    expect(issueCodes(fixture)).toContain("candidate-directory");
  });

  it("rejects extra package archives", () => {
    const fixture = createFixture();
    fs.writeFileSync(
      path.join(fixture.candidateDirectory, "unexpected.tgz"),
      "unexpected",
    );
    expect(issueCodes(fixture)).toContain("archive-entry");
  });

  it("rejects every extra file in the selected candidate directory", () => {
    const fixture = createFixture();
    fs.writeFileSync(
      path.join(fixture.candidateDirectory, "unreviewed-note.txt"),
      "unreviewed",
    );
    expect(issueCodes(fixture)).toContain("archive-entry");
  });

  it("rejects root dependency and lockfile drift", () => {
    const fixture = createFixture();
    const dependencies = fixture.packageManifest.dependencies as Record<
      string,
      string
    >;
    dependencies[packageRecords[4].name] = "0.1.0-alpha.0";
    const lockPackages = fixture.packageLock.packages as Record<
      string,
      Record<string, unknown>
    >;
    lockPackages[`node_modules/${packageRecords[0].name}`]!.integrity =
      "sha512-invalid";
    saveFixture(fixture);
    const codes = issueCodes(fixture);
    expect(codes).toContain("dependency-spec");
    expect(codes).toContain("lockfile-spec");
  });

  it("rejects unreviewed Publisher packages in manifest or lock state", () => {
    const fixture = createFixture();
    fixture.packageManifest.devDependencies = {
      "@genii-foundation/publisher-sync-supabase": "0.0.0",
    };
    const lockPackages = fixture.packageLock.packages as Record<
      string,
      Record<string, unknown>
    >;
    lockPackages[
      "node_modules/@genii-foundation/publisher-sync-supabase"
    ] = { version: "0.0.0" };
    saveFixture(fixture);

    const codes = issueCodes(fixture);
    expect(codes).toContain("dependency-spec");
    expect(codes).toContain("lockfile-spec");
  });

  it("rejects framework, override, and lint graph drift", () => {
    const fixture = createFixture();
    const dependencies = fixture.packageManifest.dependencies as Record<
      string,
      string
    >;
    dependencies.next = "16.3.2";
    fixture.packageManifest.overrides = {};
    const lockPackages = fixture.packageLock.packages as Record<
      string,
      Record<string, unknown>
    >;
    lockPackages["node_modules/sharp"]!.version = "0.34.5";
    lockPackages[
      "node_modules/eslint-config-next/node_modules/typescript-eslint"
    ] = { version: "8.67.0" };
    saveFixture(fixture);

    const codes = issueCodes(fixture);
    expect(
      codes.filter((code) => code === "dependency-version").length,
    ).toBeGreaterThanOrEqual(4);
  });

  it("rejects runtime pin drift", () => {
    const fixture = createFixture();
    fs.writeFileSync(fixture.paths.nodeVersionFilePath, "22\n");
    fixture.packageManifest.packageManager = "npm@11.0.0";
    fixture.packageManifest.engines = {
      node: ">=22",
      npm: "11.0.0",
    };
    const lockPackages = fixture.packageLock.packages as Record<
      string,
      Record<string, unknown>
    >;
    lockPackages[""]!.engines = { node: ">=22", npm: "11.0.0" };
    saveFixture(fixture);
    expect(issueCodes(fixture).filter((code) => code === "runtime-version"))
      .toHaveLength(5);
  });
});
