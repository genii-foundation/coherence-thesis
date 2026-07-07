"use client";

import { useMemo, type CSSProperties } from "react";
import { RotateCcw } from "lucide-react";
import { useReaderProgress } from "@/lib/reader-progress-store";
import {
  progressForHeatmapCell,
  readCellsPercent,
  revisedCellsCount,
  type ReaderHeatmapCell,
  type ReaderHeatmapModel,
} from "@/lib/reader-heatmap";

type CellStyle = CSSProperties & {
  "--cell-progress": number;
};

function cellLabel({
  cell,
  percent,
  revised,
  volumeTitle,
}: {
  cell: ReaderHeatmapCell;
  percent: number;
  revised: boolean;
  volumeTitle: string;
}): string {
  const revisedText = revised ? ", revised since read" : "";
  return `${volumeTitle}, ${cell.primary.title}, ${percent}% read${revisedText}`;
}

export function ReaderProgressHeatmapIsland({
  model,
}: {
  model: ReaderHeatmapModel;
}) {
  const progress = useReaderProgress();
  const cells = useMemo(
    () => model.volumes.flatMap((volume) => volume.cells),
    [model],
  );
  const totalPercent = useMemo(
    () => readCellsPercent(progress, cells),
    [cells, progress],
  );
  const revisedCount = useMemo(
    () => revisedCellsCount(progress, cells),
    [cells, progress],
  );

  return (
    <section className="progress-heatmap" aria-label="Reading heatmap">
      <div className="progress-heatmap-summary" aria-label="Reading progress summary">
        <div>
          <strong>{totalPercent}%</strong>
          <span>complete</span>
        </div>
        <div>
          <strong>{model.totalCells.toLocaleString()}</strong>
          <span>squares</span>
        </div>
        <div>
          <strong>{revisedCount.toLocaleString()}</strong>
          <span>revised</span>
        </div>
      </div>

      {model.volumes.map((volume) => (
        <section
          key={volume.volumeId}
          className={`progress-heatmap-volume manuscript-cover-card-${volume.order}`}
          aria-labelledby={`progress-heatmap-${volume.volumeId}`}
        >
          <div className="progress-heatmap-heading">
            <div>
              <p className="eyebrow">Volume {volume.numberLabel}</p>
              <h2 id={`progress-heatmap-${volume.volumeId}`}>{volume.title}</h2>
            </div>
            <p>
              {volume.cellCount.toLocaleString()} squares,{" "}
              {volume.wordCount.toLocaleString()} words
            </p>
          </div>
          <div className="progress-heatmap-grid">
            {volume.cells.map((cell) => {
              const state = progressForHeatmapCell(progress, cell);
              const label = cellLabel({
                cell,
                percent: state.percent,
                revised: state.revised,
                volumeTitle: volume.title,
              });

              return (
                <a
                  key={cell.id}
                  className={
                    state.revised
                      ? "progress-heatmap-cell progress-heatmap-cell-revised"
                      : "progress-heatmap-cell"
                  }
                  href={cell.primary.href}
                  aria-label={label}
                  title={label}
                  style={{ "--cell-progress": state.percent / 100 } as CellStyle}
                >
                  <span className="sr-only">{label}</span>
                  {state.revised && <RotateCcw aria-hidden="true" size={10} />}
                </a>
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
}
