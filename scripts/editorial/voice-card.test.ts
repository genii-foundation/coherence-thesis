import { describe, expect, it } from "vitest";

import {
  effectiveVoiceCardFrom,
  effectiveVoiceRulesFrom,
} from "./voice-card";

const corpus = `# Corpus

## Corpus rules

- Relationship to the reader: Invite scrutiny.
- Cadence: Preserve meaningful variation.
- Emotional temperature: Earn hope.
`;

const volume = `# Volume

## Corpus inheritance

- Inherits: \`../../corpus/voice-card.md\`
- Where this volume departs: More direct address in the invitation.

## Identity

- Volume: I
`;

describe("effective voice cards", () => {
  it("combines the corpus floor with a volume overlay", () => {
    const effective = effectiveVoiceCardFrom(corpus, volume);
    expect(effective).toContain("Invite scrutiny.");
    expect(effective).toContain("More direct address in the invitation.");
  });

  it("requires a concrete volume departure", () => {
    expect(() =>
      effectiveVoiceCardFrom(
        corpus,
        volume.replace(
          "More direct address in the invitation.",
          "None.",
        ),
      ),
    ).toThrow(/must name a real volume-specific delta/);
  });

  it("extracts the shared rules for the calibration bench", () => {
    expect(effectiveVoiceRulesFrom(corpus)).toEqual([
      { source: "Corpus", claim: "Relationship to the reader: Invite scrutiny." },
      { source: "Corpus", claim: "Cadence: Preserve meaningful variation." },
      { source: "Corpus", claim: "Emotional temperature: Earn hope." },
    ]);
  });
});
