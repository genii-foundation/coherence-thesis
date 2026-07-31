import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildSectionHistories,
  editorialStandardPath,
  type GuidelineHistoryEntry,
  parseEditorialStandard,
  parseGuidelineHistoryLog,
  readEditorialVoiceCards,
} from "./guidelinesData";

describe("editorial guidelines data", () => {
  it("reads the current standard into navigable sections and named rules", () => {
    const markdown = readFileSync(
      path.join(process.cwd(), editorialStandardPath),
      "utf8",
    );
    const standard = parseEditorialStandard(markdown);

    expect(standard.sections.map((section) => section.title)).toEqual([
      "Contents",
      "Editorial aim",
      "Hierarchy of fidelity",
      "Punctuation standard",
      "AI slop pattern catalog",
      "Philosophical prose standard",
      "Poetic and narrative standard",
      "Sentence-level method",
      "Paragraph and section method",
      "Fact, quotation, and citation handling",
      "Review commentary",
      "Acceptance checklist",
      "Rule index",
    ]);
    expect(standard.rules).toHaveLength(13);
    expect(standard.rules.at(-1)).toMatchObject({ id: "R-DEIXIS" });
    expect(standard.catalogCategories).toBe(29);
    expect(standard.lineCount).toBe(567);
  });

  it("pairs each Git revision with its line movement, rules, and rename", () => {
    const history =
      parseGuidelineHistoryLog(`@@@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\u001f2026-07-30T03:03:18-07:00\u001fadd a rule

11\t0\teditorial/method/standard.md

diff --git a/editorial/method/standard.md b/editorial/method/standard.md
+++ b/editorial/method/standard.md
+### A settled decision \`R-LEDGER-WINS\`
@@@bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\u001f2026-07-29T21:13:57-07:00\u001fmove the method

1\t1\teditorial/{standards/editorial.md => method/standard.md}

rename from editorial/standards/editorial.md
rename to editorial/method/standard.md
`);

    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      shortHash: "aaaaaaa",
      additions: 11,
      deletions: 0,
      addedRules: ["R-LEDGER-WINS"],
    });
    expect(history[1]).toMatchObject({
      shortHash: "bbbbbbb",
      additions: 1,
      deletions: 1,
      renamedFrom: "editorial/standards/editorial.md",
      renamedTo: "editorial/method/standard.md",
    });
  });

  it("traces each section from its introduction through substantive changes", () => {
    const introduced = "## 1. Editorial aim\n\nProtect meaning.";
    const revised =
      "## 1. Editorial aim\n\nProtect meaning and voice.\n\n### Authority `R-VOICE-BIND`";
    const entries: GuidelineHistoryEntry[] = [
      {
        hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        shortHash: "bbbbbbb",
        date: "2026-07-12T12:00:00-07:00",
        subject: "revise the aim",
        additions: 2,
        deletions: 1,
        changedPath: editorialStandardPath,
        addedRules: ["R-VOICE-BIND"],
      },
      {
        hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        shortHash: "aaaaaaa",
        date: "2026-07-11T12:00:00-07:00",
        subject: "introduce the aim",
        additions: 3,
        deletions: 0,
        changedPath: editorialStandardPath,
        addedRules: [],
      },
    ];
    const currentSections = parseEditorialStandard(revised).sections;
    const histories = buildSectionHistories(currentSections, [
      { entry: entries[0]!, markdown: revised },
      { entry: entries[1]!, markdown: introduced },
    ]);

    expect(histories["editorial-aim"]!.revisions).toMatchObject([
      {
        kind: "introduced",
        shortHash: "aaaaaaa",
        addedRules: [],
      },
      {
        kind: "revised",
        shortHash: "bbbbbbb",
        addedRules: ["R-VOICE-BIND"],
      },
    ]);
  });

  it("reads the corpus and nine volume voice cards from canonical sources", () => {
    const voiceCards = readEditorialVoiceCards();

    expect(voiceCards).toHaveLength(10);
    expect(voiceCards[0]).toMatchObject({
      id: "corpus",
      label: "Global",
      title: "Coherence Thesis",
      path: "editorial/sources/corpus/voice-card.md",
      status: "Active",
    });
    expect(voiceCards[1]).toMatchObject({
      id: "volume-01",
      label: "Volume I",
      title: "Humanity's Most Viable Future",
      status: "Active",
    });
    expect(voiceCards.at(-1)).toMatchObject({
      id: "volume-09",
      label: "Volume IX",
      title: "The Cardinal Scale",
      status: "Pending",
    });
    expect(voiceCards.every((voiceCard) => voiceCard.markdown.length > 0)).toBe(
      true,
    );
  });
});
