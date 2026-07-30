import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  extractSection,
  type CalibrationRecord,
} from "../../../../scripts/editorial/compare-render";
import {
  effectiveVoiceRulesFrom,
  resolveEffectiveVoiceCard,
} from "../../../../scripts/editorial/voice-card";

export type CalibrationBenchData = {
  baseText: string[];
  currentText: string[];
  record: CalibrationRecord;
};

/**
 * Resolve the durable record, protected baseline, effective voice card, and
 * current manuscript section used by both admin renderings of the bench.
 */
export function readCalibrationBench(section: string): CalibrationBenchData | null {
  if (!/^[a-z0-9-]+$/.test(section)) return null;

  const volume = `volume-${/^v(\d{2})-/.exec(section)?.[1] ?? ""}`;
  const root = process.cwd();
  const recordPath = path.join(
    root,
    "editorial/evidence/calibration",
    volume,
    `${section}.json`,
  );
  if (!existsSync(recordPath)) return null;

  const record = JSON.parse(readFileSync(recordPath, "utf8")) as CalibrationRecord;
  if (!record.generations?.some((generation) => Array.isArray(generation.text))) {
    return null;
  }

  const effective = resolveEffectiveVoiceCard(
    path.join(root, "editorial/sources/volumes", volume, "voice-card.md"),
  );
  record.effectiveVoiceCard = effectiveVoiceRulesFrom(
    readFileSync(effective.corpusPath, "utf8"),
  );

  const baselinePath = path.join(
    root,
    "editorial/evidence/reviews/volumes",
    volume,
    record.baseline.batchId,
    record.baseline.path,
  );
  const manuscriptPath = path.join(
    root,
    "editorial/sources/volumes",
    volume,
    "manuscript.md",
  );
  if (!existsSync(baselinePath) || !existsSync(manuscriptPath)) return null;

  const baseText = extractSection(
    readFileSync(baselinePath, "utf8"),
    record.sectionHeading,
  );
  if (!baseText.length) return null;

  return {
    baseText,
    currentText: extractSection(
      readFileSync(manuscriptPath, "utf8"),
      record.sectionHeading,
    ),
    record,
  };
}
