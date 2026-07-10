import { describe, expect, it } from "vitest";
import { classifyLine, lintText, PATTERNS } from "./lint-prose";

describe("classifyLine", () => {
  it("classifies headings, tables, and blockquotes", () => {
    expect(classifyLine("## §1 — The Ninth Turn")).toBe("heading");
    expect(classifyLine("| Term | Canonical form |")).toBe("table");
    expect(classifyLine("> *Draft 1 — rewritten against Canon Sheet v1.0.*")).toBe(
      "blockquote",
    );
  });

  it("classifies the series separator devices as separators", () => {
    expect(classifyLine(".  :  .")).toBe("separator");
    expect(classifyLine("—  ·  —")).toBe("separator");
    expect(classifyLine("∗   ∗   ∗")).toBe("separator");
    expect(classifyLine("⁂")).toBe("separator");
    expect(classifyLine("---")).toBe("separator");
  });

  it("classifies epigraph attribution lines separately from prose", () => {
    expect(classifyLine("— The Coherence Thesis, Vol. III")).toBe("attribution");
    expect(classifyLine("*— The Coherence Thesis, Vol. I*")).toBe("attribution");
    expect(classifyLine("The dams know the river.")).toBe("prose");
  });
});

describe("lintText", () => {
  it("counts banned patterns only in prose lines", () => {
    const text = [
      "## A heading — with a dash",
      "—  ·  —",
      "It began as an inquiry — one that links land and people.",
      "> A quoted draft note — with a dash.",
    ].join("\n");
    const report = lintText("test.md", text);
    expect(report.counts["em-dash"]).toBe(1);
    expect(report.emDashByContext.heading).toBe(1);
    expect(report.emDashByContext.separator).toBe(2);
    expect(report.emDashByContext.blockquote).toBe(1);
    expect(report.bannedTotal).toBe(1);
  });

  it("detects scaffold and intensifier patterns", () => {
    const text = [
      "This is not a moral preference. It is not a doctrine.",
      "Before moving on, it is worth pausing.",
      "The question is not whether it works but whether it lasts.",
      "It matters not merely here but everywhere, genuinely and precisely.",
    ].join("\n");
    const report = lintText("test.md", text);
    expect(report.counts["is-not-a"]).toBe(2);
    expect(report.counts["it-is-worth"]).toBe(1);
    expect(report.counts["question-reframe"]).toBe(1);
    expect(report.counts["not-merely"]).toBe(1);
    expect(report.counts["genuinely"]).toBe(1);
    expect(report.counts["precisely"]).toBe(1);
  });

  it("skips fenced code blocks", () => {
    const text = [
      "```bash",
      "npm run manuscripts:lint-prose -- sources/manuscripts/a.md",
      "```",
      "A clean prose line.",
    ].join("\n");
    const report = lintText("test.md", text);
    expect(report.counts["double-hyphen"]).toBe(0);
    expect(report.bannedTotal).toBe(0);
  });

  it("reports clean text as clean", () => {
    const report = lintText(
      "test.md",
      "We borrow steadiness from one another. We catch dysregulation from one another.",
    );
    expect(report.bannedTotal).toBe(0);
    for (const pattern of PATTERNS) {
      expect(report.counts[pattern.id]).toBe(0);
    }
  });
});
