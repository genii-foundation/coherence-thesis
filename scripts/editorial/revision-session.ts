#!/usr/bin/env tsx

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  addWorkingRevisionDirection,
  approveWorkingRevisionVariant,
  createWorkingRevisionSession,
  markWorkingRevisionRecorded,
  parseWorkingRevisionSession,
  publishWorkingRevisionVariants,
  workingRevisionHref,
  type WorkingRevisionSession,
} from "../../src/lib/editorial-revision-session";
import { splitMarkdownBlocks } from "../../src/lib/markdown-blocks";
import type { CompiledSection } from "../manuscripts/types";
import {
  generatedCatalogPath,
  generatedRevisionSessionsRoot,
  repoRoot,
} from "../repository/paths";
import { latestCheckpointForVolume } from "./manuscript-checkpoints";

type Command = "approve" | "direction" | "recorded" | "start" | "variants";

type Args = {
  command: Command;
  section: string;
  anchor: string;
  request: string;
  requestFile: string;
  variantsFile: string;
  variant: string;
  recordPath: string;
  replace: boolean;
};

function fail(message: string): never {
  process.stderr.write(`editorial:revision: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const command = argv[0] as Command | undefined;
  if (
    !command ||
    !["approve", "direction", "recorded", "start", "variants"].includes(
      command,
    )
  ) {
    fail("expected start, direction, variants, approve, or recorded");
  }

  const args: Args = {
    command,
    section: "",
    anchor: "",
    request: "",
    requestFile: "",
    variantsFile: "",
    variant: "",
    recordPath: "",
    replace: false,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--replace") {
      args.replace = true;
      continue;
    }
    const value = argv[index + 1] ?? "";
    if (flag === "--section") args.section = value;
    else if (flag === "--anchor") args.anchor = value;
    else if (flag === "--request") args.request = value;
    else if (flag === "--request-file") args.requestFile = value;
    else if (flag === "--file") args.variantsFile = value;
    else if (flag === "--variant") args.variant = value;
    else if (flag === "--record-path") args.recordPath = value;
    else fail(`unknown argument ${flag}`);
    index += 1;
  }
  if (!/^[a-z0-9-]+$/.test(args.section)) {
    fail("missing or invalid --section <section-id>");
  }
  return args;
}

function sessionPath(section: string): string {
  return path.join(generatedRevisionSessionsRoot, `${section}.json`);
}

function readSession(section: string): WorkingRevisionSession {
  const filePath = sessionPath(section);
  if (!existsSync(filePath)) {
    fail(
      `no working session for ${section}; run start before advancing the session`,
    );
  }
  return parseWorkingRevisionSession(
    JSON.parse(readFileSync(filePath, "utf8")),
    path.relative(repoRoot, filePath),
  );
}

function writeSession(session: WorkingRevisionSession): void {
  mkdirSync(generatedRevisionSessionsRoot, { recursive: true });
  writeFileSync(
    sessionPath(session.sectionId),
    `${JSON.stringify(session, null, 2)}\n`,
  );
}

function readCatalogSections(): CompiledSection[] {
  if (!existsSync(generatedCatalogPath)) {
    fail("generated manuscript catalog is missing; run npm run manuscripts:prepare");
  }
  const catalog = JSON.parse(readFileSync(generatedCatalogPath, "utf8")) as {
    sections?: CompiledSection[];
  };
  return catalog.sections ?? [];
}

function resolveSection(sectionId: string): CompiledSection {
  const section = readCatalogSections().find(
    (candidate) =>
      candidate.sectionId === sectionId ||
      candidate.continuityId === sectionId ||
      candidate.legacyContinuityIds.includes(sectionId),
  );
  if (!section) fail(`section ${sectionId} is not in the generated catalog`);
  return section;
}

function passageText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[*_`>#|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function selectedPassage(section: CompiledSection, anchor: string): string {
  if (!anchor) return passageText(section.body);
  const paragraph = section.paragraphs.find(
    (candidate) =>
      candidate.anchor === anchor || candidate.paragraphId === anchor,
  );
  if (!paragraph) {
    fail(`paragraph anchor ${anchor} is not in section ${section.sectionId}`);
  }
  const block = splitMarkdownBlocks(section.body)[paragraph.order - 1];
  if (!block) {
    fail(`paragraph ${paragraph.order} is missing from section ${section.sectionId}`);
  }
  return passageText(block);
}

function start(args: Args): WorkingRevisionSession {
  const filePath = sessionPath(args.section);
  if (existsSync(filePath) && !args.replace) {
    const existing = readSession(args.section);
    if (!args.anchor || existing.paragraphAnchor === args.anchor) return existing;
    fail(
      `a working session already exists for another passage in ${args.section}; pass --replace only if the editor asked to discard it`,
    );
  }

  const section = resolveSection(args.section);
  const canonicalId = section.continuityId || section.sectionId;
  const volumeNumber = /^v(\d{2})-/.exec(canonicalId)?.[1];
  if (!volumeNumber) {
    fail(`cannot derive an editorial id from section ${canonicalId}`);
  }
  const now = new Date().toISOString();
  return createWorkingRevisionSession(
    {
      sectionId: canonicalId,
      editorialId: `volume-${volumeNumber}`,
      currentHeading: section.title,
      sourceHref: section.readerHref,
      paragraphAnchor: args.anchor || null,
      selectedPassage: selectedPassage(section, args.anchor),
      baseCheckpointId: latestCheckpointForVolume(
        `volume-${volumeNumber}`,
      ).checkpointId,
    },
    now,
  );
}

function readRequest(args: Args): string {
  if (args.request && args.requestFile) {
    fail("use either --request or --request-file, not both");
  }
  if (args.requestFile) {
    const filePath = path.resolve(repoRoot, args.requestFile);
    if (!existsSync(filePath)) fail(`request file ${args.requestFile} is missing`);
    return readFileSync(filePath, "utf8").trim();
  }
  if (!args.request.trim()) {
    fail("direction requires --request <text> or --request-file <path>");
  }
  return args.request.trim();
}

function advance(args: Args): WorkingRevisionSession {
  const session = readSession(args.section);
  const now = new Date().toISOString();
  if (args.command === "direction") {
    return addWorkingRevisionDirection(session, readRequest(args), now);
  }
  if (args.command === "variants") {
    if (!args.variantsFile) fail("variants requires --file <path>");
    const filePath = path.resolve(repoRoot, args.variantsFile);
    if (!existsSync(filePath)) fail(`variant file ${args.variantsFile} is missing`);
    const variants = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    return publishWorkingRevisionVariants(session, variants, now);
  }
  if (args.command === "approve") {
    if (!args.variant) fail("approve requires --variant <label>");
    return approveWorkingRevisionVariant(session, args.variant, now);
  }
  if (!args.recordPath) {
    fail("recorded requires --record-path <repository-relative-path>");
  }
  return markWorkingRevisionRecorded(session, args.recordPath, now);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const session = args.command === "start" ? start(args) : advance(args);
  writeSession(session);
  process.stdout.write(`${workingRevisionHref(session.sectionId)}\n`);
  process.stdout.write(`  ${session.status}: ${session.currentHeading}\n`);
}

if (import.meta.filename === process.argv[1]) main();
