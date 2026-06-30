import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import {
  cleanDir,
  ensureDir,
  publicDataRoot,
  repoRoot,
  sha256,
  type CompiledCatalog,
  type CompiledSection,
  type CompiledVolume,
} from "./shared";

const publicDownloadsRoot = path.join(repoRoot, "public/downloads");
export const pdfManifestPath = path.join(publicDataRoot, "pdf-downloads.json");

const sectionDownloadRoot = path.join(publicDownloadsRoot, "sections");
const manuscriptDownloadRoot = path.join(publicDownloadsRoot, "manuscripts");

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

export type PdfDownloadManifest = {
  sections: Array<{
    sectionId: string;
    volumeId: string;
    volumeTitle: string;
    title: string;
    href: string;
    pdfHref: string;
    contentHash: string;
  }>;
  manuscripts: Array<{
    volumeId: string;
    title: string;
    href: string;
    pdfHref: string;
    contentHash: string;
  }>;
};

export function sectionPdfHref(sectionId: string): string {
  return `/downloads/sections/${sectionId}.pdf`;
}

export function manuscriptPdfHref(volumeId: string): string {
  return `/downloads/manuscripts/${volumeId}.pdf`;
}

function firstExistingPath(paths: string[]): string | null {
  return paths.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function registerFonts(doc: PDFKit.PDFDocument): PdfFonts {
  const regular = firstExistingPath([
    "/System/Library/Fonts/Supplemental/Georgia.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf",
  ]);
  const bold = firstExistingPath([
    "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSerif-Bold.ttf",
  ]);
  const italic = firstExistingPath([
    "/System/Library/Fonts/Supplemental/Georgia Italic.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSerif-Italic.ttf",
  ]);
  const mono = firstExistingPath([
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationMono-Regular.ttf",
  ]);

  if (regular && bold && italic && mono) {
    doc.registerFont("reader-regular", regular);
    doc.registerFont("reader-bold", bold);
    doc.registerFont("reader-italic", italic);
    doc.registerFont("reader-mono", mono);
    return {
      regular: "reader-regular",
      bold: "reader-bold",
      italic: "reader-italic",
      mono: "reader-mono",
    };
  }

  return {
    regular: "Times-Roman",
    bold: "Times-Bold",
    italic: "Times-Italic",
    mono: "Courier",
  };
}

function outputPathFromHref(href: string): string {
  return path.join(repoRoot, "public", href.replace(/^\//, ""));
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
    /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(lines[1])
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

function addFooter(doc: PDFKit.PDFDocument, label: string, fonts: PdfFonts): void {
  const pageCount = doc.bufferedPageRange().count;
  for (let index = 0; index < pageCount; index += 1) {
    doc.switchToPage(index);
    const pageNumber = index + 1;
    const bottom = doc.page.height - 46;
    doc
      .font(fonts.regular)
      .fontSize(8)
      .fillColor("#7b6b5a")
      .text(label, 72, bottom, { continued: true, width: 320 })
      .text(`${pageNumber.toLocaleString()} of ${pageCount.toLocaleString()}`, {
        align: "right",
      });
  }
}

function renderBlock(
  doc: PDFKit.PDFDocument,
  block: PdfBlock,
  fonts: PdfFonts,
): void {
  if (block.kind === "heading") {
    const size = block.level === 1 ? 20 : block.level === 2 ? 16 : 13;
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
    doc.moveDown(0.35).font(fonts.mono).fontSize(8.5).fillColor("#2c1f12");
    for (const row of block.rows) {
      doc.text(row.join("  |  "), { lineGap: 2 });
    }
    doc.moveDown(0.55);
    return;
  }

  if (block.kind === "list") {
    doc.moveDown(0.2).font(fonts.regular).fontSize(11.5).fillColor("#2c1f12");
    for (const item of block.items) {
      doc.text(`- ${item}`, { indent: 12, lineGap: 3 });
    }
    doc.moveDown(0.45);
    return;
  }

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
  render: (doc: PDFKit.PDFDocument, fonts: PdfFonts) => void,
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
    doc.addPage();
    render(doc, fonts);
    addFooter(doc, label, fonts);
    doc.end();
  });
}

function renderSection(
  doc: PDFKit.PDFDocument,
  section: CompiledSection,
  fonts: PdfFonts,
  includeHierarchy = true,
): void {
  doc.font(fonts.regular).fontSize(10).fillColor("#7b6b5a");
  if (includeHierarchy) {
    doc.text(section.volumeTitle.toUpperCase(), { characterSpacing: 0.5 });
    doc.moveDown(0.35);
  }
  doc
    .font(fonts.bold)
    .fontSize(includeHierarchy ? 23 : 18)
    .fillColor("#2c1f12")
    .text(section.title, { lineGap: 2 });
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
  doc.moveDown(1);

  for (const block of parseMarkdownBlocks(section.body)) {
    renderBlock(doc, block, fonts);
  }
}

function volumeContentHash(volume: CompiledVolume, sections: CompiledSection[]): string {
  return sha256(
    volume.sectionIds
      .map((sectionId) => sections.find((section) => section.sectionId === sectionId)?.contentHash)
      .filter(Boolean)
      .join("\n"),
  ).slice(0, 16);
}

async function writeSectionPdf(section: CompiledSection): Promise<void> {
  await writePdf(
    outputPathFromHref(sectionPdfHref(section.sectionId)),
    section.title,
    section.title,
    (doc, fonts) => renderSection(doc, section, fonts),
  );
}

async function writeManuscriptPdf(
  volume: CompiledVolume,
  sections: CompiledSection[],
): Promise<void> {
  const volumeSections = sections.filter((section) => section.volumeId === volume.volumeId);
  await writePdf(
    outputPathFromHref(manuscriptPdfHref(volume.volumeId)),
    volume.title,
    volume.title,
    (doc, fonts) => {
      doc
        .font(fonts.regular)
        .fontSize(10)
        .fillColor("#7b6b5a")
        .text(volume.numberLabel.toUpperCase(), { characterSpacing: 0.5 });
      doc.moveDown(0.35);
      doc
        .font(fonts.bold)
        .fontSize(28)
        .fillColor("#2c1f12")
        .text(volume.title, { lineGap: 2 });
      if (volume.subtitle) {
        doc.moveDown(0.3).font(fonts.italic).fontSize(14).text(volume.subtitle);
      }
      doc
        .moveDown(0.7)
        .font(fonts.regular)
        .fontSize(10)
        .fillColor("#7b6b5a")
        .text(
          `${volume.wordCount.toLocaleString()} words across ${volumeSections.length.toLocaleString()} sections.`,
        );

      volumeSections.forEach((section, index) => {
        doc.addPage();
        renderSection(doc, section, fonts, false);
        if (index < volumeSections.length - 1) {
          doc.moveDown(0.5);
        }
      });
    },
  );
}

export async function buildPdfDownloads(
  catalog: CompiledCatalog,
): Promise<PdfDownloadManifest> {
  cleanDir(publicDownloadsRoot);
  ensureDir(sectionDownloadRoot);
  ensureDir(manuscriptDownloadRoot);

  for (const section of catalog.sections) {
    await writeSectionPdf(section);
  }

  for (const volume of catalog.volumes) {
    await writeManuscriptPdf(volume, catalog.sections);
  }

  return {
    sections: catalog.sections.map((section) => ({
      sectionId: section.sectionId,
      volumeId: section.volumeId,
      volumeTitle: section.volumeTitle,
      title: section.title,
      href: section.href,
      pdfHref: sectionPdfHref(section.sectionId),
      contentHash: section.contentHash,
    })),
    manuscripts: catalog.volumes.map((volume) => ({
      volumeId: volume.volumeId,
      title: volume.title,
      href: volume.href,
      pdfHref: manuscriptPdfHref(volume.volumeId),
      contentHash: volumeContentHash(volume, catalog.sections),
    })),
  };
}
