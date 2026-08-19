#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type {
  AudioClipManifest,
  AudioClipSection,
} from "../../src/lib/audio-manifest";
import { buildSectionsFromSource } from "../manuscripts/import-markdown";
import {
  audioInputHash,
  audioVersionId,
  normalizeNewlines,
  stripMarkdown,
  structuralPartOpenerIds,
  type MarkdownDocument,
  type VolumeConfig,
} from "../manuscripts/shared";
import {
  audioPublicationCheckpointsRoot,
  editorialVolumeIds,
  repoRoot,
} from "../repository/paths";
import {
  validateAudioPublicationCheckpoint,
  type AudioPublicationCheckpoint,
} from "./audio-publication-checkpoints";
import { validateCurrentAudioManifest } from "./promote-audio-volume";

const manuscriptSourcePathPattern =
  /^editorial\/sources\/volumes\/(volume-0[1-9])\/(?:manuscript\.md|volume\.json)$/;

export type ManuscriptAudioSection = {
  editorialId: string;
  volumeId: string;
  sectionId: string;
  title: string;
  audioVersionId: string;
};

export type ChangedManuscriptAudio = ManuscriptAudioSection & {
  previousAudioVersionId: string | null;
};

export type ManuscriptAudioPublicationIssue = ChangedManuscriptAudio & {
  voiceId: string;
  publishedAudioVersionId: string | null;
  reason: "missing-or-stale-manifest" | "missing-checkpoint-evidence";
};

function git(args: string[]): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function gitShow(revision: string, filePath: string): string {
  return execFileSync("git", ["show", `${revision}:${filePath}`], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function volumeManifestPath(editorialId: string): string {
  return `editorial/sources/volumes/${editorialId}/volume.json`;
}

function manuscriptPath(editorialId: string): string {
  return `editorial/sources/volumes/${editorialId}/manuscript.md`;
}

function parseVolumeConfig(value: string, source: string): VolumeConfig {
  const config = JSON.parse(value) as VolumeConfig;
  if (
    config.schemaVersion !== 1 ||
    !editorialVolumeIds.includes(config.editorialId) ||
    !config.volumeId ||
    !config.title ||
    !Number.isInteger(config.order) ||
    !Array.isArray(config.import?.startMarkers)
  ) {
    throw new Error(`${source}: invalid volume configuration.`);
  }
  return config;
}

function markdownBody(lines: string[]): string {
  const first = lines.findIndex((line) => line.trim());
  const last = lines.findLastIndex((line) => line.trim());
  if (first < 0 || last < first) return "";
  return `${normalizeNewlines(lines.slice(first, last + 1).join("\n"))}\n`;
}

function structuralInputs(documents: MarkdownDocument[]): {
  chapterSectionCounts: Map<string, number>;
  partChapters: Map<string, Set<string>>;
} {
  const chapterSectionCounts = new Map<string, number>();
  const partChapters = new Map<string, Set<string>>();
  for (const document of documents) {
    const frontmatter = document.frontmatter;
    const chapterKey = `${frontmatter.volumeId}:${frontmatter.partId}:${frontmatter.chapterId}`;
    const partKey = `${frontmatter.volumeId}:${frontmatter.partId}`;
    chapterSectionCounts.set(
      chapterKey,
      (chapterSectionCounts.get(chapterKey) ?? 0) + 1,
    );
    const chapters = partChapters.get(partKey) ?? new Set<string>();
    chapters.add(frontmatter.chapterId);
    partChapters.set(partKey, chapters);
  }
  return { chapterSectionCounts, partChapters };
}

export function manuscriptAudioSections(
  config: VolumeConfig,
  source: string,
): ManuscriptAudioSection[] {
  const sourceHash = "publication-audio-comparison";
  const sections = buildSectionsFromSource(
    config,
    source,
    config.sourcePath,
    sourceHash,
  );
  const documents = sections.map(
    (section): MarkdownDocument => ({
      filePath: config.sourcePath,
      relativePath: `${section.frontmatter.sectionId}.md`,
      frontmatter: section.frontmatter,
      body: markdownBody(section.body),
    }),
  );
  const { chapterSectionCounts, partChapters } = structuralInputs(documents);
  const skipped = structuralPartOpenerIds(
    documents,
    chapterSectionCounts,
    partChapters,
  );

  return documents
    .filter((document) => !skipped.has(document.frontmatter.sectionId))
    .map((document) => {
      const title = document.frontmatter.title;
      const text = stripMarkdown(document.body);
      return {
        editorialId: config.editorialId,
        volumeId: config.volumeId,
        sectionId: document.frontmatter.sectionId,
        title,
        audioVersionId: audioVersionId(
          document.frontmatter.sectionId,
          audioInputHash(title, text),
        ),
      };
    });
}

export function changedManuscriptAudio(
  previous: ManuscriptAudioSection[],
  current: ManuscriptAudioSection[],
): ChangedManuscriptAudio[] {
  const previousBySection = new Map(
    previous.map((section) => [section.sectionId, section]),
  );
  return current
    .filter(
      (section) =>
        previousBySection.get(section.sectionId)?.audioVersionId !==
        section.audioVersionId,
    )
    .map((section) => ({
      ...section,
      previousAudioVersionId:
        previousBySection.get(section.sectionId)?.audioVersionId ?? null,
    }));
}

function publishedSection(
  sections: AudioClipSection[],
  sectionId: string,
): AudioClipSection | null {
  return sections.find((section) => section.sectionId === sectionId) ?? null;
}

export function manuscriptAudioPublicationIssues(
  manifest: AudioClipManifest,
  changed: ChangedManuscriptAudio[],
  checkpoints?: AudioPublicationCheckpoint[],
): ManuscriptAudioPublicationIssue[] {
  return manifest.voices.flatMap((voice) =>
    changed.flatMap((section): ManuscriptAudioPublicationIssue[] => {
      const published = publishedSection(voice.sections, section.sectionId);
      if (published?.audioVersionId !== section.audioVersionId) {
        return [
          {
            ...section,
            voiceId: voice.id,
            publishedAudioVersionId: published?.audioVersionId ?? null,
            reason: "missing-or-stale-manifest" as const,
          },
        ];
      }
      if (
        checkpoints &&
        !checkpoints.some((checkpoint) =>
          checkpointSupportsManifestSection(checkpoint, voice.id, published),
        )
      ) {
        return [
          {
            ...section,
            voiceId: voice.id,
            publishedAudioVersionId: published.audioVersionId,
            reason: "missing-checkpoint-evidence" as const,
          },
        ];
      }
      return [];
    }),
  );
}

function checkpointSupportsManifestSection(
  checkpoint: AudioPublicationCheckpoint,
  voiceId: string,
  published: AudioClipSection,
): boolean {
  if (checkpoint.narrator.id !== voiceId) return false;
  const file = checkpoint.files.find(
    (candidate) =>
      candidate.sectionId === published.sectionId &&
      candidate.audioVersionId === published.audioVersionId,
  );
  if (!file) return false;
  let pathname: string;
  try {
    pathname = new URL(published.href).pathname;
  } catch {
    return false;
  }
  return (
    pathname.endsWith(`/${file.audio.objectKey}`) &&
    published.byteSize === file.audio.byteSize &&
    published.timingsByteSize === file.timings.byteSize &&
    published.durationSeconds === file.durationSeconds
  );
}

export function removedPublishedNarrators(
  previous: AudioClipManifest,
  current: AudioClipManifest,
): string[] {
  const currentIds = new Set(current.voices.map((voice) => voice.id));
  return previous.voices
    .filter((voice) => voice.sections.length > 0 && !currentIds.has(voice.id))
    .map((voice) => voice.id)
    .sort();
}

function readAudioPublicationCheckpoints(): AudioPublicationCheckpoint[] {
  if (!fs.existsSync(audioPublicationCheckpointsRoot)) return [];
  const checkpointPaths = fs
    .readdirSync(audioPublicationCheckpointsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const directory = path.join(audioPublicationCheckpointsRoot, entry.name);
      return fs
        .readdirSync(directory, { withFileTypes: true })
        .filter((file) => file.isFile() && file.name.endsWith(".json"))
        .map((file) => path.join(directory, file.name));
    })
    .sort();
  return checkpointPaths.map((checkpointPath) =>
    validateAudioPublicationCheckpoint(
      JSON.parse(fs.readFileSync(checkpointPath, "utf8")) as unknown,
      path.relative(repoRoot, checkpointPath),
    ),
  );
}

function readCurrentAudioManifest(): AudioClipManifest {
  return validateCurrentAudioManifest(
    JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, "publishing/audio/manifest.json"),
        "utf8",
      ),
    ) as unknown,
  );
}

function readAudioManifestAtRevision(revision: string): AudioClipManifest {
  return validateCurrentAudioManifest(
    JSON.parse(gitShow(revision, "publishing/audio/manifest.json")) as unknown,
  );
}

export function formatRemovedNarratorFailure(
  baseRevision: string,
  narratorIds: string[],
): string {
  return [
    `Manuscript publication is blocked. Public narrator${narratorIds.length === 1 ? "" : "s"} ` +
      `${narratorIds.join(", ")} existed at ${baseRevision} but were removed from the current audio manifest.`,
    "Restore every published narrator and republish its changed sections. Removing a narrator cannot waive manuscript audio parity.",
  ].join("\n");
}

function issueDescription(issue: ManuscriptAudioPublicationIssue): string {
  if (issue.reason === "missing-checkpoint-evidence") {
    return (
      `${issue.voiceId}/${issue.sectionId}: manifest has ${issue.audioVersionId}, ` +
      "but no validated remotely verified checkpoint matches its object path, sizes, and duration"
    );
  }
  return (
    `${issue.voiceId}/${issue.sectionId}: expected ${issue.audioVersionId}; ` +
    `published ${issue.publishedAudioVersionId ?? "nothing"}`
  );
}

export function formatAudioPublicationFailure(
  baseRevision: string,
  issues: ManuscriptAudioPublicationIssue[],
): string {
  const sectionIds = [...new Set(issues.map((issue) => issue.sectionId))];
  const details = issues
    .map((issue) => `  - ${issueDescription(issue)}`)
    .join("\n");
  return [
    `Manuscript publication is blocked. ${sectionIds.length.toLocaleString()} spoken ` +
      `segment${sectionIds.length === 1 ? " has" : "s have"} changed since ${baseRevision}, ` +
      "but the public audio manifest is not current:",
    details,
    "",
    "Republish the affected audio before merge or production deployment:",
    `  1. Generate a delta run with --sections ${sectionIds.join(",")}.`,
    "  2. Upload each affected volume and record immutable, remotely verified checkpoints.",
    `  3. Promote exactly those sections with npm run audio:promote-sections -- --version <immutable-version> --sections ${sectionIds.join(",")} --write.`,
    `  4. Rerun npm run audio:verify-manuscript-publication -- --base ${baseRevision}.`,
    "",
    "Follow publishing/guides/fish-audiobook-generation.md. Do not waive this gate or hide stale audio by removing manifest entries.",
  ].join("\n");
}

function optionValue(args: string[], name: string): string | undefined {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export function resolveAudioPublicationBase(args: string[]): string {
  const requested =
    optionValue(args, "--base") ?? process.env.AUDIO_PUBLICATION_BASE_SHA;
  if (requested) {
    return git(["rev-parse", "--verify", `${requested}^{commit}`]);
  }
  try {
    const mergeBase = git(["merge-base", "HEAD", "origin/main"]);
    const head = git(["rev-parse", "HEAD"]);
    return mergeBase === head ? git(["rev-parse", "HEAD^"]) : mergeBase;
  } catch {
    return git(["rev-parse", "HEAD^"]);
  }
}

export function changedManuscriptPaths(baseRevision: string): string[] {
  const output = git([
    "diff",
    "--name-only",
    "--diff-filter=ACMRT",
    baseRevision,
    "--",
    "editorial/sources/volumes/*/manuscript.md",
    "editorial/sources/volumes/*/volume.json",
  ]);
  return output ? output.split("\n").filter(Boolean).sort() : [];
}

export function verifyManuscriptAudioPublication(
  baseRevision: string,
): { changedSections: number; changedVolumes: number } {
  const paths = changedManuscriptPaths(baseRevision);
  if (paths.length === 0) return { changedSections: 0, changedVolumes: 0 };
  const editorialIds = [
    ...new Set(
      paths.map((sourcePath) => {
        const match = manuscriptSourcePathPattern.exec(sourcePath);
        if (!match) {
          throw new Error(`Unexpected manuscript source path: ${sourcePath}`);
        }
        return match[1]!;
      }),
    ),
  ].sort();

  const changed: ChangedManuscriptAudio[] = [];
  for (const editorialId of editorialIds) {
    const sourcePath = manuscriptPath(editorialId);
    const configPath = volumeManifestPath(editorialId);
    const previousConfig = parseVolumeConfig(
      gitShow(baseRevision, configPath),
      `${baseRevision}:${configPath}`,
    );
    const currentConfig = parseVolumeConfig(
      fs.readFileSync(path.join(repoRoot, configPath), "utf8"),
      configPath,
    );
    const previousSections = manuscriptAudioSections(
      previousConfig,
      gitShow(baseRevision, manuscriptPath(editorialId)),
    );
    const currentSections = manuscriptAudioSections(
      currentConfig,
      fs.readFileSync(path.join(repoRoot, sourcePath), "utf8"),
    );
    changed.push(...changedManuscriptAudio(previousSections, currentSections));
  }

  if (changed.length === 0) {
    return { changedSections: 0, changedVolumes: editorialIds.length };
  }
  const manifest = readCurrentAudioManifest();
  const removedNarrators = removedPublishedNarrators(
    readAudioManifestAtRevision(baseRevision),
    manifest,
  );
  if (removedNarrators.length > 0) {
    throw new Error(
      formatRemovedNarratorFailure(baseRevision, removedNarrators),
    );
  }
  const issues = manuscriptAudioPublicationIssues(
    manifest,
    changed,
    readAudioPublicationCheckpoints(),
  );
  if (issues.length > 0) {
    throw new Error(formatAudioPublicationFailure(baseRevision, issues));
  }
  return {
    changedSections: changed.length,
    changedVolumes: editorialIds.length,
  };
}

function main(): void {
  const baseRevision = resolveAudioPublicationBase(process.argv.slice(2));
  const result = verifyManuscriptAudioPublication(baseRevision);
  process.stdout.write(
    result.changedSections === 0
      ? `Audio publication is current. No spoken manuscript segments changed across ${result.changedVolumes.toLocaleString()} changed volume${result.changedVolumes === 1 ? "" : "s"}.\n`
      : `Audio publication is current for ${result.changedSections.toLocaleString()} changed spoken segment${result.changedSections === 1 ? "" : "s"} across ${result.changedVolumes.toLocaleString()} volume${result.changedVolumes === 1 ? "" : "s"}.\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `audio:verify-manuscript-publication: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
