import fs from "node:fs";
import {
  estimatedAudioDurationForWords,
  recordedAudioDurationSummary,
  type AudioClipManifest,
} from "../../src/lib/audio-manifest";
import { textForAudio } from "../../src/lib/audio-text";
import { audioManifestSourcePath } from "../repository/paths";
import { wordCount } from "./io";
import type { CompiledCatalog } from "./types";

function readAudioManifest(): AudioClipManifest {
  return JSON.parse(
    fs.readFileSync(audioManifestSourcePath, "utf8"),
  ) as AudioClipManifest;
}

export function applyRecordedAudioDurations(
  catalog: CompiledCatalog,
  manifest: AudioClipManifest = readAudioManifest(),
): void {
  const summary = recordedAudioDurationSummary(manifest, catalog.sections);

  for (const section of catalog.sections) {
    const durationSeconds = summary.durationSecondsBySection.get(
      section.sectionId,
    );
    if (durationSeconds !== undefined) {
      section.audioDurationSeconds = durationSeconds;
    } else {
      delete section.audioDurationSeconds;
    }
  }
  catalog.stats.audioDurationSeconds = summary.durationSeconds;
  catalog.stats.recordedAudioSectionCount = summary.sectionCount;
  catalog.stats.estimatedAudioDurationSeconds =
    estimatedAudioDurationForWords(
      manifest,
      catalog.sections.reduce(
        (total, section) => total + wordCount(textForAudio(section)),
        0,
      ),
    ) ?? 0;
}
