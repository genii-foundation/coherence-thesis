import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyBrowserImpact,
  manuscriptStructure,
  overviewStructure,
} from "./ci-browser-impact.mjs";

const readMissing = async () => null;

const workflowSteps = (workflow) => {
  const starts = [...workflow.matchAll(/^      - (?=(?:name|uses):)/gm)].map(
    (match) => match.index,
  );

  return starts.map((start, index) => ({
    start,
    text: workflow.slice(start, starts[index + 1] ?? workflow.length),
  }));
};

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

    const expectedImage =
      `image: mcr.microsoft.com/playwright:v${playwrightVersion}-noble`;
    expect(workflow.split(expectedImage)).toHaveLength(3);
    expect(workflow).toContain("Trust checked-out workspace in the container");
    expect(workflow.indexOf("Trust checked-out workspace in the container")).toBeLessThan(
      workflow.indexOf("Run Playwright shard"),
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

  it("shards complete browser coverage and preserves one protected result", () => {
    const root = path.resolve(import.meta.dirname, "../..");
    const workflow = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
    const topologyWorkflow = fs.readFileSync(
      path.join(root, ".github/workflows/pr-topology.yml"),
      "utf8",
    );

    expect(workflow).toContain("merge_group:");
    expect(workflow).toContain("name: Classify browser impact");
    expect(workflow).toContain("shard: [1, 2, 3, 4]");
    expect(workflow).toContain("name: Build production application");
    expect(workflow).toContain(
      "run: npm run test:e2e:built -- --shard=${{ matrix.shard }}/4",
    );
    expect(workflow).toContain("name: End-to-end (Playwright)");
    expect(workflow).toContain(
      "needs: [browser-impact, publisher-offline, e2e-shards]",
    );
    expect(workflow).toContain("The complete browser gate passed.");
    expect(workflow).not.toContain("npm --ignore-scripts run");
    expect(topologyWorkflow).toContain("merge_group:");
    expect(topologyWorkflow).toContain('if [ -n "$PR_NUMBER" ]');
  });

  it("keeps the complete Publisher migration evidence gate split across CI lanes", () => {
    const root = path.resolve(import.meta.dirname, "../..");
    const workflow = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const scripts = [
      "publisher:manifests:check",
      "publisher:reader:validate",
      "publisher:content:fidelity",
      "publisher:routes:audit",
      "publisher:application:validate",
      "publisher:content:adapt",
      "publisher:routes:adapted",
      "publisher:audio:adapt",
    ];
    const commands = scripts.map((script) =>
      `npm run --ignore-scripts ${script}`
    );
    const expectedEvidenceStep = [
      "      - name: Validate Publisher migration evidence",
      "        run: |",
      ...commands.map((command) => `          ${command}`),
    ].join("\n");
    const steps = workflowSteps(workflow);
    const evidenceSteps = steps.filter(({ text }) =>
      text.startsWith("      - name: Validate Publisher migration evidence\n"),
    );
    const typeCheckSteps = steps.filter(({ text }) =>
      text.startsWith("      - name: Type check\n"),
    );
    const bootstrapSteps = steps.filter(({ text }) =>
      text.startsWith("      - name: Bootstrap dependencies\n"),
    );
    const materializeSteps = steps.filter(({ text }) =>
      text.startsWith(
        "      - name: Materialize manuscript outputs from source\n",
      ),
    );
    const buildSteps = steps.filter(({ text }) =>
      text.startsWith("      - name: Build production application\n"),
    );
    const shardSteps = steps.filter(({ text }) =>
      text.startsWith("      - name: Run Playwright shard\n"),
    );
    const validateJobStart = workflow.indexOf("  validate:\n");
    const validateJobStepsStart = workflow.indexOf("    steps:\n", validateJobStart);
    const publisherOfflineJobStart = workflow.indexOf("  publisher-offline:\n");
    const publisherOfflineJobStepsStart = workflow.indexOf(
      "    steps:\n",
      publisherOfflineJobStart,
    );
    const e2eShardsJobStart = workflow.indexOf("  e2e-shards:\n");
    const e2eShardsJobStepsStart = workflow.indexOf(
      "    steps:\n",
      e2eShardsJobStart,
    );
    const aggregateE2eJobStart = workflow.indexOf("  e2e:\n", e2eShardsJobStart);
    const publisherOfflineJob = workflow.slice(
      publisherOfflineJobStart,
      e2eShardsJobStart,
    );
    const e2eShardsJob = workflow.slice(
      e2eShardsJobStart,
      aggregateE2eJobStart,
    );
    const aggregateE2eJob = workflow.slice(aggregateE2eJobStart);
    const offlineSteps = workflowSteps(publisherOfflineJob)
      .filter(({ text }) =>
        text.startsWith(
          "      - name: Validate Publisher offline browser host\n",
        )
      )
      .map((step) => ({
        ...step,
        start: step.start + publisherOfflineJobStart,
      }));

    expect(manifest.scripts["prepublisher:content:adapt"]).toBe(
      "npm run publisher:manifests:check",
    );
    expect(manifest.scripts["publisher:content:adapt"]).toBe(
      "tsx scripts/publisher/content-adapter.ts",
    );
    expect(manifest.scripts["prepublisher:routes:adapted"]).toBe(
      "npm run publisher:manifests:check",
    );
    expect(manifest.scripts["publisher:routes:adapted"]).toBe(
      "tsx scripts/publisher/adapted-route-report.ts",
    );
    expect(manifest.scripts["prepublisher:audio:adapt"]).toBe(
      "npm run publisher:manifests:check",
    );
    expect(manifest.scripts["publisher:audio:adapt"]).toBe(
      "tsx scripts/publisher/audio-adapter.ts",
    );
    expect(manifest.scripts["prepublisher:theme:compile"]).toBe(
      "npm run publisher:manifests:check",
    );
    expect(manifest.scripts["publisher:theme:compile"]).toBe(
      "tsx scripts/publisher/theme-host-proof.ts",
    );
    expect(manifest.scripts["prepublisher:offline:validate"]).toBe(
      "npm run publisher:manifests:check",
    );
    expect(manifest.scripts["publisher:offline:validate"]).toBe(
      "tsx scripts/publisher/offline-host-proof.ts",
    );
    expect(evidenceSteps).toHaveLength(1);
    expect(typeCheckSteps).toHaveLength(1);
    expect(offlineSteps).toHaveLength(1);
    expect(bootstrapSteps).toHaveLength(3);
    expect(materializeSteps).toHaveLength(3);
    expect(buildSteps).toHaveLength(1);
    expect(shardSteps).toHaveLength(1);
    expect(validateJobStart).toBeGreaterThanOrEqual(0);
    expect(validateJobStepsStart).toBeGreaterThan(validateJobStart);
    expect(publisherOfflineJobStart).toBeGreaterThan(validateJobStart);
    expect(publisherOfflineJobStepsStart).toBeGreaterThan(
      publisherOfflineJobStart,
    );
    expect(e2eShardsJobStart).toBeGreaterThan(publisherOfflineJobStart);
    expect(e2eShardsJobStepsStart).toBeGreaterThan(e2eShardsJobStart);
    expect(aggregateE2eJobStart).toBeGreaterThan(e2eShardsJobStart);

    const evidenceStep = evidenceSteps[0];
    const typeCheckStep = typeCheckSteps[0];
    const offlineStep = offlineSteps[0];
    const offlineBootstrapStep = bootstrapSteps.find(({ start }) =>
      start > publisherOfflineJobStart && start < e2eShardsJobStart
    );
    const offlineMaterializeStep = materializeSteps.find(({ start }) =>
      start > publisherOfflineJobStart && start < e2eShardsJobStart
    );
    const shardBootstrapStep = bootstrapSteps.find(({ start }) =>
      start > e2eShardsJobStart && start < aggregateE2eJobStart
    );
    const shardMaterializeStep = materializeSteps.find(({ start }) =>
      start > e2eShardsJobStart && start < aggregateE2eJobStart
    );
    const buildStep = buildSteps[0];
    const shardStep = shardSteps[0];
    expect(offlineBootstrapStep).toBeDefined();
    expect(offlineMaterializeStep).toBeDefined();
    expect(shardBootstrapStep).toBeDefined();
    expect(shardMaterializeStep).toBeDefined();
    const validateJobPrelude = workflow.slice(validateJobStart, validateJobStepsStart);
    const publisherOfflineJobPrelude = workflow.slice(
      publisherOfflineJobStart,
      publisherOfflineJobStepsStart,
    );
    const e2eShardsJobPrelude = workflow.slice(
      e2eShardsJobStart,
      e2eShardsJobStepsStart,
    );
    expect(validateJobPrelude).not.toMatch(/^    if:/m);
    expect(validateJobPrelude).not.toMatch(/^    continue-on-error:/m);
    expect(publisherOfflineJobPrelude).not.toMatch(/^    if:/m);
    expect(publisherOfflineJobPrelude).not.toMatch(/^    continue-on-error:/m);
    expect(publisherOfflineJobPrelude).not.toMatch(/^    needs:/m);
    expect(publisherOfflineJobPrelude).not.toMatch(/^    strategy:/m);
    expect(e2eShardsJobPrelude).toContain("    needs: browser-impact\n");
    expect(e2eShardsJobPrelude).toContain(
      "    if: needs.browser-impact.outputs.run_e2e == 'true'\n",
    );
    expect(evidenceStep.text.trimEnd()).toBe(expectedEvidenceStep);
    expect(evidenceStep.text).not.toMatch(/^\s+if:/m);
    expect(evidenceStep.text).not.toMatch(/^\s+continue-on-error:/m);
    expect(offlineStep.text.trimEnd()).toBe([
      "      - name: Validate Publisher offline browser host",
      "        run: npm run --ignore-scripts publisher:offline:validate",
      "        env:",
      '          CI: "1"',
      '          NODE_ENV: "production"',
      '          NEXT_TELEMETRY_DISABLED: "1"',
    ].join("\n"));
    expect(offlineStep.text).not.toMatch(/^\s+if:/m);
    expect(offlineStep.text).not.toMatch(/^\s+continue-on-error:/m);
    expect(offlineBootstrapStep.text).not.toMatch(/^\s+if:/m);
    expect(offlineBootstrapStep.text).not.toMatch(/^\s+continue-on-error:/m);
    expect(offlineMaterializeStep.text).not.toMatch(/^\s+if:/m);
    expect(offlineMaterializeStep.text).not.toMatch(/^\s+continue-on-error:/m);
    expect(buildStep.text).not.toMatch(/^\s+continue-on-error:/m);
    expect(shardStep.text).not.toMatch(/^\s+continue-on-error:/m);
    expect(publisherOfflineJob).not.toMatch(/^\s+if:/m);
    expect(publisherOfflineJob).not.toMatch(/^\s+continue-on-error:/m);
    expect(publisherOfflineJob).not.toContain("strategy:");
    expect(publisherOfflineJob).not.toContain("shard");
    expect(publisherOfflineJob).not.toContain("Build production application");
    expect(publisherOfflineJob).not.toContain("test:e2e:built");
    expect(e2eShardsJob).not.toContain("publisher:offline:validate");
    expect(e2eShardsJob).not.toContain("publisher:theme:compile");
    expect(aggregateE2eJob).toContain("    if: always()\n");
    expect(aggregateE2eJob).toContain(
      'if [ "$OFFLINE_RESULT" != "success" ]; then',
    );
    expect(workflow).not.toContain("publisher:theme:compile");
    expect(workflow.split(
      "npm run --ignore-scripts publisher:offline:validate",
    )).toHaveLength(2);
    expect(workflow.split("npm run test:e2e:built")).toHaveLength(2);
    expect(workflow).toContain(
      "needs: [browser-impact, publisher-offline, e2e-shards]",
    );
    expect(workflow).toContain(
      "OFFLINE_RESULT: ${{ needs.publisher-offline.result }}",
    );

    const commandIndexes = commands.map((command) => {
      expect(workflow.split(command)).toHaveLength(2);
      return workflow.indexOf(command);
    });
    expect(commandIndexes).toEqual(
      [...commandIndexes].sort((left, right) => left - right),
    );
    expect(workflow.indexOf("repository:validate-publisher-candidate")).toBeLessThan(
      commandIndexes[0],
    );
    expect(commandIndexes.at(-1)).toBeLessThan(typeCheckStep.start);
    expect(publisherOfflineJobStart).toBeLessThan(offlineBootstrapStep.start);
    expect(offlineBootstrapStep.start).toBeLessThan(
      offlineMaterializeStep.start,
    );
    expect(offlineMaterializeStep.start).toBeLessThan(offlineStep.start);
    expect(offlineStep.start).toBeLessThan(e2eShardsJobStart);
    expect(e2eShardsJobStart).toBeLessThan(shardBootstrapStep.start);
    expect(shardBootstrapStep.start).toBeLessThan(shardMaterializeStep.start);
    expect(shardMaterializeStep.start).toBeLessThan(buildStep.start);
    expect(buildStep.start).toBeLessThan(shardStep.start);
    expect(shardStep.start).toBeLessThan(aggregateE2eJobStart);
  });
});
