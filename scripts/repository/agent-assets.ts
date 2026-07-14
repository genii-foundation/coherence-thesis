import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeRepoPath, repoRoot } from "./paths";

export const EXPECTED_SKILL_NAMES = [
  "coherence-build-feature",
  "coherence-editorial-debt",
  "coherence-editorial-debt-guide",
  "coherence-editorial-review",
  "coherence-manuscript-publish",
  "coherence-repository-maintenance",
  "coherence-ship-site",
] as const;

export const EXPECTED_SKILL_INVOCATION: Readonly<
  Record<(typeof EXPECTED_SKILL_NAMES)[number], boolean>
> = {
  "coherence-build-feature": false,
  "coherence-editorial-debt": false,
  "coherence-editorial-debt-guide": true,
  "coherence-editorial-review": true,
  "coherence-manuscript-publish": false,
  "coherence-repository-maintenance": true,
  "coherence-ship-site": false,
};

export const REQUIRED_SKILL_RESOURCES: Readonly<
  Record<(typeof EXPECTED_SKILL_NAMES)[number], readonly string[]>
> = {
  "coherence-build-feature": ["AGENTS.md"],
  "coherence-editorial-debt": [
    "editorial/AGENTS.md",
    "editorial/debt/README.md",
    "editorial/templates/debt-item.md",
  ],
  "coherence-editorial-debt-guide": [
    "editorial/AGENTS.md",
    "editorial/debt/README.md",
    "editorial/templates/debt-item.md",
    "scripts/editorial/debt-queue.ts",
    "publishing/AGENTS.md",
    "publishing/README.md",
  ],
  "coherence-editorial-review": [
    "editorial/standards/editorial.md",
    "editorial/templates/voice-card.md",
    "editorial/templates/review-record.md",
    "editorial/schemas/sentence-ledger.md",
    "editorial/schemas/structure-ledger.md",
    "editorial/schemas/review-manifest.md",
    "editorial/guides/manuscript-editorial-plan.md",
  ],
  "coherence-manuscript-publish": [
    "AGENTS.md",
    "editorial/AGENTS.md",
    "publishing/AGENTS.md",
  ],
  "coherence-repository-maintenance": [
    "AGENTS.md",
    "scripts/repository/paths.ts",
  ],
  "coherence-ship-site": ["AGENTS.md", "publishing/AGENTS.md"],
};

export type AgentAssetIssueCode =
  | "invalid-frontmatter"
  | "invalid-metadata"
  | "missing-resource"
  | "missing-skill"
  | "missing-skill-file"
  | "unexpected-skill";

export type AgentAssetIssue = {
  code: AgentAssetIssueCode;
  message: string;
  path: string;
};

export type AgentAssetAudit = {
  issues: AgentAssetIssue[];
  metadataFiles: number;
  resourceLinks: number;
  skills: string[];
};

export type AgentAssetAuditOptions = {
  expectedInvocationPolicy?: Readonly<Record<string, boolean>>;
  expectedSkillNames?: readonly string[];
  requiredResources?: Readonly<Record<string, readonly string[]>>;
};

export type SkillFrontmatter = {
  description: string;
  name: string;
};

export type AgentMetadata = {
  allowImplicitInvocation: boolean;
  defaultPrompt: string;
  displayName: string;
  shortDescription: string;
};

function unquoteYamlScalar(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseSkillFile(source: string): {
  body: string;
  frontmatter: SkillFrontmatter;
} {
  const normalized = source.replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n")) {
    throw new Error("SKILL.md must start with YAML frontmatter.");
  }
  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) {
    throw new Error("SKILL.md frontmatter is not closed.");
  }

  const fields = new Map<string, string>();
  for (const line of normalized.slice(4, end).split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 1) {
      throw new Error(`Invalid frontmatter line: ${line}`);
    }
    const key = line.slice(0, separator).trim();
    if (fields.has(key)) throw new Error(`Duplicate frontmatter field: ${key}`);
    fields.set(key, unquoteYamlScalar(line.slice(separator + 1)));
  }

  const keys = [...fields.keys()].sort();
  if (keys.join(",") !== "description,name") {
    throw new Error("SKILL.md frontmatter may contain only name and description.");
  }
  const name = fields.get("name") ?? "";
  const description = fields.get("description") ?? "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error("Skill name must use lowercase kebab case.");
  }
  if (description.length < 25 || description.length > 1024) {
    throw new Error("Skill description must contain 25 to 1,024 characters.");
  }

  return {
    body: normalized.slice(end + 5),
    frontmatter: { description, name },
  };
}

export function parseAgentMetadata(source: string): AgentMetadata {
  const normalized = source.replaceAll("\r\n", "\n");
  const match = normalized.match(
    /^interface:\n  display_name: "([^"\n]+)"\n  short_description: "([^"\n]+)"\n  default_prompt: "([^"\n]+)"\n\npolicy:\n  allow_implicit_invocation: (true|false)\n?$/,
  );
  if (!match) {
    throw new Error(
      "agents/openai.yaml must use the canonical quoted interface and policy shape.",
    );
  }
  const [, displayName, shortDescription, defaultPrompt, invocation] = match;
  if (!displayName || !shortDescription || !defaultPrompt || !invocation) {
    throw new Error("Agent metadata fields must not be empty.");
  }
  if (shortDescription.length < 25 || shortDescription.length > 64) {
    throw new Error("short_description must contain 25 to 64 characters.");
  }
  return {
    allowImplicitInvocation: invocation === "true",
    defaultPrompt,
    displayName,
    shortDescription,
  };
}

function regularFile(filePath: string): boolean {
  try {
    const stats = fs.lstatSync(filePath);
    return stats.isFile() && !stats.isSymbolicLink();
  } catch {
    return false;
  }
}

function addIssue(
  issues: AgentAssetIssue[],
  root: string,
  code: AgentAssetIssueCode,
  filePath: string,
  message: string,
): void {
  issues.push({
    code,
    message,
    path: normalizeRepoPath(path.relative(root, filePath)),
  });
}

export function auditAgentAssets(
  root = repoRoot,
  options: AgentAssetAuditOptions = {},
): AgentAssetAudit {
  const expectedSkillNames = [
    ...(options.expectedSkillNames ?? EXPECTED_SKILL_NAMES),
  ].sort();
  const requiredResources: Readonly<Record<string, readonly string[]>> =
    options.requiredResources ?? REQUIRED_SKILL_RESOURCES;
  const expectedInvocationPolicy: Readonly<Record<string, boolean>> =
    options.expectedInvocationPolicy ?? EXPECTED_SKILL_INVOCATION;
  const skillsRoot = path.join(root, ".agents/skills");
  const actualSkillNames = fs.existsSync(skillsRoot)
    ? fs
        .readdirSync(skillsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    : [];
  const issues: AgentAssetIssue[] = [];
  let metadataFiles = 0;
  let resourceLinks = 0;

  for (const skillName of expectedSkillNames) {
    if (actualSkillNames.includes(skillName)) continue;
    addIssue(
      issues,
      root,
      "missing-skill",
      path.join(skillsRoot, skillName),
      "Expected repository skill is missing.",
    );
  }
  for (const skillName of actualSkillNames) {
    if (expectedSkillNames.includes(skillName)) continue;
    addIssue(
      issues,
      root,
      "unexpected-skill",
      path.join(skillsRoot, skillName),
      "Skill is not part of the repository skill inventory.",
    );
  }

  for (const skillName of expectedSkillNames) {
    if (!actualSkillNames.includes(skillName)) continue;
    const skillRoot = path.join(skillsRoot, skillName);
    const skillPath = path.join(skillRoot, "SKILL.md");
    const metadataPath = path.join(skillRoot, "agents/openai.yaml");
    let body = "";

    if (!regularFile(skillPath)) {
      addIssue(
        issues,
        root,
        "missing-skill-file",
        skillPath,
        "Skill must contain a regular SKILL.md file.",
      );
    } else {
      try {
        const parsed = parseSkillFile(fs.readFileSync(skillPath, "utf8"));
        body = parsed.body;
        if (parsed.frontmatter.name !== skillName) {
          throw new Error("Frontmatter name must match the skill directory.");
        }
      } catch (error) {
        addIssue(
          issues,
          root,
          "invalid-frontmatter",
          skillPath,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    if (!regularFile(metadataPath)) {
      addIssue(
        issues,
        root,
        "missing-skill-file",
        metadataPath,
        "Skill must contain a regular agents/openai.yaml file.",
      );
    } else {
      metadataFiles += 1;
      try {
        const metadata = parseAgentMetadata(
          fs.readFileSync(metadataPath, "utf8"),
        );
        const promptSkills: string[] =
          metadata.defaultPrompt.match(/\$[a-z0-9-]+/g) ?? [];
        if (!promptSkills.includes(`$${skillName}`)) {
          throw new Error(
            `default_prompt must explicitly name $${skillName}.`,
          );
        }
        const expectedInvocation = expectedInvocationPolicy[skillName];
        if (
          typeof expectedInvocation === "boolean" &&
          metadata.allowImplicitInvocation !== expectedInvocation
        ) {
          throw new Error(
            `allow_implicit_invocation must be ${String(expectedInvocation)} for ${skillName}.`,
          );
        }
      } catch (error) {
        addIssue(
          issues,
          root,
          "invalid-metadata",
          metadataPath,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    for (const resource of requiredResources[skillName] ?? []) {
      resourceLinks += 1;
      const resourcePath = path.join(root, resource);
      if (!fs.existsSync(resourcePath)) {
        addIssue(
          issues,
          root,
          "missing-resource",
          resourcePath,
          `${skillName} requires a canonical resource that does not exist.`,
        );
      } else if (!body.includes(resource)) {
        addIssue(
          issues,
          root,
          "missing-resource",
          skillPath,
          `Skill must link directly to ${resource}.`,
        );
      }
    }
  }

  issues.sort((left, right) =>
    `${left.path}\0${left.code}\0${left.message}`.localeCompare(
      `${right.path}\0${right.code}\0${right.message}`,
    ),
  );
  return {
    issues,
    metadataFiles,
    resourceLinks,
    skills: actualSkillNames,
  };
}

function runCli(): void {
  const audit = auditAgentAssets();
  if (audit.issues.length > 0) {
    console.error("Repository agent asset validation failed.");
    for (const issue of audit.issues) {
      console.error(`  ${issue.path}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(
    `Repository agent assets are valid. ${audit.skills.length.toLocaleString()} skills, ${audit.metadataFiles.toLocaleString()} metadata files, and ${audit.resourceLinks.toLocaleString()} canonical resource links checked.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runCli();
}
