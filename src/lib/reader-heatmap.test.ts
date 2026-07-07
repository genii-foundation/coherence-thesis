import { describe, expect, it } from "vitest";
import {
  buildReaderHeatmapModel,
  progressForHeatmapCell,
  readerHeatmapCellCount,
  readCellsPercent,
  revisedCellsCount,
} from "./reader-heatmap";
import { emptyProgress, markRead, recordScrollProgress } from "./reader-state";

describe("reader heatmap", () => {
  it("builds exactly one thousand cells across the manuscript volumes", () => {
    const model = buildReaderHeatmapModel();
    const cells = model.volumes.flatMap((volume) => volume.cells);

    expect(model.totalCells).toBe(readerHeatmapCellCount);
    expect(cells).toHaveLength(readerHeatmapCellCount);
    expect(model.volumes).toHaveLength(9);
    expect(model.volumes.every((volume) => volume.cells.length > 0)).toBe(true);
  });

  it("allows short adjacent sections to share a cell", () => {
    const model = buildReaderHeatmapModel();
    const stackedCell = model.volumes
      .flatMap((volume) => volume.cells)
      .find((cell) => cell.portions.length > 1);

    expect(stackedCell).toBeDefined();
    expect(
      stackedCell?.portions.reduce((total, portion) => total + portion.fraction, 0),
    ).toBeCloseTo(1, 5);
  });

  it("computes graduated fill from partial section progress", () => {
    const model = buildReaderHeatmapModel();
    const cell = model.volumes[0]!.cells[0]!;
    const progress = cell.portions.reduce(
      (current, portion) => recordScrollProgress(current, portion, 50),
      emptyProgress(),
    );

    expect(progressForHeatmapCell(progress, cell)).toMatchObject({
      percent: 50,
      revised: false,
    });
  });

  it("marks revised cells when a completed section has a newer hash", () => {
    const model = buildReaderHeatmapModel();
    const cell = model.volumes[0]!.cells[0]!;
    const progress = markRead(
      emptyProgress(),
      { ...cell.primary, contentHash: "previous-version" },
      100,
      1_700,
    );

    expect(progressForHeatmapCell(progress, cell)).toMatchObject({
      percent: 100,
      revised: true,
    });
  });

  it("summarizes completed and revised cell counts", () => {
    const model = buildReaderHeatmapModel();
    const cells = model.volumes[0]!.cells.slice(0, 2);
    const progress = markRead(emptyProgress(), cells[0]!.primary, 100, 1_700);

    expect(readCellsPercent(progress, cells)).toBeGreaterThan(0);
    expect(readCellsPercent(progress, cells)).toBeLessThan(100);
    expect(revisedCellsCount(progress, cells)).toBe(0);
  });
});
