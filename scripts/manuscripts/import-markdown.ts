import path from "node:path";
import {
  cleanDir,
  ensureDir,
  fileHash,
  formatFrontmatter,
  manuscriptRoot,
  normalizeNewlines,
  readUtf8,
  readVolumeConfigs,
  repoRoot,
  sectionHref,
  sha256,
  slugify,
  writeJson,
  writeUtf8,
  type ManuscriptFrontmatter,
  type VolumeConfig,
} from "./shared";

type DraftSection = {
  frontmatter: ManuscriptFrontmatter;
  body: string[];
};

type Heading = {
  level: number;
  text: string;
};

const startMarkers: Record<string, string> = {
  "humanitys-most-viable-future": "ORIENTATION",
  "wielding-intelligence": "Continuity",
  "providence-imperative": "Continuity",
  "architecting-providence": "First, the Story",
  purposeful: "On Returning to the Human",
  "smallest-nest": "The Whole, in the Fewest Words",
  "presencing-genius": "Part I",
  "misanthropic-artifice": "Prologue · Two Scenes",
  "cardinal-scale": "A note on the register of this volume",
};

const numberWords: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

const romanValues: Record<string, number> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
  xi: 11,
  xii: 12,
};

function plainLine(line: string): string {
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

function smartTitle(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "Untitled";
  if (!/[a-z]/.test(trimmed) && /[A-Z]/.test(trimmed)) {
    const alwaysUpper = new Set(["AI", "B.O.W", "B.O.W.", "ICONS", "PURPOSEFUL"]);
    return trimmed
      .toLowerCase()
      .split(/(\s+)/)
      .map((word) => {
        const clean = word.replace(/[^a-z.]/g, "").toUpperCase();
        if (alwaysUpper.has(clean)) return word.toUpperCase();
        if (!/[a-z]/.test(word)) return word;
        return `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`;
      })
      .join("");
  }
  return trimmed;
}

function markdownHeading(line: string): Heading | null {
  const hashMatch = line.match(/^(#{1,6})\s+(.+)$/);
  if (hashMatch) {
    return {
      level: (hashMatch[1] ?? "").length,
      text: smartTitle(plainLine(hashMatch[2] ?? "")),
    };
  }

  const boldMatch = line
    .trim()
    .match(/^\*{2,3}\s*(.+?)\s*\*{2,3}$/);
  if (boldMatch) {
    const text = smartTitle(plainLine(boldMatch[1] ?? ""));
    if (text.length <= 96) return { level: 3, text };
  }

  return null;
}

function parseOrdinal(value: string): number | null {
  const clean = value.trim().toLowerCase();
  if (/^\d+$/.test(clean)) return Number(clean);
  return numberWords[clean] ?? romanValues[clean] ?? null;
}

function partInfo(line: string): { order: number | null; title: string | null } | null {
  const plain = plainLine(line);
  const match = plain.match(/^part\s+([a-z0-9ivx]+)(?:\s*[·:.,-]\s*(.+))?$/i);
  if (!match) return null;
  return {
    order: parseOrdinal(match[1] ?? ""),
    title: match[2] ? smartTitle(match[2]) : null,
  };
}

function chapterMarker(line: string): boolean {
  return /^chapter\s+([a-z0-9ivx]+)$/i.test(plainLine(line));
}

function ignoreLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^-{3,}$/.test(trimmed)) return true;
  if (/^[.:·∗*\s]+$/.test(trimmed)) return true;
  if (/^[—–-]\s*[·.]\s*[—–-]$/.test(trimmed)) return true;
  const plain = plainLine(trimmed);
  return /^(preface|opening|epilogue|in one minute|in a few minutes more|the dedication)$/i.test(
    plain,
  );
}

function nextHeading(lines: string[], startIndex: number): { heading: Heading; index: number } | null {
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || !line.trim()) continue;
    const heading = markdownHeading(line);
    if (heading) return { heading, index };
    return null;
  }
  return null;
}

function findStart(lines: string[], volumeId: string): number {
  const marker = startMarkers[volumeId];
  if (!marker) return 0;
  const headingIndex = lines.findIndex((line) => markdownHeading(line)?.text === marker);
  if (headingIndex >= 0) return headingIndex;
  const index = lines.findIndex((line) => plainLine(line) === marker);
  return index >= 0 ? index : 0;
}

function sourcePathFor(config: VolumeConfig): string {
  return path.resolve(repoRoot, config.sourcePath);
}

function sectionPath(section: DraftSection): string {
  const fm = section.frontmatter;
  const partDir = `${String(fm.partOrder).padStart(2, "0")}-${fm.partId}`;
  const chapterDir = `${String(fm.chapterOrder).padStart(2, "0")}-${fm.chapterId}`;
  const fileName = `${String(fm.sectionOrder).padStart(4, "0")}-${fm.sectionId}.md`;
  return path.join(fm.volumeId, partDir, chapterDir, fileName);
}

function uniqueId(base: string, used: Set<string>): string {
  let candidate = base;
  let index = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  used.add(candidate);
  return candidate;
}

function chapterKey(section: DraftSection): string {
  const fm = section.frontmatter;
  return `${fm.volumeId}:${fm.partId}:${fm.chapterId}`;
}

function partKey(section: DraftSection): string {
  const fm = section.frontmatter;
  return `${fm.volumeId}:${fm.partId}`;
}

function bodyText(section: DraftSection): string {
  return section.body.map(plainLine).filter(Boolean).join(" ");
}

function wordTokenCount(text: string): number {
  return text.match(/[A-Za-z0-9]+/g)?.length ?? 0;
}

function isSubtitleOnlyOpener(section: DraftSection): boolean {
  const text = bodyText(section);
  if (!text) return false;
  if (wordTokenCount(text) > 8) return false;
  if (/[.!?]$/.test(text)) return false;

  return section.body.filter((line) => plainLine(line)).length <= 2;
}

function isSubtitleOnlyChapterOpener(
  section: DraftSection,
  chapterSections: DraftSection[],
): boolean {
  if (chapterSections.length < 2 || chapterSections[0] !== section) return false;
  if (section.frontmatter.title !== section.frontmatter.chapterTitle) return false;

  return isSubtitleOnlyOpener(section);
}

function isSubtitleOnlyPartOpener(
  section: DraftSection,
  partSections: DraftSection[],
): boolean {
  if (partSections.length < 2 || partSections[0] !== section) return false;
  if (section.frontmatter.title !== section.frontmatter.partTitle) return false;

  return isSubtitleOnlyOpener(section);
}

function addAlias(section: DraftSection, sourceHref: string): void {
  const aliases = section.frontmatter.aliases ?? [];
  if (!aliases.includes(sourceHref)) {
    section.frontmatter.aliases = [...aliases, sourceHref];
  }
}

function fullDepthSectionHref(section: DraftSection): string {
  const fm = section.frontmatter;
  return `/manuscripts/${fm.volumeId}/${fm.partId}/${fm.chapterId}/${fm.sectionId}/`;
}

function addOpenerAliases(target: DraftSection, opener: DraftSection): void {
  addAlias(target, sectionHref(opener.frontmatter));
  addAlias(target, fullDepthSectionHref(opener));
}

function removeSubtitleOnlyOpeners(sections: DraftSection[]): DraftSection[] {
  const partSections = new Map<string, DraftSection[]>();
  const chapterSections = new Map<string, DraftSection[]>();
  for (const section of sections) {
    const part = partKey(section);
    const chapter = chapterKey(section);
    partSections.set(part, [...(partSections.get(part) ?? []), section]);
    chapterSections.set(chapter, [...(chapterSections.get(chapter) ?? []), section]);
  }

  const removed = new Set<DraftSection>();
  for (const group of partSections.values()) {
    const opener = group[0];
    const target = group[1];
    if (!opener || !target) continue;
    if (!isSubtitleOnlyPartOpener(opener, group)) continue;

    addOpenerAliases(target, opener);
    removed.add(opener);
  }

  for (const group of chapterSections.values()) {
    const opener = group[0];
    const target = group[1];
    if (opener && removed.has(opener)) continue;
    if (!opener || !target) continue;
    if (!isSubtitleOnlyChapterOpener(opener, group)) continue;

    addOpenerAliases(target, opener);
    removed.add(opener);
  }

  return sections.filter((section) => !removed.has(section));
}

function buildSections(config: VolumeConfig): DraftSection[] {
  const sourcePath = sourcePathFor(config);
  const source = normalizeNewlines(readUtf8(sourcePath));
  const sourceHash = fileHash(sourcePath);
  const sourceDoc = path.relative(repoRoot, sourcePath).replace(/\\/g, "/");
  const lines = source.split("\n");
  const sections: DraftSection[] = [];
  const usedSectionIds = new Set<string>();
  const usedPartIds = new Set<string>();
  const usedChapterIds = new Set<string>();
  let partOrder = 0;
  let partTitle = "Front Matter";
  let partId = "front-matter";
  let chapterOrder = 0;
  let chapterTitle = "Opening";
  let chapterId = "opening";
  let sectionOrder = 0;
  let current: DraftSection | null = null;

  function baseFrontmatter(title: string, lineNumber: number): ManuscriptFrontmatter {
    return {
      volumeId: config.volumeId,
      volumeTitle: config.title,
      volumeOrder: config.order,
      partId,
      partTitle,
      partOrder,
      chapterId,
      chapterTitle,
      chapterOrder,
      sectionId: "",
      title,
      sectionOrder,
      sourceDoc,
      sourceHash,
      sourceParagraphStart: lineNumber,
      sourceParagraphEnd: lineNumber,
    };
  }

  function createSection(title: string, lineNumber: number): DraftSection {
    sectionOrder += 1;
    const idBase = slugify(`v${String(config.order).padStart(2, "0")} ${title}`);
    const section: DraftSection = {
      frontmatter: {
        ...baseFrontmatter(title, lineNumber),
        sectionId: uniqueId(idBase, usedSectionIds),
        sectionOrder,
      },
      body: [],
    };
    sections.push(section);
    current = section;
    return section;
  }

  function startPart(title: string, explicitOrder: number | null): void {
    partOrder = explicitOrder ?? partOrder + 1;
    partTitle = title;
    partId = uniqueId(slugify(title), usedPartIds);
    chapterOrder = 0;
    chapterTitle = title;
    chapterId = uniqueId(slugify(title), usedChapterIds);
    sectionOrder = 0;
    current = null;
  }

  function startChapter(title: string, lineNumber: number): void {
    chapterOrder += 1;
    chapterTitle = title;
    chapterId = uniqueId(slugify(title), usedChapterIds);
    createSection(title, lineNumber);
  }

  function ensureSection(lineNumber: number): DraftSection {
    if (current) return current;
    return createSection(partTitle === "Front Matter" ? chapterTitle : partTitle, lineNumber);
  }

  for (let index = findStart(lines, config.volumeId); index < lines.length; index += 1) {
    const line = lines[index]!;
    if (ignoreLine(line)) continue;

    const part = partInfo(line);
    if (part) {
      let title = part.title;
      const heading = title ? null : nextHeading(lines, index + 1);
      if (!title && heading) {
        if (!/^chapter\s+/i.test(heading.heading.text)) {
          title = heading.heading.text;
          index = heading.index;
        }
      }
      startPart(title ?? `Part ${part.order ?? partOrder + 1}`, part.order);
      continue;
    }

    if (chapterMarker(line)) {
      const heading = nextHeading(lines, index + 1);
      if (heading) {
        startChapter(heading.heading.text, heading.index + 1);
        index = heading.index;
        continue;
      }
      startChapter(smartTitle(plainLine(line)), index + 1);
      continue;
    }

    const heading = markdownHeading(line);
    if (heading) {
      if (heading.level <= 2 || !current) {
        startChapter(heading.text, index + 1);
      } else {
        createSection(heading.text, index + 1);
      }
      continue;
    }

    const section = ensureSection(index + 1);
    section.body.push(line);
    section.frontmatter.sourceParagraphEnd = index + 1;
  }

  return removeSubtitleOnlyOpeners(
    sections.filter((section) => section.body.join("\n").trim().length > 0),
  );
}

function main(): void {
  const configs = readVolumeConfigs();
  if (configs.length === 0) {
    throw new Error("No volume configs found in content/series/volumes.json.");
  }
  cleanDir(manuscriptRoot);

  const reports = configs.map((config) => {
    const sections = buildSections(config);
    for (const section of sections) {
      const body = `${formatFrontmatter(section.frontmatter)}\n${normalizeNewlines(section.body.join("\n"))}\n`;
      writeUtf8(path.join(manuscriptRoot, sectionPath(section)), body);
    }
    return {
      volumeId: config.volumeId,
      title: config.title,
      sourcePath: config.sourcePath,
      sourceHash: fileHash(sourcePathFor(config)),
      sectionCount: sections.length,
      contentHash: sha256(sections.map((section) => section.body.join("\n")).join("\n\n")).slice(
        0,
        16,
      ),
    };
  });

  const reportPath = path.join(repoRoot, "artifacts/imports/markdown-series-report.json");
  ensureDir(path.dirname(reportPath));
  writeJson(reportPath, {
    generatedAt: new Date().toISOString(),
    source: "markdown-series",
    volumes: reports,
  });
  const sectionCount = reports.reduce((sum, report) => sum + report.sectionCount, 0);
  console.log(`Imported ${reports.length} Markdown volumes into ${sectionCount} sections`);
  console.log(`Report: ${path.relative(repoRoot, reportPath)}`);
}

main();
