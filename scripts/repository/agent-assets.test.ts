import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  auditAgentAssets,
  parseAgentMetadata,
  parseSkillFile,
} from "./agent-assets";

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coherence-agents-"));
  temporaryRoots.push(root);
  return root;
}

function writeFile(filePath: string, contents: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

describe("repository agent assets", () => {
  it("accepts the complete repository skill inventory", () => {
    expect(auditAgentAssets().issues).toEqual([]);
  });

  it("allows only name and description in skill frontmatter", () => {
    const valid = `---\nname: demo-skill\ndescription: Perform one clear repository task when the request matches.\n---\n\n# Demo\n`;
    expect(parseSkillFile(valid).frontmatter.name).toBe("demo-skill");
    expect(() =>
      parseSkillFile(valid.replace("---\n\n# Demo", "version: 1\n---\n\n# Demo")),
    ).toThrow("only name and description");
  });

  it("requires the canonical quoted metadata shape", () => {
    const valid = `interface:\n  display_name: "Demo Skill"\n  short_description: "Perform one focused repository task"\n  default_prompt: "Use $demo-skill to perform the task."\n\npolicy:\n  allow_implicit_invocation: true\n`;
    expect(parseAgentMetadata(valid)).toMatchObject({
      allowImplicitInvocation: true,
      displayName: "Demo Skill",
    });
    expect(() =>
      parseAgentMetadata(valid.replace('"Demo Skill"', "Demo Skill")),
    ).toThrow("canonical quoted interface");
  });

  it("reports missing direct canonical resource links", () => {
    const root = temporaryRoot();
    writeFile(
      path.join(root, ".agents/skills/demo-skill/SKILL.md"),
      `---\nname: demo-skill\ndescription: Perform one clear repository task when the request matches.\n---\n\n# Demo\n`,
    );
    writeFile(
      path.join(root, ".agents/skills/demo-skill/agents/openai.yaml"),
      `interface:\n  display_name: "Demo Skill"\n  short_description: "Perform one focused repository task"\n  default_prompt: "Use $demo-skill to perform the task."\n\npolicy:\n  allow_implicit_invocation: true\n`,
    );
    writeFile(path.join(root, "docs/guide.md"), "# Guide\n");

    const audit = auditAgentAssets(root, {
      expectedSkillNames: ["demo-skill"],
      requiredResources: { "demo-skill": ["docs/guide.md"] },
    });

    expect(audit.issues).toEqual([
      expect.objectContaining({
        code: "missing-resource",
        path: ".agents/skills/demo-skill/SKILL.md",
      }),
    ]);
  });
});
