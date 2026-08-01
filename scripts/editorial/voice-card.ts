import fs from "node:fs";
import path from "node:path";

export const corpusVoiceCardReference = "../../corpus/voice-card.md";

export const requiredCorpusVoiceRules = [
  "Relationship to the reader",
  "Cadence",
  "Emotional temperature",
] as const;

export type EffectiveVoiceRule = {
  source: "Corpus" | "Volume";
  mode: "floor" | "override";
  claim: string;
};

const volumeOverrideFields = new Map<string, string>([
  ["Relationship to the reader", "Relationship to the reader"],
  ["Cadence override", "Cadence"],
  ["Emotional temperature override", "Emotional temperature"],
]);

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

function bulletFields(source: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const line of source.split("\n")) {
    const match = /^- ([^:]+):\s*(\S.*)$/.exec(line.trim());
    if (!match) continue;
    const [, label = "", value = ""] = match;
    if (fields.has(label)) {
      throw new Error(`voice card repeats the '${label}' field.`);
    }
    fields.set(label, value.trim());
  }
  return fields;
}

export function resolveEffectiveVoiceRules(
  corpusSource: string,
  volumeSource: string,
): EffectiveVoiceRule[] {
  const corpusFields = bulletFields(sectionBody(corpusSource, "Corpus rules"));
  const volumeFields = bulletFields(volumeSource);
  const rules: EffectiveVoiceRule[] = [];

  for (const rule of requiredCorpusVoiceRules) {
    const floor = corpusFields.get(rule);
    if (!floor) {
      throw new Error(`corpus voice card is missing the '${rule}' rule.`);
    }
    rules.push({
      source: "Corpus",
      mode: "floor",
      claim: `${rule}: ${floor}`,
    });

    const volumeField = [...volumeOverrideFields].find(
      ([, corpusRule]) => corpusRule === rule,
    )?.[0];
    const override = volumeField ? volumeFields.get(volumeField) : undefined;
    if (!volumeField || !override) {
      throw new Error(
        `volume voice card is missing the '${volumeField ?? rule}' override.`,
      );
    }
    rules.push({
      source: "Volume",
      mode: "override",
      claim: `${rule} override: ${override}`,
    });
  }
  return rules;
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
  const corpusApproval = sectionBody(corpusSource, "Approval");
  if (!corpusApproval) {
    throw new Error("corpus voice card needs a nonempty 'Approval' section.");
  }
  if (!/^- Editorial authority:\s*\S/im.test(corpusApproval)) {
    throw new Error("corpus voice card needs an Editorial authority.");
  }
  if (!/^- Card status:\s*Active\s*$/im.test(corpusApproval)) {
    throw new Error("corpus voice card must record an active Card status.");
  }

  resolveEffectiveVoiceRules(corpusSource, volumeSource);
  return `${corpusSource.trim()}\n\n${volumeSource.trim()}\n`;
}

export function resolveEffectiveVoiceCard(
  volumeCardPath: string,
): { source: string; corpusPath: string; rules: EffectiveVoiceRule[] } {
  const corpusPath = path.resolve(
    path.dirname(volumeCardPath),
    corpusVoiceCardReference,
  );
  const corpusSource = fs.readFileSync(corpusPath, "utf8");
  const volumeSource = fs.readFileSync(volumeCardPath, "utf8");
  return {
    source: effectiveVoiceCardFrom(corpusSource, volumeSource, volumeCardPath),
    corpusPath,
    rules: resolveEffectiveVoiceRules(corpusSource, volumeSource),
  };
}

export function effectiveVoiceRulesFrom(
  corpusSource: string,
  volumeSource?: string,
): EffectiveVoiceRule[] {
  if (volumeSource) {
    return resolveEffectiveVoiceRules(corpusSource, volumeSource);
  }
  const body = sectionBody(corpusSource, "Corpus rules");
  return body
    .split("\n")
    .map((line) => /^- ([^:]+):\s*(.+)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({
      source: "Corpus",
      mode: "floor",
      claim: `${match[1]}: ${match[2]}`,
    }));
}
