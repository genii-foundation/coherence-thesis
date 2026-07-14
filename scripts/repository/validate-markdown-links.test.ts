import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  auditMarkdownLinks,
  formatMarkdownLinkAudit,
  validateMarkdownLinks,
} from "./validate-markdown-links";

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coherence-links-"));
  temporaryRoots.push(root);
  return root;
}

function writeFile(root: string, filePath: string, contents = "fixture\n"): void {
  const absolutePath = path.join(root, filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

describe("tracked Markdown link validation", () => {
  it("accepts existing local files and directories after removing suffixes", () => {
    const root = temporaryRoot();
    writeFile(root, "docs/guide.md");
    writeFile(root, "docs/guide with spaces.md");
    writeFile(root, "docs/foo](bar).md");
    writeFile(root, "docs/assets/cover one.png");
    fs.mkdirSync(path.join(root, "docs/reference"));
    writeFile(
      root,
      "docs/source.md",
      [
        "[Guide](guide.md#section)",
        "![Cover](assets/cover%20one.png?raw=1)",
        "[Reference directory](reference/)",
        "[![Nested cover](assets/cover%20one.png)](guide.md)",
        "[Titled guide](guide.md \"Helpful title\")",
        "[Angle guide](<guide with spaces.md>)",
        "[Balanced destination](foo](bar).md)",
        "[Guide reference][guide]",
        "![Reference cover][cover]",
        "[Collapsed][]",
        "[Shortcut]",
        "[guide]: guide.md \"Helpful title\"",
        "[cover]: assets/cover%20one.png",
        "[collapsed]: guide.md",
        "[shortcut]: guide.md",
      ].join("\n"),
    );

    const audit = auditMarkdownLinks({
      root,
      trackedPaths: ["docs/source.md"],
    });

    expect(audit).toMatchObject({
      filesChecked: 1,
      issues: [],
      referencesChecked: 12,
    });
  });

  it("reports missing reference definitions and missing reference targets", () => {
    const root = temporaryRoot();
    writeFile(
      root,
      "docs/source.md",
      [
        "[Missing definition][unknown]",
        "[Missing target][guide]",
        "[guide]: absent.md \"Reference title\"",
      ].join("\n"),
    );

    const audit = auditMarkdownLinks({
      root,
      trackedPaths: ["docs/source.md"],
    });

    expect(audit.referencesChecked).toBe(2);
    expect(audit.issues).toEqual([
      expect.objectContaining({
        destination: "unknown",
        line: 1,
        reason: "missing-definition",
        targetPath: "reference:unknown",
      }),
      expect.objectContaining({
        destination: "absent.md",
        line: 2,
        reason: "missing-target",
        targetPath: "docs/absent.md",
      }),
    ]);
  });

  it("ignores external, fragment, site route, inline code, and fenced code targets", () => {
    const root = temporaryRoot();
    writeFile(
      root,
      "README.md",
      [
        "[Web](https://example.com/path)",
        "[Mail](mailto:editor@example.com)",
        "[Fragment](#local)",
        "[Reader route](/manuscripts/one/)",
        "`[Inline example](missing-inline.md)`",
        "```markdown",
        "[Fenced example](missing-fenced.md)",
        "```",
      ].join("\n"),
    );

    expect(
      auditMarkdownLinks({ root, trackedPaths: ["README.md"] }),
    ).toMatchObject({ issues: [], referencesChecked: 0 });
  });

  it("reports missing, malformed, and repository escaping targets in stable order", () => {
    const root = temporaryRoot();
    writeFile(
      root,
      "docs/z.md",
      "First line.\n![Missing](missing.png)\n[Outside](../../outside.md)\n",
    );
    writeFile(root, "docs/a.md", "[Malformed](bad%ZZ.md)\n[Missing](none.md)\n");

    const audit = auditMarkdownLinks({
      root,
      trackedPaths: ["docs/z.md", "docs/a.md"],
    });

    expect(audit.issues).toEqual([
      expect.objectContaining({
        destination: "bad%ZZ.md",
        line: 1,
        reason: "invalid-encoding",
        sourcePath: "docs/a.md",
      }),
      expect.objectContaining({
        destination: "none.md",
        line: 2,
        reason: "missing-target",
        sourcePath: "docs/a.md",
        targetPath: "docs/none.md",
      }),
      expect.objectContaining({
        destination: "missing.png",
        kind: "image",
        line: 2,
        reason: "missing-target",
        sourcePath: "docs/z.md",
      }),
      expect.objectContaining({
        destination: "../../outside.md",
        line: 3,
        reason: "outside-repository",
        sourcePath: "docs/z.md",
      }),
    ]);
    expect(formatMarkdownLinkAudit(audit)).toContain(
      "docs/a.md:1:1 link \"bad%ZZ.md\" invalid-encoding",
    );
    expect(() =>
      validateMarkdownLinks({ root, trackedPaths: ["docs/z.md"] }),
    ).toThrow("Markdown link validation failed");
  });

  it("checks only the supplied tracked Markdown paths", () => {
    const root = temporaryRoot();
    writeFile(root, "tracked.md", "[Present](target.md)\n");
    writeFile(root, "target.md");
    writeFile(root, "untracked.md", "[Missing](absent.md)\n");
    writeFile(root, "ignored.txt", "[Missing](absent.md)\n");

    const audit = auditMarkdownLinks({
      root,
      trackedPaths: ["tracked.md", "ignored.txt"],
    });

    expect(audit).toMatchObject({
      filesChecked: 1,
      issues: [],
      referencesChecked: 1,
    });
  });
});
