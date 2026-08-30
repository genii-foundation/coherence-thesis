import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalizeJson } from "@genii-foundation/publisher-content";
import {
  parseJsonWithUniqueObjectKeys,
  validateAudioCatalogShape,
  validateAudioEnvelopeShape,
  type JSONValue,
} from "@genii-foundation/publisher-schema";
import { beforeAll, describe, expect, it } from "vitest";

import {
  generatedPublisherRoot,
  repoRoot,
} from "../repository/paths";
import {
  adaptCoherencePublisherAudio,
  assertCoherencePublisherAudioAuthorityPaths,
  loadCoherencePublisherAudioAuthorities,
  type CoherencePublisherAudioAuthorities,
  type CoherencePublisherAudioProof,
} from "./audio-adapter";

const adapterPath = fileURLToPath(
  new URL("./audio-adapter.ts", import.meta.url),
);
const tsxPath = path.join(repoRoot, "node_modules/.bin/tsx");
const logicalCatalogPath = path.join(
  generatedPublisherRoot,
  "audio-catalog.json",
);

function sha256Text(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function trackedRepositoryByteProjection(
  repositoryRoot: string,
  transform?: (relativePath: string, bytes: Buffer) => Buffer,
): string {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr);
  const records = result.stdout
    .split("\0")
    .filter(Boolean)
    .sort()
    .map((relativePath) => {
      const absolutePath = path.join(repositoryRoot, relativePath);
      const status = fs.lstatSync(absolutePath);
      const sourceBytes = status.isSymbolicLink()
        ? Buffer.from(fs.readlinkSync(absolutePath), "utf8")
        : fs.readFileSync(absolutePath);
      const bytes = transform?.(relativePath, sourceBytes) ?? sourceBytes;
      return Object.freeze({
        relativePath,
        kind: status.isSymbolicLink() ? "symbolic-link" : "file",
        byteSize: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    });
  return sha256Text(JSON.stringify(records));
}

let authorities: CoherencePublisherAudioAuthorities;
let proof: CoherencePublisherAudioProof;
let networkAttempts = 0;
let trackedBytesBefore = "";
let trackedBytesAfter = "";
let logicalCatalogPresentBefore = false;
let logicalCatalogPresentAfter = false;

beforeAll(async () => {
  trackedBytesBefore = trackedRepositoryByteProjection(repoRoot);
  logicalCatalogPresentBefore = fs.existsSync(logicalCatalogPath);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    networkAttempts += 1;
    throw new Error("audio adapter proof attempted network access");
  };
  try {
    authorities = await loadCoherencePublisherAudioAuthorities();
    proof = await adaptCoherencePublisherAudio(authorities);
    trackedBytesAfter = trackedRepositoryByteProjection(repoRoot);
    logicalCatalogPresentAfter = fs.existsSync(logicalCatalogPath);
  } finally {
    globalThis.fetch = originalFetch;
  }
}, 30_000);

describe("Coherence Publisher audio adapter", () => {
  it("binds all current clips and withholds the 403 incompatible recordings", () => {
    expect(proof.evidence.authorities).toMatchObject({
      sourceManifestPath: "publishing/audio/manifest.json",
      sourceManifestBytes: 261_533,
      sourceManifestTextSha256:
        "sha256:4ed40d61143ff9f2ba043ed9591f9d1772796283487d38db55d44cd99878d893",
      publicationManifestPath: "publication.json",
      sourceDeclarationPresent: false,
      unsupportedSourceFields: [
        {
          path: "/voices/0/renderedWordCount",
          keyword: "additionalProperties",
          field: "renderedWordCount",
          value: 204_120,
        },
      ],
      rawCatalogSectionCount: 525,
      currentClipCount: 525,
      currentVersionBindingCount: 525,
      checkpointCount: 19,
      historicalCheckpointUnitCount: 574,
      exactCurrentCheckpointMatchCount: 525,
      ambiguousCurrentCheckpointMatchCount: 0,
      missingCurrentCheckpointMatchCount: 0,
      completeCheckpointAuthoritySha256:
        "sha256:0f768e81421de70ab5d4812c2282aebe2d0c42567d621e34b4d9f8ff619f8a20",
      currentCheckpointMatchEvidenceSha256:
        "sha256:2288b329ed8a61418d0d856eebdc81073c29e798d4a2ac5a8b0a609de7328d72",
      publisherCheckpointCompatible: false,
      publisherCheckpointCount: 0,
      publisherHistoricalSpokenTextAuthorityPresent: false,
      renderedWordCount: 204_120,
      rawAudioTextWordCount: 204_144,
      wordCounterDifference: 24,
      historicalSourceBinding: {
        nonGating: true,
        reconstructedByMainProof: false,
        checkpointUnitCount: 122,
        exactSourceCommitAvailableCount: 113,
        exactSourceCommitUnavailableCount: 9,
        compatibleSectionIdsSha256:
          "sha256:d82046c70fe3283130c9cab6c5b14916d063c8f52cfe963af0dd0e1025f98ebd",
        availableBindingRecordsSha256:
          "sha256:2bc9df8a474c6459c4bb24159e35d70ac4b2712a8f245faa5ec86280e57de759",
        unavailableSectionIdsSha256:
          "sha256:a7299f729e22d917f44fe64176624dc93a80c2b3dd700b48402d5026de970553",
        unavailableSourceCommit: "27a4fe04324f047c45b30eb17766a226e45e0fd1",
      },
    });
    expect(proof.evidence.authorities.currentProvenance).toEqual([
      {
        checkpointVersion: "2026-08-01-nine-volume-revision-v1",
        clipCount: 478,
      },
      {
        checkpointVersion: "2026-08-18-pr206-editorial-v1",
        clipCount: 23,
      },
      {
        checkpointVersion: "2026-08-18-pr207-publication-cleanup-v1",
        clipCount: 23,
      },
      {
        checkpointVersion: "2026-08-20-ctd-0015-v1",
        clipCount: 1,
      },
    ]);
    expect(proof.evidence.projection).toMatchObject({
      policy: "byte-exact-coherence-audio-text-equals-publisher-profile",
      safeClipCount: 122,
      timingDeclarationCount: 122,
      timingDeclarationKind: "checkpoint-bound-reference",
      timingBodiesParsed: false,
      withheldIncompatiblePublishedClipCount: 403,
      equalLengthMismatchCount: 195,
      differentLengthMismatchCount: 208,
      safeSectionIdsSha256:
        "sha256:4aa80d0705d8bc974c6d78347a15c1796a2d527e752eb97aeee35ec29eeb40be",
      withheldIncompatibleSectionIdsSha256:
        "sha256:fa9fce250f04e456187fc0f47c472c679b21849e08238672320e6775ee373465",
      narrationComparisonSha256:
        "sha256:f9381c56e5fc51fcc0050fc7160a9ebb0d978355d13c841d262197edd4163d2e",
      currentCensus: {
        audioBytes: 694_972_293,
        timingsBytes: 28_597_027,
        durationSeconds: 72_037.575,
        exactWordCount: 202_903,
        interpolatedWordCount: 1_217,
      },
      safeCensus: {
        audioBytes: 104_355_445,
        timingsBytes: 4_387_745,
        durationSeconds: 10_840.535,
        exactWordCount: 31_299,
        interpolatedWordCount: 169,
      },
    });
    expect(proof.evidence.projection.safeProvenance).toEqual([
      {
        checkpointVersion: "2026-08-01-nine-volume-revision-v1",
        clipCount: 119,
      },
      {
        checkpointVersion: "2026-08-18-pr207-publication-cleanup-v1",
        clipCount: 3,
      },
    ]);
    expect(proof.evidence.projection.safeClipsByWork).toEqual([
      { workId: "humanitys-most-viable-future", clipCount: 9 },
      { workId: "wielding-intelligence", clipCount: 20 },
      { workId: "providence-imperative", clipCount: 16 },
      { workId: "architecting-providence", clipCount: 32 },
      { workId: "purposeful", clipCount: 1 },
      { workId: "smallest-nest", clipCount: 16 },
      { workId: "presencing-genius", clipCount: 22 },
      { workId: "misanthropic-artifice", clipCount: 5 },
      { workId: "cardinal-scale", clipCount: 1 },
    ]);
  });

  it("strictly round trips and binds catalog, envelope, application, and offline bytes", () => {
    const catalogJson = parseJsonWithUniqueObjectKeys(proof.catalogText);
    expect(catalogJson.valid).toBe(true);
    if (!catalogJson.valid) return;
    const catalog = validateAudioCatalogShape(catalogJson.value);
    expect(catalog.valid).toBe(true);
    if (!catalog.valid) return;
    expect(catalog.value).toEqual(proof.catalog);
    expect(`${canonicalizeJson(catalog.value as unknown as JSONValue)}\n`).toBe(
      proof.catalogText,
    );

    const envelopeJson = parseJsonWithUniqueObjectKeys(proof.envelopeText);
    expect(envelopeJson.valid).toBe(true);
    if (!envelopeJson.valid) return;
    const envelope = validateAudioEnvelopeShape(envelopeJson.value);
    expect(envelope.valid).toBe(true);
    if (!envelope.valid) return;
    expect(envelope.value).toEqual(proof.envelope);
    expect(proof.envelope.source.catalogSha256).toBe(
      sha256Text(proof.catalogText),
    );
    expect(proof.envelope.source.catalogPath).toBe(
      "generated/publisher/audio-catalog.json",
    );
    expect(proof.evidence.catalog).toEqual({
      logicalPath: "generated/publisher/audio-catalog.json",
      materialized: false,
      canonicalValueSha256:
        "sha256:a12005d099b5f9c0a23f298a4a46af6c73ee1cdb82150533dc7d28717ab154a8",
      canonicalTextSha256:
        "sha256:49b659bcbcc5968e33c3d60e0dadee4121208217284317d99ea9bacec48ccb34",
      canonicalTextBytes: 48_578,
      strictRoundTripParsed: true,
      strictRoundTripSchemaValidated: true,
      strictRoundTripDeepEqual: true,
    });
    expect(proof.evidence.envelope).toMatchObject({
      catalogPath: "generated/publisher/audio-catalog.json",
      catalogTextSha256:
        "sha256:49b659bcbcc5968e33c3d60e0dadee4121208217284317d99ea9bacec48ccb34",
      envelopeTextSha256:
        "sha256:32d341138d523cc40f66b4b39e2620721f74499d06e5f60c145cb5ced33596c9",
      readerProjectionParsed: true,
      strictRoundTripParsed: true,
      strictRoundTripSchemaValidated: true,
      strictRoundTripDeepEqual: true,
      clipCount: 122,
      timingDeclarationCount: 122,
    });
    expect(proof.evidence.application).toMatchObject({
      constructedInMemory: true,
      publicAssembly: false,
      readerBuildId:
        "sha256:a1d601f339971182febbfb7fa96ad54ab7c02b1338b155e7fe2591c3862bfe9e",
      applicationBuildId:
        "sha256:6a888ce22e65c34aea1295243e493533792dc785f298dc4ba3fcda6dd63a3ae1",
      applicationArtifactSha256:
        "sha256:8e78120707a44c6e64bd1bc0455eec27f65b1da452eed4c2169938650c134cec",
      applicationManifestBindsAudio: false,
      audioBinding: "envelope-catalog-hash-and-offline-package-catalog-hash",
      offlineCatalogTextSha256:
        "sha256:b41039a2fc5d850a6cd933e1670bc6ecf3d5fbcdf7fdd9ef92e1c427806d1095",
      offlineCatalogParsed: true,
      offlinePackageCount: 9,
      offlineAudioResourceCount: 122,
      offlineTimingResourceCount: 122,
      offlineNarrationCatalogHashBindingCount: 9,
    });
    expect(proof.evidence.evidenceSha256).toBe(
      "sha256:e7b5f14d26eb4055c9d9184032f8b50b1d73e285bc4255e8bb569bb185ad657e",
    );

    const priorCheckpointIdentities = {
      sourceManifestTextSha256:
        "sha256:8c502dab9c44d8a10c02ff2fd6ea3a9f72e914bafd6c35dbff4e615c928e5c59",
      completeCheckpointAuthoritySha256:
        "sha256:bba6019049a7d34766b31d73ea2ae8879e3bce79c06da1b2bd5f8820756718f4",
      currentCheckpointMatchEvidenceSha256:
        "sha256:7e80cd202ee6333a1eb745f153627d819b15361a119b091f70ecefebefab04ec",
      safeSectionIdsSha256:
        "sha256:4aa80d0705d8bc974c6d78347a15c1796a2d527e752eb97aeee35ec29eeb40be",
      withheldIncompatibleSectionIdsSha256:
        "sha256:fa9fce250f04e456187fc0f47c472c679b21849e08238672320e6775ee373465",
      narrationComparisonSha256:
        "sha256:e77b00b2cb55d52c34ec58e16ab9cc32f4e3e6a066646d9c7f11a24af3ce1328",
      canonicalValueSha256:
        "sha256:b5a5da855a3e21576e2e563eaf8767d643e6a9bde48a204124bb749f5085bde9",
      canonicalTextSha256:
        "sha256:a7094b6f7c9718810bae6a2c80e408678e39d9c09c5af0972d09d95193a6efdd",
      envelopeTextSha256:
        "sha256:07f7060ba946ae260457ecd6c5c64b86deceb8ae14c17a69a7da7a88597f072b",
      readerBuildId:
        "sha256:68bfb9da9dc5aa6ffdce273307f15551978d0064870c31a51674b4f6ff39abf2",
      applicationBuildId:
        "sha256:2e0f745a190e2d9652685d919de50ffcabd1af0ee141b0e277d18d1707fcbdc8",
      applicationArtifactSha256:
        "sha256:f2a92b5e4c125ddc190213a325103d82cf72ee4686349e69dafb3dbec96511ce",
      offlineCatalogTextSha256:
        "sha256:36194f0b06b891218ad5da4b974534c45bb1945da035c4cc3cc6bb1b6e9647c2",
      evidenceSha256:
        "sha256:7aaf1025434570628d0e4cda4f8d606fffacf842d82a754a8120ea3f66e8154e",
    } as const;
    const currentIdentities = {
      sourceManifestTextSha256:
        proof.evidence.authorities.sourceManifestTextSha256,
      completeCheckpointAuthoritySha256:
        proof.evidence.authorities.completeCheckpointAuthoritySha256,
      currentCheckpointMatchEvidenceSha256:
        proof.evidence.authorities.currentCheckpointMatchEvidenceSha256,
      safeSectionIdsSha256: proof.evidence.projection.safeSectionIdsSha256,
      withheldIncompatibleSectionIdsSha256:
        proof.evidence.projection.withheldIncompatibleSectionIdsSha256,
      narrationComparisonSha256:
        proof.evidence.projection.narrationComparisonSha256,
      canonicalValueSha256: proof.evidence.catalog.canonicalValueSha256,
      canonicalTextSha256: proof.evidence.catalog.canonicalTextSha256,
      envelopeTextSha256: proof.evidence.envelope.envelopeTextSha256,
      readerBuildId: proof.evidence.application.readerBuildId,
      applicationBuildId: proof.evidence.application.applicationBuildId,
      applicationArtifactSha256:
        proof.evidence.application.applicationArtifactSha256,
      offlineCatalogTextSha256:
        proof.evidence.application.offlineCatalogTextSha256,
      evidenceSha256: proof.evidence.evidenceSha256,
    } as const;
    expect(
      Object.keys(currentIdentities).filter(
        (key) =>
          currentIdentities[key as keyof typeof currentIdentities] !==
          priorCheckpointIdentities[
            key as keyof typeof priorCheckpointIdentities
          ],
      ),
    ).toEqual([
      "sourceManifestTextSha256",
      "completeCheckpointAuthoritySha256",
      "currentCheckpointMatchEvidenceSha256",
      "narrationComparisonSha256",
      "canonicalValueSha256",
      "canonicalTextSha256",
      "envelopeTextSha256",
      "readerBuildId",
      "applicationBuildId",
      "applicationArtifactSha256",
      "offlineCatalogTextSha256",
      "evidenceSha256",
    ]);
  });

  it("performs no network access, writes no repository bytes, and materializes no catalog", () => {
    expect(networkAttempts).toBe(0);
    expect(trackedBytesAfter).toBe(trackedBytesBefore);
    expect(logicalCatalogPresentAfter).toBe(logicalCatalogPresentBefore);
    expect(proof.evidence.integration).toEqual({
      syntheticConstructorEvidence: true,
      sourceDeclarationPresent: false,
      materializedCatalog: false,
      applicationConstructedInMemory: true,
      publicApplicationAssembly: false,
      hostIntegrated: false,
      routesActivated: false,
      audioParity: false,
      timingParity: false,
      publisherCheckpointCompatible: false,
      liveRemoteBytesVerified: false,
      networkAccessPerformed: false,
      durableWritesPerformed: false,
    });
    const source = fs.readFileSync(adapterPath, "utf8");
    expect(source).not.toMatch(/\bfetch\s*\(/u);
    expect(source).not.toMatch(
      /\b(?:appendFile|copyFile|mkdir|rename|rm|unlink|writeFile)Sync\s*\(/u,
    );
  });

  it("ignores visible untracked mutation but detects governed tracked-byte mutation", () => {
    const isolatedRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "coherence-audio-adapter-git-"),
    );
    try {
      const initialized = spawnSync("git", ["init", "--quiet"], {
        cwd: isolatedRoot,
        encoding: "utf8",
      });
      expect(initialized.status).toBe(0);
      fs.writeFileSync(path.join(isolatedRoot, "tracked.txt"), "tracked\n");
      const added = spawnSync("git", ["add", "--", "tracked.txt"], {
        cwd: isolatedRoot,
        encoding: "utf8",
      });
      expect(added.status).toBe(0);
      fs.writeFileSync(path.join(isolatedRoot, "untracked.txt"), "before\n");

      const status = spawnSync(
        "git",
        ["status", "--porcelain=v1", "--untracked-files=all"],
        { cwd: isolatedRoot, encoding: "utf8" },
      );
      expect(status.status).toBe(0);
      expect(status.stdout.split("\n")).toContain("?? untracked.txt");

      const beforeUntrackedMutation =
        trackedRepositoryByteProjection(isolatedRoot);
      fs.writeFileSync(
        path.join(isolatedRoot, "untracked.txt"),
        "changed concurrently\n",
      );
      expect(trackedRepositoryByteProjection(isolatedRoot)).toBe(
        beforeUntrackedMutation,
      );

      const trackedMutation = trackedRepositoryByteProjection(
        isolatedRoot,
        (relativePath, bytes) =>
          relativePath === "tracked.txt"
            ? Buffer.concat([bytes, Buffer.from("synthetic mutation", "utf8")])
            : bytes,
      );
      expect(trackedMutation).not.toBe(beforeUntrackedMutation);
    } finally {
      fs.rmSync(isolatedRoot, { recursive: true, force: true });
    }
  });

  it("rejects a stale raw-catalog audio version before construction", async () => {
    const rawCatalog = structuredClone(authorities.rawCatalog);
    const first = rawCatalog.sections[0]! as unknown as {
      audioVersionId: string;
    };
    first.audioVersionId = "v01-orientation-stale";
    await expect(
      adaptCoherencePublisherAudio({ ...authorities, rawCatalog }),
    ).rejects.toThrow(/raw audio version/u);
  });

  it("rejects checkpoint substitution before it can create ambiguous ownership", async () => {
    const checkpoints = [...structuredClone(authorities.checkpoints)];
    const replacement = checkpoints.find(
      ({ version, editorialId }) =>
        version === "2026-08-18-pr206-editorial-v1" &&
        editorialId === "volume-01",
    );
    const targetIndex = checkpoints.findIndex(
      ({ version }) => version === "2026-08-19-ctd-0005-v1",
    );
    expect(replacement).toBeDefined();
    expect(targetIndex).toBeGreaterThanOrEqual(0);
    checkpoints[targetIndex] = structuredClone(replacement!);
    await expect(
      adaptCoherencePublisherAudio({ ...authorities, checkpoints }),
    ).rejects.toThrow(/complete checkpoint authority identity/u);
  });

  it("rejects checkpoint root provenance drift outside the 525 current matches", async () => {
    const checkpoints = [...structuredClone(authorities.checkpoints)];
    checkpoints[0] = {
      ...checkpoints[0]!,
      sourceCommit: "0000000000000000000000000000000000000000",
    };
    await expect(
      adaptCoherencePublisherAudio({ ...authorities, checkpoints }),
    ).rejects.toThrow(/complete checkpoint authority identity/u);
  });

  it("rejects symbolic entries anywhere in the checkpoint authority tree", () => {
    fs.mkdirSync(generatedPublisherRoot, { recursive: true });
    const fixtureRoot = fs.mkdtempSync(
      path.join(generatedPublisherRoot, "audio-authority-test-"),
    );
    const checkpointRoot = path.join(fixtureRoot, "checkpoints");
    const realDirectory = path.join(fixtureRoot, "real");
    fs.mkdirSync(checkpointRoot);
    fs.mkdirSync(realDirectory);
    fs.symlinkSync(realDirectory, path.join(checkpointRoot, "private-sentinel"));
    try {
      expect(() =>
        assertCoherencePublisherAudioAuthorityPaths({
          checkpointsRoot: checkpointRoot,
        }),
      ).toThrow(/symbolic entry/u);
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("guards the CLI against arguments and does not disclose private errors", () => {
    const result = spawnSync(tsxPath, [adapterPath, "private-sentinel"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "publisher:audio:adapt: isolated proof failed.\n",
    );
    expect(result.stderr).not.toContain("private-sentinel");
  });

  it(
    "keeps private publication locations and narrator references out of evidence and CLI output",
    () => {
      const privateValues = [
        "zcnbjrewrcrbxkeishfw.supabase.co",
        authorities.checkpoints[0]!.narrator.referenceId,
        authorities.checkpoints[0]!.files[0]!.audio.objectKey,
        authorities.checkpoints[0]!.files[0]!.timings.objectKey,
        proof.catalog.voices[0]!.sections[0]!.href,
      ];
      const serializedEvidence = JSON.stringify(proof.evidence);
      for (const privateValue of privateValues) {
        expect(serializedEvidence).not.toContain(privateValue);
      }

      const result = spawnSync(tsxPath, [adapterPath], {
        cwd: repoRoot,
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(() => JSON.parse(result.stdout)).not.toThrow();
      for (const privateValue of privateValues) {
        expect(result.stdout).not.toContain(privateValue);
      }
    },
    15_000,
  );
});
