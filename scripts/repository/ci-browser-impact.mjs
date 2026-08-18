import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const manuscriptPathPattern =
  /^editorial\/sources\/volumes\/[^/]+\/manuscript\.md$/;
const overviewPath = "editorial/sources/overview/coherence-thesis.json";

const alwaysNonBrowserPatterns = [
  /^\.agents\//,
  /(^|\/)AGENTS\.md$/,
  /(^|\/)(?:README|CONTRIBUTING|CODE_OF_CONDUCT|SECURITY)\.md$/i,
  /^(?:LICENSE|LICENSE-content|NOTICE)$/,
  /^editorial\/(?!sources\/volumes\/[^/]+\/(?:manuscript\.md|volume\.json)$|sources\/corpus\/semantic-links\.json$|sources\/overview\/coherence-thesis\.json$)/,
  /^publishing\/updates\/snapshot\.json$/,
  /^publishing\/(?:guides|README\.md)/,
  /^scripts\/repository\/agent-assets(?:\.test)?\.ts$/,
];

function plainLine(line) {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^>\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/_/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function markdownHeading(line) {
  const hashMatch = line.match(/^(#{1,6})\s+(.+)$/);
  if (hashMatch) {
    return { level: hashMatch[1].length, text: plainLine(hashMatch[2]) };
  }

  const boldMatch = line.trim().match(/^\*{2,3}\s*(.+?)\s*\*{2,3}$/);
  if (!boldMatch) return null;
  const text = plainLine(boldMatch[1]);
  return text.length <= 96 ? { level: 3, text } : null;
}

function partInfo(line) {
  return /^part\s+[a-z0-9ivx]+(?:\s*[·:.,-]\s*.+)?$/i.test(plainLine(line));
}

function chapterMarker(line) {
  return /^chapter\s+[a-z0-9ivx]+$/i.test(plainLine(line));
}

function ignoredStructuralLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^-{3,}$/.test(trimmed)) return true;
  if (/^[.:·∗*\s]+$/.test(trimmed)) return true;
  if (/^[—–-]\s*[·.]\s*[—–-]$/.test(trimmed)) return true;
  const plain = plainLine(trimmed);
  return /^(preface|opening|epilogue|in one minute|in a few minutes more|the dedication)$/i.test(
    plain,
  );
}

export function manuscriptStructure(markdown) {
  const structure = [];
  let awaitingPartTitle = false;
  let collectingPartIntroduction = false;

  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const part = partInfo(line);
    const heading = markdownHeading(line);

    if (part) {
      structure.push(`part:${plainLine(line)}`);
      awaitingPartTitle = !/[·:.,-]\s*.+$/.test(plainLine(line));
      collectingPartIntroduction = !awaitingPartTitle;
      continue;
    }

    if (awaitingPartTitle && heading) {
      structure.push(`part-title:${heading.level}:${heading.text}`);
      awaitingPartTitle = false;
      collectingPartIntroduction = true;
      continue;
    }

    if (awaitingPartTitle && !ignoredStructuralLine(line)) {
      awaitingPartTitle = false;
      collectingPartIntroduction = true;
    }

    if (chapterMarker(line)) {
      structure.push(`chapter-marker:${plainLine(line)}`);
      awaitingPartTitle = false;
      collectingPartIntroduction = false;
      continue;
    }

    if (heading) {
      structure.push(`heading:${heading.level}:${heading.text}`);
      awaitingPartTitle = false;
      collectingPartIntroduction = false;
      continue;
    }

    if (collectingPartIntroduction && !ignoredStructuralLine(line)) {
      structure.push(`part-introduction:${line.trim()}`);
    }
  }

  return structure;
}

export function overviewStructure(source) {
  const overview = JSON.parse(source);
  if (!Array.isArray(overview.nodes)) {
    throw new Error("Overview nodes must be an array.");
  }
  return overview.nodes.map((node) => ({
    id: node.id,
    references: Array.isArray(node.references)
      ? node.references.map((reference) => reference.sectionId)
      : [],
  }));
}

function isAlwaysNonBrowserPath(filePath) {
  return alwaysNonBrowserPatterns.some((pattern) => pattern.test(filePath));
}

export async function classifyBrowserImpact(changedPaths, readAtRevision) {
  if (changedPaths.length === 0) {
    return { runE2e: true, reason: "No changed paths were resolved; running fail closed." };
  }

  for (const filePath of changedPaths) {
    if (manuscriptPathPattern.test(filePath)) {
      const [baseSource, headSource] = await Promise.all([
        readAtRevision("base", filePath),
        readAtRevision("head", filePath),
      ]);
      if (baseSource === null || headSource === null) {
        return {
          runE2e: true,
          reason: `${filePath} was added or removed; running the structural gate.`,
        };
      }
      if (
        JSON.stringify(manuscriptStructure(baseSource)) !==
        JSON.stringify(manuscriptStructure(headSource))
      ) {
        return {
          runE2e: true,
          reason: `${filePath} changes public manuscript structure.`,
        };
      }
      continue;
    }

    if (filePath === overviewPath) {
      const [baseSource, headSource] = await Promise.all([
        readAtRevision("base", filePath),
        readAtRevision("head", filePath),
      ]);
      if (baseSource === null || headSource === null) {
        return { runE2e: true, reason: `${filePath} was added or removed.` };
      }
      try {
        if (
          JSON.stringify(overviewStructure(baseSource)) !==
          JSON.stringify(overviewStructure(headSource))
        ) {
          return {
            runE2e: true,
            reason: `${filePath} changes overview structure or reference targets.`,
          };
        }
      } catch {
        return {
          runE2e: true,
          reason: `${filePath} could not be classified; running fail closed.`,
        };
      }
      continue;
    }

    if (isAlwaysNonBrowserPath(filePath)) continue;

    return {
      runE2e: true,
      reason: `${filePath} is not classified as browser-safe; running fail closed.`,
    };
  }

  return {
    runE2e: false,
    reason: "Every changed path is agent-only, documentary, Updates-only, or nonstructural editorial content.",
  };
}

function git(args, allowMissing = false) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status === 0) return result.stdout;
  if (allowMissing) return null;
  throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error("Expected --base, --head, and --github-output arguments.");
    }
    values.set(key, value);
  }
  return {
    base: values.get("--base"),
    head: values.get("--head"),
    githubOutput: values.get("--github-output"),
  };
}

export async function run(argv = process.argv.slice(2)) {
  const { base, head, githubOutput } = parseArguments(argv);
  if (!base || !head || !githubOutput) {
    throw new Error("Expected --base, --head, and --github-output arguments.");
  }

  const changedPaths = git([
    "diff",
    "--name-only",
    "--diff-filter=ACDMRTUXB",
    "-z",
    base,
    head,
  ])
    .split("\0")
    .filter(Boolean)
    .sort();

  const result = await classifyBrowserImpact(changedPaths, async (revision, filePath) =>
    git(["show", `${revision === "base" ? base : head}:${filePath}`], true),
  );
  const safeReason = result.reason.replace(/[\r\n]+/g, " ");

  fs.appendFileSync(
    githubOutput,
    `run_e2e=${result.runE2e ? "true" : "false"}\nreason=${safeReason}\n`,
  );
  console.log(`Browser impact: ${result.runE2e ? "full E2E" : "focused validation"}`);
  console.log(`Reason: ${result.reason}`);
  console.log(`Changed paths (${changedPaths.length}): ${changedPaths.join(", ")}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
