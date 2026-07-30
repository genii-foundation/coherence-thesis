import fs from "node:fs";
import path from "node:path";

export const corpusVoiceCardReference = "../../corpus/voice-card.md";

export const requiredCorpusVoiceRules = [
  "Relationship to the reader",
  "Cadence",
  "Emotional temperature",
] as const;

export type EffectiveVoiceRule = {
  source: "Corpus";
  claim: string;
};

function sectionBody(source: string, heading: string): string {
  const match = new RegExp(
    `^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
    "m",
  ).exec(source);
  if (!match) return "";
  const start = (match.index ?? 0) + match[0].length;
  const remainder = source.slice(start);
  const next = /^## /m.exec(remainder);
  return remainder.slice(0, next?.index ?? remainder.length).trim();
}

export function effectiveVoiceCardFrom(
  corpusSource: string,
  volumeSource: string,
  volumeFile = "voice-card.md",
): string {
  const inheritance = sectionBody(volumeSource, "Corpus inheritance");
  if (!inheritance) {
    throw new Error(
      `${volumeFile}: voice card needs a nonempty 'Corpus inheritance' section.`,
    );
  }

  const inheritedPath =
    /^- Inherits:\s*`?([^`\r\n]+)`?\s*$/im.exec(inheritance)?.[1]?.trim();
  if (inheritedPath !== corpusVoiceCardReference) {
    throw new Error(
      `${volumeFile}: voice card must inherit ${corpusVoiceCardReference}.`,
    );
  }

  const departure =
    /^- Where this volume departs:\s*(.+?)\s*$/im.exec(inheritance)?.[1]?.trim();
  if (!departure || /^none[.!]?$/i.test(departure)) {
    throw new Error(
      `${volumeFile}: 'Where this volume departs' must name a real volume-specific delta.`,
    );
  }

  const corpusRules = sectionBody(corpusSource, "Corpus rules");
  if (!corpusRules) {
    throw new Error("corpus voice card needs a nonempty 'Corpus rules' section.");
  }
  for (const rule of requiredCorpusVoiceRules) {
    if (!new RegExp(`^- ${rule}:\\s*\\S`, "m").test(corpusRules)) {
      throw new Error(`corpus voice card is missing the '${rule}' rule.`);
    }
  }

  return `${corpusSource.trim()}\n\n${volumeSource.trim()}\n`;
}

export function resolveEffectiveVoiceCard(
  volumeCardPath: string,
): { source: string; corpusPath: string } {
  const corpusPath = path.resolve(
    path.dirname(volumeCardPath),
    corpusVoiceCardReference,
  );
  const corpusSource = fs.readFileSync(corpusPath, "utf8");
  const volumeSource = fs.readFileSync(volumeCardPath, "utf8");
  return {
    source: effectiveVoiceCardFrom(corpusSource, volumeSource, volumeCardPath),
    corpusPath,
  };
}

export function effectiveVoiceRulesFrom(
  corpusSource: string,
): EffectiveVoiceRule[] {
  const body = sectionBody(corpusSource, "Corpus rules");
  return body
    .split("\n")
    .map((line) => /^- ([^:]+):\s*(.+)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({
      source: "Corpus",
      claim: `${match[1]}: ${match[2]}`,
    }));
}
