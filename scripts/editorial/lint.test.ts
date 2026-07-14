import { describe, expect, it } from "vitest";
import {
  auditEditorialFiles,
  auditMarkdown,
  duplicateSentenceFindings,
  extractEditorialSentenceRecords,
  extractEditorialSentences,
  formatEditorialAudit,
  parseEditorialArgs,
  shouldFailAudit,
} from "./lint";

describe("editorial prose audit", () => {
  it("extracts normalized prose sentences without headings or comments", () => {
    expect(
      extractEditorialSentences(
        [
          "# A Heading",
          "",
          "The first sentence wraps",
          "across two lines.",
          "",
          "<!-- hidden sentence. -->",
          "The second sentence remains.",
        ].join("\n"),
      ),
    ).toEqual([
      "The first sentence wraps across two lines.",
      "The second sentence remains.",
    ]);
  });

  it("preserves citation destinations beside normalized sentence text", () => {
    expect(
      extractEditorialSentenceRecords(
        "The source is [available here](https://example.com/paper.pdf). A bare https://example.com/note follows.",
      ),
    ).toEqual([
      {
        text: "The source is available here.",
        citationAttachments: ["https://example.com/paper.pdf"],
      },
      {
        text: "A bare https://example.com/note follows.",
        citationAttachments: ["https://example.com/note"],
      },
    ]);
  });

  it("finds prohibited punctuation while ignoring Markdown syntax and code", () => {
    const source = [
      "---",
      "title: Test -- Metadata",
      "---",
      "",
      "---",
      "",
      "A sentence\u2014with an em dash.",
      "A range from 2020\u20132024.",
      "A prose substitute -- with two hyphens.",
      "A URL https://example.com/a--b remains intact.",
      "`const value = \"a--b\"`",
      "```text",
      "ignored -- code",
      "```",
    ].join("\n");

    const findings = auditMarkdown(source, "test.md");
    expect(findings.filter((finding) => finding.severity === "error")).toEqual([
      expect.objectContaining({ ruleId: "punctuation.double-hyphen", line: 2 }),
      expect.objectContaining({ ruleId: "punctuation.em-dash", line: 7 }),
      expect.objectContaining({ ruleId: "punctuation.en-dash", line: 8 }),
      expect.objectContaining({ ruleId: "punctuation.double-hyphen", line: 9 }),
    ]);
  });

  it("flags deterministic slop signals without treating them as hard errors", () => {
    const source = [
      "Furthermore, it is important to note that this is not merely a test.",
      "",
      "Imagine a world where a revolutionary system changes everything.",
    ].join("\n");
    const findings = auditMarkdown(source, "test.md");
    const ruleIds = findings.map((finding) => finding.ruleId);

    expect(ruleIds).toContain("diction.stock-transition");
    expect(ruleIds).toContain("diction.throat-clearing");
    expect(ruleIds).toContain("rhetoric.false-contrast");
    expect(ruleIds).toContain("rhetoric.performed-intimacy");
    expect(ruleIds).toContain("diction.inflated-significance");
    expect(findings.every((finding) => finding.severity === "warning")).toBe(true);
  });

  it("flags copy defects, triads, repeated negation, and repeated section templates", () => {
    const source = [
      "## Refrain",
      "",
      "Not force. Not capture. Not control.",
      "",
      "The work requires patience, precision, and care.",
      "",
      "The the malformed ****line includes [verify source].",
      "",
      "## Refrain",
      "",
      "## Refrain",
    ].join("\n");
    const ruleIds = auditMarkdown(source, "test.md").map((finding) => finding.ruleId);

    expect(ruleIds).toEqual(
      expect.arrayContaining([
        "copy.duplicate-word",
        "copy.malformed-emphasis",
        "citation.verify-marker",
        "style.repeated-negation",
        "style.triad-candidate",
        "structure.repeated-heading",
      ]),
    );
  });

  it("finds duplicated substantive sentences across manuscript files", () => {
    const repeated =
      "An existence proof can make an impossible future feel available to practical work.";
    const findings = duplicateSentenceFindings([
      { file: "first.md", source: repeated },
      { file: "second.md", source: `An opening. ${repeated}` },
    ]);

    expect(findings).toEqual([
      expect.objectContaining({
        ruleId: "style.duplicate-sentence",
        file: "second.md",
        message: expect.stringContaining("first.md:1"),
      }),
    ]);
  });

  it("finds duplicated sentences despite different Markdown line wrapping", () => {
    const findings = duplicateSentenceFindings([
      {
        file: "wrapped.md",
        source:
          "An existence proof can make an impossible future feel\navailable to practical work.",
      },
      {
        file: "single-line.md",
        source:
          "An existence proof can make an impossible future feel available to practical work.",
      },
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual(
      expect.objectContaining({ file: "single-line.md" }),
    );
  });

  it("flags long sentences and abstraction clusters for judgment", () => {
    const abstractions =
      "Institutionalization, coordination, abstraction, development, and governance obscure who acts.";
    const longSentence = `${Array.from({ length: 56 }, () => "word").join(" ")}.`;
    const findings = auditMarkdown(`${abstractions}\n\n${longSentence}`, "test.md");

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "syntax.abstract-noun-cluster" }),
        expect.objectContaining({ ruleId: "syntax.long-sentence" }),
      ]),
    );
  });

  it("parses advisory and strict command modes", () => {
    expect(parseEditorialArgs([])).toMatchObject({
      failOn: "none",
      format: "text",
      paths: [],
      volumes: [],
    });
    expect(
      parseEditorialArgs([
        "--volume",
        "purposeful",
        "--format",
        "json",
        "--strict",
      ]),
    ).toMatchObject({
      volumes: ["purposeful"],
      format: "json",
      failOn: "error",
    });
  });

  it("fails strict mode only for prohibited punctuation", () => {
    const warningAudit = {
      files: ["test.md"],
      findings: [],
      counts: { files: 1, errors: 0, warnings: 2, total: 2, byRule: {} },
    };
    const errorAudit = {
      ...warningAudit,
      counts: { ...warningAudit.counts, errors: 1, total: 3 },
    };

    expect(shouldFailAudit(warningAudit, "error")).toBe(false);
    expect(shouldFailAudit(errorAudit, "error")).toBe(true);
    expect(shouldFailAudit(warningAudit, "warning")).toBe(true);
  });

  it("formats a compact rule summary by default", () => {
    const audit = auditEditorialFiles([]);
    expect(formatEditorialAudit(audit)).toContain("Editorial audit: 0 file(s)");
    expect(formatEditorialAudit(audit)).toContain("diagnostic signals");
  });
});
