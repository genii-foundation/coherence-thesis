import { catalog, type Section, type Volume } from "./manuscript-data";
import { type ReaderProgressState, updatedSinceRead } from "./reader-state";

export const readerHeatmapCellCount = 100;

type WeightedItem = {
  id: string;
  weight: number;
};

export type ReaderHeatmapSectionPortion = {
  sectionId: string;
  contentHash: string;
  title: string;
  href: string;
  wordCount: number;
  fraction: number;
};

export type ReaderHeatmapCell = {
  id: string;
  index: number;
  volumeId: string;
  volumeOrder: number;
  primary: ReaderHeatmapSectionPortion;
  portions: ReaderHeatmapSectionPortion[];
};

export type ReaderHeatmapVolume = {
  volumeId: string;
  title: string;
  numberLabel: string;
  order: number;
  href: string;
  wordCount: number;
  sectionCount: number;
  cellCount: number;
  cells: ReaderHeatmapCell[];
};

export type ReaderHeatmapModel = {
  totalCells: number;
  totalWords: number;
  volumes: ReaderHeatmapVolume[];
};

export type ReaderHeatmapCellProgress = {
  percent: number;
  revised: boolean;
};

function clampPercent(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function positiveWeight(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function allocateCells(items: WeightedItem[], totalCells: number): Map<string, number> {
  if (items.length === 0 || totalCells <= 0) return new Map();

  const totalWeight = items.reduce((total, item) => total + positiveWeight(item.weight), 0);
  const allocations = items.map((item) => {
    const exact = (positiveWeight(item.weight) / totalWeight) * totalCells;
    return {
      id: item.id,
      count: Math.max(1, Math.floor(exact)),
      remainder: exact - Math.floor(exact),
    };
  });

  let assigned = allocations.reduce((total, item) => total + item.count, 0);

  if (assigned < totalCells) {
    const byRemainder = [...allocations].sort((a, b) => b.remainder - a.remainder);
    let index = 0;
    while (assigned < totalCells) {
      const entry = byRemainder[index % byRemainder.length];
      if (entry) entry.count += 1;
      assigned += 1;
      index += 1;
    }
  }

  if (assigned > totalCells) {
    const byRemainder = [...allocations].sort((a, b) => a.remainder - b.remainder);
    let index = 0;
    while (assigned > totalCells) {
      const item = byRemainder[index % byRemainder.length];
      if (item && item.count > 1) {
        item.count -= 1;
        assigned -= 1;
      }
      index += 1;
    }
  }

  return new Map(allocations.map((item) => [item.id, item.count]));
}

function sectionsForVolume(volume: Volume, sections: Section[]): Section[] {
  const sectionIds = new Set(volume.sectionIds);
  return sections.filter((section) => sectionIds.has(section.sectionId));
}

function buildVolumeCells({
  volume,
  sections,
  cellCount,
  startIndex,
}: {
  volume: Volume;
  sections: Section[];
  cellCount: number;
  startIndex: number;
}): ReaderHeatmapCell[] {
  if (sections.length === 0 || cellCount <= 0) return [];

  const ranges = sections.reduce<
    Array<{ section: Section; start: number; end: number }>
  >((items, section) => {
    const start = items.at(-1)?.end ?? 0;
    const end = start + positiveWeight(section.wordCount);
    items.push({ section, start, end });
    return items;
  }, []);
  const totalWords = ranges.at(-1)?.end ?? 1;
  const cells: ReaderHeatmapCell[] = [];
  let rangeIndex = 0;

  for (let cellOffset = 0; cellOffset < cellCount; cellOffset += 1) {
    const cellStart = (totalWords * cellOffset) / cellCount;
    const cellEnd = (totalWords * (cellOffset + 1)) / cellCount;
    const cellSpan = Math.max(1, cellEnd - cellStart);

    while (
      rangeIndex < ranges.length - 1 &&
      (ranges[rangeIndex]?.end ?? Infinity) <= cellStart
    ) {
      rangeIndex += 1;
    }

    const portions: ReaderHeatmapSectionPortion[] = [];
    for (let index = rangeIndex; index < ranges.length; index += 1) {
      const range = ranges[index];
      if (!range || range.start >= cellEnd) break;
      const overlap = Math.min(cellEnd, range.end) - Math.max(cellStart, range.start);
      if (overlap <= 0) continue;
      portions.push({
        sectionId: range.section.sectionId,
        contentHash: range.section.contentHash,
        title: range.section.title,
        href: range.section.href,
        wordCount: range.section.wordCount,
        fraction: overlap / cellSpan,
      });
    }

    // ranges is non-empty here (the early return guards sections.length === 0),
    // so this index is always valid.
    const fallback = ranges[Math.min(rangeIndex, ranges.length - 1)]!.section;
    const resolvedPortions =
      portions.length > 0
        ? portions
        : [
            {
              sectionId: fallback.sectionId,
              contentHash: fallback.contentHash,
              title: fallback.title,
              href: fallback.href,
              wordCount: fallback.wordCount,
              fraction: 1,
            },
          ];
    const primary = resolvedPortions.reduce((largest, portion) =>
      portion.fraction > largest.fraction ? portion : largest,
    );

    cells.push({
      id: `${volume.volumeId}-${cellOffset}`,
      index: startIndex + cellOffset,
      volumeId: volume.volumeId,
      volumeOrder: volume.order,
      primary,
      portions: resolvedPortions,
    });
  }

  return cells;
}

export function buildReaderHeatmapModel(
  totalCells = readerHeatmapCellCount,
): ReaderHeatmapModel {
  const volumeCells = allocateCells(
    catalog.volumes.map((volume) => ({
      id: volume.volumeId,
      weight: volume.wordCount,
    })),
    totalCells,
  );
  let startIndex = 0;

  const volumes = catalog.volumes.map((volume) => {
    const cellCount = volumeCells.get(volume.volumeId) ?? 0;
    const sections = sectionsForVolume(volume, catalog.sections);
    const cells = buildVolumeCells({
      volume,
      sections,
      cellCount,
      startIndex,
    });
    startIndex += cells.length;
    return {
      volumeId: volume.volumeId,
      title: volume.title,
      numberLabel: volume.numberLabel,
      order: volume.order,
      href: volume.href,
      wordCount: volume.wordCount,
      sectionCount: sections.length,
      cellCount: cells.length,
      cells,
    };
  });

  return {
    totalCells: volumes.reduce((total, volume) => total + volume.cells.length, 0),
    totalWords: catalog.stats.wordCount,
    volumes,
  };
}

export function progressForHeatmapCell(
  progress: ReaderProgressState,
  cell: ReaderHeatmapCell,
): ReaderHeatmapCellProgress {
  let percent = 0;
  let revised = false;

  for (const portion of cell.portions) {
    const state = progress.sections[portion.sectionId];
    percent += clampPercent(state?.percent) * portion.fraction;
    revised =
      revised ||
      updatedSinceRead(progress, {
        sectionId: portion.sectionId,
        contentHash: portion.contentHash,
      });
  }

  return {
    percent: Math.round(percent),
    revised,
  };
}

export function readCellsPercent(
  progress: ReaderProgressState,
  cells: ReaderHeatmapCell[],
): number {
  if (cells.length === 0) return 0;
  const total = cells.reduce(
    (sum, cell) => sum + progressForHeatmapCell(progress, cell).percent,
    0,
  );
  return Math.round(total / cells.length);
}

export function revisedCellsCount(
  progress: ReaderProgressState,
  cells: ReaderHeatmapCell[],
): number {
  return cells.filter((cell) => progressForHeatmapCell(progress, cell).revised).length;
}
