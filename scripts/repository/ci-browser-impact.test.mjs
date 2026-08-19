import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyBrowserImpact,
  manuscriptStructure,
  overviewStructure,
} from "./ci-browser-impact.mjs";

const readMissing = async () => null;

describe("CI browser impact classification", () => {
  it("skips agent-only, instruction-only, Updates-only, and known agent validator changes", async () => {
    const result = await classifyBrowserImpact(
      [
        ".agents/skills/coherence-preview/SKILL.md",
        "AGENTS.md",
        "publishing/updates/snapshot.json",
        "scripts/repository/agent-assets.test.ts",
        "scripts/repository/agent-assets.ts",
      ],
      readMissing,
    );

    expect(result.runE2e).toBe(false);
  });

  it("runs fail closed for application, workflow, and unknown changes", async () => {
    for (const filePath of [
      "src/app/page.tsx",
      ".github/workflows/ci.yml",
      "scripts/repository/new-tool.ts",
    ]) {
      const result = await classifyBrowserImpact([filePath], readMissing);
      expect(result).toMatchObject({ runE2e: true });
    }
  });

  it("skips prose-only manuscript edits", async () => {
    const base = "# PART ONE\n## The Seed\n\nOriginal introduction.\n\n## Chapter\nOriginal prose.\n";
    const head = "# PART ONE\n## The Seed\n\nOriginal introduction.\n\n## Chapter\nRevised prose.\n";
    const result = await classifyBrowserImpact(
      ["editorial/sources/volumes/volume-01/manuscript.md"],
      async (revision) => (revision === "base" ? base : head),
    );

    expect(result.runE2e).toBe(false);
  });

  it("runs E2E for changed headings and standalone bold sections", async () => {
    for (const [base, head] of [
      ["## Chapter\nBody.\n", "## Renamed Chapter\nBody.\n"],
      ["## Chapter\nBody.\n", "## Chapter\n\n**New Section**\nBody.\n"],
    ]) {
      const result = await classifyBrowserImpact(
        ["editorial/sources/volumes/volume-01/manuscript.md"],
        async (revision) => (revision === "base" ? base : head),
      );
      expect(result.runE2e).toBe(true);
    }
  });

  it("runs E2E when part-introduction text changes", async () => {
    const base = "# PART ONE\n## The Seed\n\nPart introduction.\n\n## Chapter\nBody.\n";
    const head = "# PART ONE\n## The Seed\n\nLonger part introduction.\n\n## Chapter\nBody.\n";

    expect(manuscriptStructure(base)).not.toEqual(manuscriptStructure(head));
    const result = await classifyBrowserImpact(
      ["editorial/sources/volumes/volume-01/manuscript.md"],
      async (revision) => (revision === "base" ? base : head),
    );
    expect(result.runE2e).toBe(true);
  });

  it("treats prose immediately after a bare part label as a part introduction", () => {
    const base = "# PART ONE\n\nPart introduction.\n\n## Chapter\nBody.\n";
    const head = "# PART ONE\n\nRevised part introduction.\n\n## Chapter\nBody.\n";

    expect(manuscriptStructure(base)).not.toEqual(manuscriptStructure(head));
  });

  it("runs E2E for volume metadata, continuity, audio, and manuscript add or removal", async () => {
    for (const filePath of [
      "editorial/sources/volumes/volume-01/volume.json",
      "publishing/continuity/sections.json",
      "publishing/audio/manifest.json",
      "editorial/sources/corpus/semantic-links.json",
    ]) {
      expect((await classifyBrowserImpact([filePath], readMissing)).runE2e).toBe(true);
    }

    expect(
      (
        await classifyBrowserImpact(
          ["editorial/sources/volumes/volume-01/manuscript.md"],
          readMissing,
        )
      ).runE2e,
    ).toBe(true);
  });

  it("skips overview copy but runs E2E for overview structure and reference changes", async () => {
    const base = JSON.stringify({
      title: "Overview",
      nodes: [{ id: "one", summary: "Original", references: [{ sectionId: "v01-one" }] }],
    });
    const copyEdit = JSON.stringify({
      title: "A clearer overview",
      nodes: [{ id: "one", summary: "Revised", references: [{ sectionId: "v01-one" }] }],
    });
    const structuralEdit = JSON.stringify({
      title: "Overview",
      nodes: [{ id: "one", summary: "Original", references: [{ sectionId: "v01-two" }] }],
    });
    const filePath = "editorial/sources/overview/coherence-thesis.json";

    expect(overviewStructure(base)).toEqual(overviewStructure(copyEdit));
    expect(
      (
        await classifyBrowserImpact([filePath], async (revision) =>
          revision === "base" ? base : copyEdit,
        )
      ).runE2e,
    ).toBe(false);
    expect(
      (
        await classifyBrowserImpact([filePath], async (revision) =>
          revision === "base" ? base : structuralEdit,
        )
      ).runE2e,
    ).toBe(true);
  });

  it("keeps the Playwright container version aligned with the lockfile", () => {
    const root = path.resolve(import.meta.dirname, "../..");
    const workflow = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
    const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
    const playwrightVersion = lock.packages["node_modules/@playwright/test"].version;

    expect(workflow).toContain(
      `image: mcr.microsoft.com/playwright:v${playwrightVersion}-noble`,
    );
    expect(workflow).toContain("Trust checked-out workspace in the container");
    expect(workflow.indexOf("Trust checked-out workspace in the container")).toBeLessThan(
      workflow.indexOf("Classify browser impact"),
    );
    expect(workflow.match(/name: Resolve live pull request base/g)).toHaveLength(2);
    expect(workflow).toContain(
      'git fetch --no-tags origin "+refs/heads/$BASE_REF:refs/remotes/origin/$BASE_REF"',
    );
    expect(workflow).toContain(
      'git merge-base --is-ancestor "$live_base_sha" "$HEAD_SHA"',
    );
    expect(workflow).not.toContain("github.event.pull_request.base.sha");
  });
});
