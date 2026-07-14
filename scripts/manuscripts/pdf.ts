import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import {
  ensureDir,
  fileHash,
  sha256,
  type CompiledCatalog,
  type CompiledSection,
  type CompiledVolume,
} from "./shared";
import {
  publicDataRoot,
  publicDownloadsRoot,
  repoRoot,
} from "../repository/paths";

export const pdfManifestPath = path.join(publicDataRoot, "pdf-downloads.json");
// Incremental build cache (PERF-07). Lives inside the gitignored downloads
// directory: a fresh CI checkout starts empty and does a full build, while local
// author iterations only re-render the PDFs whose inputs changed.
const pdfBuildCachePath = path.join(publicDownloadsRoot, ".pdf-build-cache.json");

const sectionDownloadRoot = path.join(publicDownloadsRoot, "sections");
const manuscriptDownloadRoot = path.join(publicDownloadsRoot, "manuscripts");
const coverImageCache = new Map<string, Promise<Buffer>>();

type PdfFonts = {
  regular: string;
  bold: string;
  italic: string;
  mono: string;
};

type PdfBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "quote"; text: string }
  | { kind: "table"; rows: string[][] }
  | { kind: "list"; items: string[] }
  | { kind: "paragraph"; text: string };

type SectionRenderOptions = {
  includeHierarchy?: boolean;
  includeStats?: boolean;
  headingSize?: number;
};

export type PdfDownloadManifest = {
  sections: Array<{
    sectionId: string;
    volumeId: string;
    volumeTitle: string;
    title: string;
    href: string;
    pdfHref: string;
    fileName: string;
    contentHash: string;
  }>;
  manuscripts: Array<{
    volumeId: string;
    title: string;
    href: string;
    pdfHref: string;
    fileName: string;
    contentHash: string;
  }>;
};

function padNumber(value: number, size: number): string {
  return value.toString().padStart(size, "0");
}

function fileNameText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pdfFileName(number: string, name: string): string {
  return `The Coherence Thesis - ${number} - ${fileNameText(name)}.pdf`;
}

export function manuscriptPdfFileName(volume: CompiledVolume): string {
  return pdfFileName(padNumber(volume.order, 2), volume.title);
}

export function sectionPdfFileName(
  section: CompiledSection,
  volume?: CompiledVolume,
): string {
  const volumeSectionIndex = volume?.sectionIds.indexOf(section.sectionId) ?? -1;
  const sectionNumber = volumeSectionIndex >= 0 ? volumeSectionIndex + 1 : section.sectionOrder;

  return pdfFileName(
    `${padNumber(section.volumeOrder, 2)}.${padNumber(sectionNumber, 3)}`,
    section.title,
  );
}

export function sectionPdfHref(section: CompiledSection, volume?: CompiledVolume): string {
  return `/downloads/sections/${sectionPdfFileName(section, volume)}`;
}

export function manuscriptPdfHref(volume: CompiledVolume): string {
  return `/downloads/manuscripts/${manuscriptPdfFileName(volume)}`;
}

// Fonts are vendored in the repo (OFL PT Serif and PT Mono) and registered
// unconditionally so every build host renders identical, fully-glyphed PDFs.
// The previous probing of system font paths silently fell back to PDFKit core
// fonts (WinAnsi) on the deploy host, dropping every non-WinAnsi glyph.
const fontRoot = path.join(repoRoot, "fonts");
const fontFiles = {
  regular: "PTSerif-Regular.ttf",
  bold: "PTSerif-Bold.ttf",
  italic: "PTSerif-Italic.ttf",
  mono: "PTMono-Regular.ttf",
} as const;

function registerFonts(doc: PDFKit.PDFDocument): PdfFonts {
  const registered: Partial<PdfFonts> = {};
  for (const [role, fileName] of Object.entries(fontFiles)) {
    const fontPath = path.join(fontRoot, fileName);
    if (!fs.existsSync(fontPath)) {
      throw new Error(
        `Missing vendored PDF font: ${fontPath}. Reader PDFs require the repo fonts/ directory; refusing to build with PDFKit core fonts that drop non-WinAnsi glyphs.`,
      );
    }
    const alias = `reader-${role}`;
    doc.registerFont(alias, fontPath);
    registered[role as keyof PdfFonts] = alias;
  }
  return registered as PdfFonts;
}

function outputPathFromHref(href: string): string {
  return path.join(repoRoot, "public", href.replace(/^\//, ""));
}

function publicPathFromHref(href: string): string {
  return path.join(repoRoot, "public", href.replace(/^\//, ""));
}

async function pdfCoverImage(coverPath: string): Promise<Buffer | null> {
  if (!fs.existsSync(coverPath) || !fs.statSync(coverPath).isFile()) {
    return null;
  }

  let cachedCover = coverImageCache.get(coverPath);
  if (!cachedCover) {
    cachedCover = sharp(coverPath)
      .resize({
        fit: "inside",
        height: 1320,
        width: 880,
        withoutEnlargement: true,
      })
      .jpeg({ mozjpeg: true, quality: 86 })
      .toBuffer();
    coverImageCache.set(coverPath, cachedCover);
  }

  return cachedCover;
}

function plainInline(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[\u02c8\u02cc]/g, "'")
    .replace(/\\([\\`*_[\]()>#+.!-])/g, "$1")
    .trim();
}

function isTable(block: string): boolean {
  const lines = block.split("\n").map((line) => line.trim());
  return (
    lines.length >= 2 &&
    lines.every((line) => line.startsWith("|") && line.endsWith("|")) &&
    /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(lines[1] ?? "")
  );
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => plainInline(cell));
}

function parseMarkdownBlocks(markdown: string): PdfBlock[] {
  return markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      if (block.startsWith("### ")) {
        return { kind: "heading", level: 3, text: plainInline(block.slice(4)) };
      }
      if (block.startsWith("## ")) {
        return { kind: "heading", level: 2, text: plainInline(block.slice(3)) };
      }
      if (block.startsWith("# ")) {
        return { kind: "heading", level: 1, text: plainInline(block.slice(2)) };
      }
      if (block.startsWith("> ")) {
        return {
          kind: "quote",
          text: plainInline(block.replace(/^>\s?/gm, "")),
        };
      }
      if (isTable(block)) {
        return {
          kind: "table",
          rows: block
            .split("\n")
            .filter((line, index) => index !== 1 && line.trim())
            .map(tableCells),
        };
      }
      if (/^[-*]\s+/m.test(block)) {
        return {
          kind: "list",
          items: block
            .split("\n")
            .map((line) => line.replace(/^[-*]\s+/, "").trim())
            .filter(Boolean)
            .map(plainInline),
        };
      }
      return { kind: "paragraph", text: plainInline(block) };
    });
}

function paintPage(doc: PDFKit.PDFDocument): void {
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill("#fbf7ef");
  doc.restore();
}

function contentBottom(doc: PDFKit.PDFDocument): number {
  return doc.page.height - doc.page.margins.bottom;
}

function ensureSpace(doc: PDFKit.PDFDocument, points: number): void {
  if (doc.y + points > contentBottom(doc)) {
    doc.addPage();
  }
}

function addFooter(
  doc: PDFKit.PDFDocument,
  label: string,
  fonts: PdfFonts,
  startPage = 0,
): void {
  const pageCount = doc.bufferedPageRange().count;
  const printedPageCount = Math.max(pageCount - startPage, 0);
  for (let index = startPage; index < pageCount; index += 1) {
    doc.switchToPage(index);
    const pageNumber = index - startPage + 1;
    const bottom = doc.page.height - 46;
    const pageNumberText = `${pageNumber.toLocaleString()} of ${printedPageCount.toLocaleString()}`;
    doc.save();
    doc
      .font(fonts.regular)
      .fontSize(8)
      .fillColor("#7b6b5a")
      .text(label, 72, bottom, {
        height: 12,
        lineBreak: false,
        width: 300,
      })
      .text(pageNumberText, doc.page.width - 190, bottom, {
        align: "right",
        height: 12,
        lineBreak: false,
        width: 118,
      });
    doc.restore();
  }
}

function renderBlock(
  doc: PDFKit.PDFDocument,
  block: PdfBlock,
  fonts: PdfFonts,
): void {
  if (block.kind === "heading") {
    const size = block.level === 1 ? 20 : block.level === 2 ? 16 : 13;
    ensureSpace(doc, size * 3.2);
    doc
      .moveDown(block.level === 1 ? 1 : 0.65)
      .font(fonts.bold)
      .fontSize(size)
      .fillColor("#2c1f12")
      .text(block.text, { lineGap: 2 })
      .moveDown(0.35);
    return;
  }

  if (block.kind === "quote") {
    ensureSpace(doc, 54);
    doc
      .moveDown(0.25)
      .font(fonts.italic)
      .fontSize(11)
      .fillColor("#5f5245")
      .text(block.text, { indent: 18, lineGap: 3 })
      .moveDown(0.55);
    return;
  }

  if (block.kind === "table") {
    ensureSpace(doc, 70);
    doc.moveDown(0.35).font(fonts.mono).fontSize(8.5).fillColor("#2c1f12");
    for (const row of block.rows) {
      doc.text(row.join("  |  "), { lineGap: 2 });
    }
    doc.moveDown(0.55);
    return;
  }

  if (block.kind === "list") {
    ensureSpace(doc, 62);
    doc.moveDown(0.2).font(fonts.regular).fontSize(11.5).fillColor("#2c1f12");
    for (const item of block.items) {
      doc.text(`- ${item}`, { indent: 12, lineGap: 3 });
    }
    doc.moveDown(0.45);
    return;
  }

  ensureSpace(doc, 46);
  doc
    .font(fonts.regular)
    .fontSize(11.5)
    .fillColor("#2c1f12")
    .text(block.text, { lineGap: 3 })
    .moveDown(0.75);
}

async function writePdf(
  filePath: string,
  title: string,
  label: string,
  footerStartPage: number,
  render: (doc: PDFKit.PDFDocument, fonts: PdfFonts) => void | Promise<void>,
): Promise<void> {
  ensureDir(path.dirname(filePath));
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({
      autoFirstPage: false,
      bufferPages: true,
      info: {
        Author: "Providence Collective",
        Subject: "The Coherence Thesis",
        Title: title,
      },
      margins: { top: 72, right: 72, bottom: 72, left: 72 },
      size: "LETTER",
    });
    const stream = fs.createWriteStream(filePath);
    stream.on("finish", resolve);
    stream.on("error", reject);
    doc.on("error", reject);
    doc.pipe(stream);
    const fonts = registerFonts(doc);
    doc.on("pageAdded", () => paintPage(doc));
    doc.addPage();
    paintPage(doc);
    void (async () => {
      try {
        await render(doc, fonts);
        addFooter(doc, label, fonts, footerStartPage);
        doc.end();
      } catch (error) {
        reject(error);
      }
    })();
  });
}

async function renderCoverPage(
  doc: PDFKit.PDFDocument,
  volume: CompiledVolume,
  fonts: PdfFonts,
): Promise<void> {
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill("#17110c");

  const coverPath = publicPathFromHref(volume.coverImage);
  const coverImage = await pdfCoverImage(coverPath);
  if (coverImage) {
    doc.image(coverImage, 0, 0, {
      align: "center",
      fit: [doc.page.width, doc.page.height],
      valign: "center",
    });
  } else {
    doc
      .font(fonts.regular)
      .fontSize(10)
      .fillColor("#d9c3a3")
      .text("THE COHERENCE THESIS", 72, 190, {
        align: "center",
        characterSpacing: 1.2,
        width: doc.page.width - 144,
      });
    doc
      .moveDown(0.9)
      .font(fonts.bold)
      .fontSize(34)
      .fillColor("#fbf7ef")
      .text(volume.title, {
        align: "center",
        lineGap: 4,
        width: doc.page.width - 144,
      });
    if (volume.subtitle) {
      doc
        .moveDown(0.8)
        .font(fonts.italic)
        .fontSize(15)
        .fillColor("#d9c3a3")
        .text(volume.subtitle, {
          align: "center",
          lineGap: 3,
          width: doc.page.width - 144,
        });
    }
  }

  doc.restore();
}

function renderDocumentTitle(
  doc: PDFKit.PDFDocument,
  volume: CompiledVolume,
  fonts: PdfFonts,
  detail: string,
): void {
  doc
    .font(fonts.regular)
    .fontSize(10)
    .fillColor("#7b6b5a")
    .text(`VOLUME ${volume.numberLabel}`, { characterSpacing: 0.5 });
  doc.moveDown(0.35);
  doc
    .font(fonts.bold)
    .fontSize(28)
    .fillColor("#2c1f12")
    .text(volume.title, { lineGap: 2 });
  if (volume.subtitle) {
    doc.moveDown(0.35).font(fonts.italic).fontSize(14).text(volume.subtitle);
  }
  doc
    .moveDown(0.8)
    .font(fonts.regular)
    .fontSize(10)
    .fillColor("#7b6b5a")
    .text(detail);
  doc
    .moveDown(1.2)
    .strokeColor("#b08a5f")
    .lineWidth(0.8)
    .moveTo(72, doc.y)
    .lineTo(doc.page.width - 72, doc.y)
    .stroke();
  doc.moveDown(1.2);
}

function renderContents(
  doc: PDFKit.PDFDocument,
  volume: CompiledVolume,
  fonts: PdfFonts,
): void {
  ensureSpace(doc, 96);
  doc
    .font(fonts.bold)
    .fontSize(13)
    .fillColor("#2c1f12")
    .text("Contents");
  doc.moveDown(0.45);

  for (const part of volume.parts) {
    ensureSpace(doc, 42);
    doc
      .font(fonts.bold)
      .fontSize(9.5)
      .fillColor("#4b3928")
      .text(part.title, { lineGap: 1.5 });
    const chapters = part.chapters.filter((chapter) => chapter.title !== part.title);
    for (const chapter of chapters) {
      ensureSpace(doc, 24);
      doc
        .font(fonts.regular)
        .fontSize(8.5)
        .fillColor("#7b6b5a")
        .text(chapter.title, { indent: 14, lineGap: 1.25 });
    }
    doc.moveDown(0.35);
  }
  doc.moveDown(0.8);
}

function renderSection(
  doc: PDFKit.PDFDocument,
  section: CompiledSection,
  fonts: PdfFonts,
  options: SectionRenderOptions = {},
): void {
  const includeHierarchy = options.includeHierarchy ?? true;
  const includeStats = options.includeStats ?? true;
  const headingSize = options.headingSize ?? (includeHierarchy ? 23 : 18);

  ensureSpace(doc, includeHierarchy ? 120 : 82);
  doc.font(fonts.regular).fontSize(10).fillColor("#7b6b5a");
  if (includeHierarchy) {
    doc.text(section.volumeTitle.toUpperCase(), { characterSpacing: 0.5 });
    doc.moveDown(0.35);
  }
  doc
    .font(fonts.bold)
    .fontSize(headingSize)
    .fillColor("#2c1f12")
    .text(section.title, { lineGap: 2 });
  if (includeStats) {
    doc.moveDown(0.35);
    doc
      .font(fonts.regular)
      .fontSize(9.5)
      .fillColor("#7b6b5a")
      .text(
        `${section.wordCount.toLocaleString()} words, about ${section.readingMinutes.toLocaleString()} minute${
          section.readingMinutes === 1 ? "" : "s"
        }.`,
      );
  }
  doc.moveDown(1);

  for (const block of parseMarkdownBlocks(section.body)) {
    renderBlock(doc, block, fonts);
  }
}

function renderPartHeading(
  doc: PDFKit.PDFDocument,
  title: string,
  fonts: PdfFonts,
): void {
  ensureSpace(doc, 116);
  doc.moveDown(1.3);
  doc
    .font(fonts.regular)
    .fontSize(9)
    .fillColor("#8a6a48")
    .text("PART", { characterSpacing: 1.2 });
  doc.moveDown(0.25);
  doc
    .font(fonts.bold)
    .fontSize(22)
    .fillColor("#2c1f12")
    .text(title, { lineGap: 2 });
  doc
    .moveDown(0.6)
    .strokeColor("#b08a5f")
    .lineWidth(0.6)
    .moveTo(72, doc.y)
    .lineTo(doc.page.width - 72, doc.y)
    .stroke();
  doc.moveDown(0.9);
}

function renderChapterHeading(
  doc: PDFKit.PDFDocument,
  title: string,
  fonts: PdfFonts,
): void {
  ensureSpace(doc, 72);
  doc.moveDown(0.7);
  doc
    .font(fonts.bold)
    .fontSize(14)
    .fillColor("#4b3928")
    .text(title, { lineGap: 2 });
  doc.moveDown(0.35);
}

function volumeContentHash(volume: CompiledVolume, sections: CompiledSection[]): string {
  return sha256(
    volume.sectionIds
      .map((sectionId) => sections.find((section) => section.sectionId === sectionId)?.contentHash)
      .filter(Boolean)
      .join("\n"),
  ).slice(0, 16);
}

async function writeSectionPdf(
  section: CompiledSection,
  volume: CompiledVolume | undefined,
): Promise<void> {
  await writePdf(
    outputPathFromHref(sectionPdfHref(section, volume)),
    section.title,
    section.title,
    1,
    async (doc, fonts) => {
      if (volume) {
        await renderCoverPage(doc, volume, fonts);
        doc.addPage();
        renderDocumentTitle(
          doc,
          volume,
          fonts,
          `${section.wordCount.toLocaleString()} words, about ${section.readingMinutes.toLocaleString()} minute${
            section.readingMinutes === 1 ? "" : "s"
          }.`,
        );
      }
      renderSection(doc, section, fonts, {
        headingSize: 22,
        includeHierarchy: !volume,
        includeStats: false,
      });
    },
  );
}

function buildVolumeLookup(
  sections: CompiledSection[],
  volumes: CompiledVolume[] = [],
): Map<string, CompiledVolume> {
  const lookup = new Map<string, CompiledVolume>();
  for (const volume of volumes) {
    lookup.set(volume.volumeId, volume);
  }

  for (const section of sections) {
    if (lookup.has(section.volumeId)) continue;
    lookup.set(section.volumeId, {
      coverAlt: "",
      coverImage: "",
      href: `/manuscripts/${section.volumeId}/`,
      numberLabel: String(section.volumeOrder),
      order: section.volumeOrder,
      parts: [],
      planet: "",
      sectionIds: [],
      subtitle: "",
      title: section.volumeTitle,
      volumeId: section.volumeId,
      wordCount: section.wordCount,
    });
  }

  return lookup;
}

async function writeManuscriptPdf(
  volume: CompiledVolume,
  sections: CompiledSection[],
): Promise<void> {
  const volumeSections = sections.filter((section) => section.volumeId === volume.volumeId);
  await writePdf(
    outputPathFromHref(manuscriptPdfHref(volume)),
    volume.title,
    volume.title,
    1,
    async (doc, fonts) => {
      await renderCoverPage(doc, volume, fonts);
      doc.addPage();
      renderDocumentTitle(
        doc,
        volume,
        fonts,
        `${volume.wordCount.toLocaleString()} words across ${volumeSections.length.toLocaleString()} sections.`,
      );
      renderContents(doc, volume, fonts);

      let previousPartId: string | null = null;
      let previousChapterId: string | null = null;
      for (const section of volumeSections) {
        if (section.partId !== previousPartId) {
          renderPartHeading(doc, section.partTitle, fonts);
          previousPartId = section.partId;
          previousChapterId = null;
        }

        if (
          section.chapterId !== previousChapterId &&
          section.chapterTitle !== section.partTitle &&
          section.chapterTitle !== section.title
        ) {
          renderChapterHeading(doc, section.chapterTitle, fonts);
          previousChapterId = section.chapterId;
        } else if (section.chapterId !== previousChapterId) {
          previousChapterId = section.chapterId;
        }

        renderSection(doc, section, fonts, {
          headingSize: 15,
          includeHierarchy: false,
          includeStats: false,
        });
        doc.moveDown(0.65);
      }
    },
  );
}

type PdfBuildCache = { version: number; entries: Record<string, string> };

function readPdfBuildCache(): PdfBuildCache {
  try {
    const parsed = JSON.parse(fs.readFileSync(pdfBuildCachePath, "utf8")) as PdfBuildCache;
    if (parsed && typeof parsed === "object" && parsed.entries) return parsed;
  } catch {
    // Missing or unreadable cache means a full build.
  }
  return { version: 1, entries: {} };
}

// A signature of everything that affects rendering but is not part of a
// section's content: this module's own source (so a rendering-code change
// invalidates every PDF), the vendored fonts, and the cover images.
function renderSignature(volumes: CompiledVolume[]): string {
  const parts = [fileHash(path.join(import.meta.dirname, "pdf.ts"))];
  for (const fileName of Object.values(fontFiles)) {
    parts.push(fileHash(path.join(fontRoot, fileName)));
  }
  for (const cover of new Set(volumes.map((volume) => volume.coverImage).filter(Boolean))) {
    const coverPath = publicPathFromHref(cover);
    if (fs.existsSync(coverPath)) parts.push(fileHash(coverPath));
  }
  return sha256(parts.join("|")).slice(0, 16);
}

export function sectionRenderHash(
  section: CompiledSection,
  volume: CompiledVolume | undefined,
  signature: string,
): string {
  return sha256(
    [section.contentHash, volume?.title ?? "", volume?.numberLabel ?? "", signature].join("|"),
  ).slice(0, 16);
}

function volumeRenderHash(
  volume: CompiledVolume,
  sections: CompiledSection[],
  signature: string,
): string {
  return sha256(
    [volumeContentHash(volume, sections), volume.title, volume.numberLabel, signature].join("|"),
  ).slice(0, 16);
}

function pruneStalePdfs(expectedPaths: Set<string>): void {
  for (const root of [sectionDownloadRoot, manuscriptDownloadRoot]) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root)) {
      const filePath = path.join(root, entry);
      if (!filePath.endsWith(".pdf")) continue;
      if (!expectedPaths.has(filePath)) fs.rmSync(filePath, { force: true });
    }
  }
}

export async function buildPdfDownloads(
  catalog: CompiledCatalog,
): Promise<PdfDownloadManifest> {
  ensureDir(sectionDownloadRoot);
  ensureDir(manuscriptDownloadRoot);

  const volumesById = buildVolumeLookup(catalog.sections, catalog.volumes);
  const cache = readPdfBuildCache();
  const signature = renderSignature(catalog.volumes);
  const nextEntries: Record<string, string> = {};
  const expectedPaths = new Set<string>();
  let built = 0;
  let skipped = 0;

  for (const section of catalog.sections) {
    const volume = volumesById.get(section.volumeId);
    const outputPath = outputPathFromHref(sectionPdfHref(section, volume));
    const hash = sectionRenderHash(section, volume, signature);
    expectedPaths.add(outputPath);
    nextEntries[outputPath] = hash;
    if (fs.existsSync(outputPath) && cache.entries[outputPath] === hash) {
      skipped += 1;
      continue;
    }
    await writeSectionPdf(section, volume);
    built += 1;
  }

  for (const volume of catalog.volumes) {
    const outputPath = outputPathFromHref(manuscriptPdfHref(volume));
    const hash = volumeRenderHash(volume, catalog.sections, signature);
    expectedPaths.add(outputPath);
    nextEntries[outputPath] = hash;
    if (fs.existsSync(outputPath) && cache.entries[outputPath] === hash) {
      skipped += 1;
      continue;
    }
    await writeManuscriptPdf(volume, catalog.sections);
    built += 1;
  }

  pruneStalePdfs(expectedPaths);
  fs.writeFileSync(
    pdfBuildCachePath,
    `${JSON.stringify({ version: 1, entries: nextEntries }, null, 2)}\n`,
  );
  console.log(`PDF downloads: ${built} built, ${skipped} unchanged`);

  return {
    sections: catalog.sections.map((section) => ({
      sectionId: section.sectionId,
      volumeId: section.volumeId,
      volumeTitle: section.volumeTitle,
      title: section.title,
      href: section.href,
      pdfHref: sectionPdfHref(section, volumesById.get(section.volumeId)),
      fileName: sectionPdfFileName(section, volumesById.get(section.volumeId)),
      contentHash: section.contentHash,
    })),
    manuscripts: catalog.volumes.map((volume) => ({
      volumeId: volume.volumeId,
      title: volume.title,
      href: volume.href,
      pdfHref: manuscriptPdfHref(volume),
      fileName: manuscriptPdfFileName(volume),
      contentHash: volumeContentHash(volume, catalog.sections),
    })),
  };
}
