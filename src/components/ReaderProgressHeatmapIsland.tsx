"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, RotateCcw } from "lucide-react";
import { useReaderProgress } from "@/lib/reader-progress-store";
import {
  progressForHeatmapCell,
  readCellsPercent,
  type ReaderHeatmapCell,
  type ReaderHeatmapModel,
  type ReaderHeatmapSectionPortion,
} from "@/lib/reader-heatmap";
import { isSectionRead, updatedSinceRead } from "@/lib/reader-state";

type CellStyle = CSSProperties & {
  "--cell-progress": number;
};

type ActiveHeatmapCell = {
  id: string;
  mode: "hover" | "active";
} | null;

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

function uniqueCellSections(cell: ReaderHeatmapCell): ReaderHeatmapSectionPortion[] {
  const sections = new Map<string, ReaderHeatmapSectionPortion>();
  for (const portion of cell.portions) {
    if (!sections.has(portion.sectionId)) sections.set(portion.sectionId, portion);
  }
  return [...sections.values()];
}

function uniqueModelSections(
  model: ReaderHeatmapModel,
): ReaderHeatmapSectionPortion[] {
  const sections = new Map<string, ReaderHeatmapSectionPortion>();
  for (const volume of model.volumes) {
    for (const cell of volume.cells) {
      for (const portion of cell.portions) {
        if (!sections.has(portion.sectionId)) sections.set(portion.sectionId, portion);
      }
    }
  }
  return [...sections.values()];
}

function sectionCountLabel(count: number): string {
  return `${count.toLocaleString()} section${count === 1 ? "" : "s"}`;
}

function cellStatusClass({
  percent,
  revised,
}: {
  percent: number;
  revised: boolean;
}): string {
  if (revised) return "progress-heatmap-cell progress-heatmap-cell-revised";
  if (percent >= 100) return "progress-heatmap-cell progress-heatmap-cell-read";
  if (percent > 0) return "progress-heatmap-cell progress-heatmap-cell-partial";
  return "progress-heatmap-cell progress-heatmap-cell-unread";
}

function ReaderProgressHeatmapCell({
  cell,
  progress,
  volumeTitle,
  activeCell,
  setActiveCell,
}: {
  cell: ReaderHeatmapCell;
  progress: ReturnType<typeof useReaderProgress>;
  volumeTitle: string;
  activeCell: ActiveHeatmapCell;
  setActiveCell: Dispatch<SetStateAction<ActiveHeatmapCell>>;
}) {
  const cellButtonRef = useRef<HTMLButtonElement | null>(null);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const state = progressForHeatmapCell(progress, cell);
  const tooltipId = `progress-heatmap-tooltip-${cell.id}`;
  const cellSections = uniqueCellSections(cell);
  const isOpen = activeCell?.id === cell.id;
  const label = cellLabel({
    cell,
    percent: state.percent,
    revised: state.revised,
    volumeTitle,
  });

  const clearHoverCloseTimer = useCallback(() => {
    if (!hoverCloseTimer.current) return;
    clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = null;
  }, []);

  const openCell = useCallback(
    (mode: "hover" | "active") => {
      clearHoverCloseTimer();
      setActiveCell({ id: cell.id, mode });
    },
    [cell.id, clearHoverCloseTimer, setActiveCell],
  );

  const closeCell = useCallback(() => {
    clearHoverCloseTimer();
    setActiveCell((current) => (current?.id === cell.id ? null : current));
  }, [cell.id, clearHoverCloseTimer, setActiveCell]);

  const queueHoverClose = useCallback(() => {
    clearHoverCloseTimer();
    hoverCloseTimer.current = setTimeout(() => {
      setActiveCell((current) =>
        current?.id === cell.id && current.mode === "hover" ? null : current,
      );
    }, 90);
  }, [cell.id, clearHoverCloseTimer, setActiveCell]);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeCell();
    }

    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => document.removeEventListener("keydown", handleDocumentKeyDown);
  }, [closeCell, isOpen]);

  useEffect(() => clearHoverCloseTimer, [clearHoverCloseTimer]);

  return (
    <div className="progress-heatmap-cell-wrap">
      <Popover.Root
        open={isOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) closeCell();
        }}
      >
        <Popover.Anchor asChild>
          <button
            ref={cellButtonRef}
            type="button"
            className={cellStatusClass(state)}
            aria-label={label}
            aria-describedby={isOpen ? tooltipId : undefined}
            aria-expanded={isOpen}
            aria-haspopup="dialog"
            onClick={() => openCell("active")}
            onFocus={() => openCell("active")}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closeCell();
              }
            }}
            onMouseEnter={() => openCell("hover")}
            onMouseLeave={queueHoverClose}
            style={{ "--cell-progress": state.percent / 100 } as CellStyle}
          >
            <span className="sr-only">{label}</span>
            {state.revised && <RotateCcw aria-hidden="true" size={10} />}
            {!state.revised && state.percent >= 100 && (
              <Check aria-hidden="true" size={10} />
            )}
          </button>
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            id={tooltipId}
            className="progress-heatmap-tooltip tooltip-surface"
            role="dialog"
            aria-label="Section jump links"
            side="top"
            align="start"
            sideOffset={12}
            collisionPadding={10}
            arrowPadding={12}
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => {
              const target = event.target;
              if (
                target instanceof Node &&
                cellButtonRef.current?.contains(target)
              ) {
                event.preventDefault();
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closeCell();
              }
            }}
            onMouseEnter={clearHoverCloseTimer}
            onMouseLeave={queueHoverClose}
          >
            <div className="progress-heatmap-tooltip-content">
              <p className="progress-heatmap-tooltip-title">
                <span className="progress-heatmap-tooltip-count">
                  {sectionCountLabel(cellSections.length)}
                </span>
                <span className="progress-heatmap-tooltip-read-tag">
                  {state.percent}% read
                </span>
                {state.revised && (
                  <span className="progress-heatmap-tooltip-status-tag">
                    revised
                  </span>
                )}
              </p>
              <div className="progress-heatmap-tooltip-links">
                {cellSections.map((section) => (
                  <a key={section.sectionId} href={section.href}>
                    <span
                      className="progress-heatmap-tooltip-link-indicator"
                      aria-hidden="true"
                    >
                      ››
                    </span>
                    <span className="progress-heatmap-tooltip-link-title">
                      {section.title}
                    </span>
                  </a>
                ))}
              </div>
            </div>
            <Popover.Arrow
              className="progress-heatmap-tooltip-arrow tooltip-arrow"
              width={30}
              height={15}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

export function ReaderProgressHeatmapIsland({
  model,
}: {
  model: ReaderHeatmapModel;
}) {
  const progress = useReaderProgress();
  const [activeCell, setActiveCell] = useState<ActiveHeatmapCell>(null);
  const cells = useMemo(
    () => model.volumes.flatMap((volume) => volume.cells),
    [model],
  );
  const sections = useMemo(() => uniqueModelSections(model), [model]);
  const totalPercent = useMemo(
    () => readCellsPercent(progress, cells),
    [cells, progress],
  );
  const sectionsReadCount = useMemo(
    () => sections.filter((section) => isSectionRead(progress, section)).length,
    [progress, sections],
  );
  const revisedSectionCount = useMemo(
    () => sections.filter((section) => updatedSinceRead(progress, section)).length,
    [progress, sections],
  );

  return (
    <section className="progress-heatmap" aria-label="Reading heatmap">
      <div className="progress-heatmap-summary" aria-label="Reading progress summary">
        <div>
          <strong>{totalPercent}%</strong>
          <span>complete</span>
        </div>
        <div>
          <strong>
            {sectionsReadCount.toLocaleString()}/{sections.length.toLocaleString()}
          </strong>
          <span>sections read</span>
        </div>
        <div>
          <strong>{revisedSectionCount.toLocaleString()}</strong>
          <span>revised sections</span>
        </div>
      </div>

      {model.volumes.map((volume) => {
        const volumePercent = readCellsPercent(progress, volume.cells);

        return (
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
              <div
                className="progress-heatmap-volume-meta"
                aria-label={`Volume ${volume.numberLabel} reading progress`}
              >
                <p className="progress-heatmap-volume-read-tag">
                  {volumePercent}% read
                </p>
                <p className="progress-heatmap-volume-stats">
                  {volume.sectionCount.toLocaleString()} sections,{" "}
                  {volume.wordCount.toLocaleString()} words
                </p>
              </div>
            </div>
            <div className="progress-heatmap-grid">
              {volume.cells.map((cell) => {
                return (
                  <ReaderProgressHeatmapCell
                    key={cell.id}
                    activeCell={activeCell}
                    cell={cell}
                    progress={progress}
                    setActiveCell={setActiveCell}
                    volumeTitle={volume.title}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </section>
  );
}
