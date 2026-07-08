import fs from "node:fs";
import path from "node:path";
import {
  artifactsAudioRoot,
  relativeToRepo,
  type FishRunManifest,
} from "./fish-generator";
import { ensureDir, repoRoot, writeJson } from "../manuscripts/shared";
import type { AudioClipManifest, AudioClipVoice } from "../../src/lib/audio-manifest";

type Options = {
  runId: string;
  publicBase: string;
  output: string;
};

function optionValue(args: string[], name: string): string | undefined {
  const prefix = `${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseCli(args: string[]): Options {
  const runId = optionValue(args, "--run-id");
  if (!runId) throw new Error("Set --run-id to a generated Fish audio run.");
  return {
    runId,
    publicBase: optionValue(args, "--public-base") ?? `/audio/${runId}`,
    output:
      optionValue(args, "--output") ??
      path.join(repoRoot, "public/data/audio-manifest.json"),
  };
}

function publicHref(publicBase: string, relativeOutputPath: string): string {
  return [publicBase.replace(/\/+$/g, ""), relativeOutputPath]
    .filter(Boolean)
    .join("/")
    .replace(/\\/g, "/");
}

export function createAudioClipManifest(input: {
  run: FishRunManifest;
  publicBase: string;
}): AudioClipManifest {
  const files = input.run.files.filter(
    (file) => !file.error && (file.generatedAt || file.skipped),
  );
  const voiceById = new Map<string, AudioClipVoice>();
  for (const voice of input.run.voices) {
    voiceById.set(voice.id, {
      id: voice.id,
      label: voice.label,
      provider: input.run.provider,
      model: input.run.model,
      sections: [],
    });
  }
  for (const file of files) {
    const voice = voiceById.get(file.voiceId);
    if (!voice) continue;
    voice.sections.push({
      sectionId: file.sectionId,
      audioVersionId: file.audioVersionId,
      href: publicHref(input.publicBase, file.relativeOutputPath),
      byteSize: file.byteSize,
      durationSeconds: file.durationSeconds,
    });
  }
  return {
    version: 1,
    generatedAt: input.run.generatedAt,
    voices: Array.from(voiceById.values()),
  };
}

function main() {
  const options = parseCli(process.argv.slice(2));
  const runManifestPath = path.join(artifactsAudioRoot(), options.runId, "manifest.json");
  const run = JSON.parse(fs.readFileSync(runManifestPath, "utf8")) as FishRunManifest;
  const manifest = createAudioClipManifest({
    run,
    publicBase: options.publicBase,
  });
  ensureDir(path.dirname(options.output));
  writeJson(options.output, manifest);
  console.log(
    JSON.stringify(
      {
        output: relativeToRepo(options.output),
        voices: manifest.voices.length,
        clips: manifest.voices.reduce(
          (total, voice) => total + voice.sections.length,
          0,
        ),
      },
      null,
      2,
    ),
  );
}

if (process.argv[1]?.endsWith("fish-publish-manifest.ts")) {
  main();
}
