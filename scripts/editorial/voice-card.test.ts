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

## Approval

- Editorial authority: Editorial agent, under author delegation.
- Card status: Active
`;

const volume = `# Volume

## Corpus inheritance

- Inherits: \`../../corpus/voice-card.md\`
- Where this volume departs: More direct address in the invitation.

## Identity

- Volume: I
- Relationship to the reader: More direct address in the invitation.

## Register

- Emotional temperature override: More warmth.

## Cadence

- Cadence override: Longer cumulative sentences.
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
      {
        source: "Corpus",
        mode: "floor",
        claim: "Relationship to the reader: Invite scrutiny.",
      },
      {
        source: "Corpus",
        mode: "floor",
        claim: "Cadence: Preserve meaningful variation.",
      },
      {
        source: "Corpus",
        mode: "floor",
        claim: "Emotional temperature: Earn hope.",
      },
    ]);
  });

  it("resolves each shared floor beside the volume override", () => {
    const resolved = effectiveVoiceRulesFrom(
      corpus,
      volume,
    );
    expect(resolved).toHaveLength(6);
    expect(resolved).toContainEqual({
      source: "Volume",
      mode: "override",
      claim:
        "Relationship to the reader override: More direct address in the invitation.",
    });
  });
});
