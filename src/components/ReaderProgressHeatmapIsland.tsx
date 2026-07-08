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
import {
  arrow,
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  type Placement,
  shift,
  useFloating,
} from "@floating-ui/react";
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

function tooltipArrowSide(placement: Placement): "top" | "right" | "bottom" | "left" {
  const side = placement.split("-")[0];
  if (side === "top") return "bottom";
  if (side === "right") return "left";
  if (side === "bottom") return "top";
  return "right";
}

function tooltipPlacementSide(placement: Placement): string {
  return placement.split("-")[0] ?? "top";
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
  const [arrowElement, setArrowElement] = useState<HTMLSpanElement | null>(null);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const state = progressForHeatmapCell(progress, cell);
  const tooltipId = `progress-heatmap-tooltip-${cell.id}`;
  const cellSections = uniqueCellSections(cell);
  const isOpen = activeCell?.id === cell.id;
  const showHoverHint = isOpen && activeCell?.mode === "hover";
  const label = cellLabel({
    cell,
    percent: state.percent,
    revised: state.revised,
    volumeTitle,
  });

  const {
    floatingStyles,
    middlewareData,
    placement,
    refs: floatingRefs,
  } = useFloating({
    middleware: [
      offset(14),
      flip({ padding: 10 }),
      shift({ padding: 10 }),
      arrow({ element: arrowElement, padding: 12 }),
    ],
    open: isOpen,
    placement: "top-start",
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
  });
  const arrowX = middlewareData.arrow?.x;
  const arrowY = middlewareData.arrow?.y;
  const arrowStaticSide = tooltipArrowSide(placement);
  const arrowStyle = {
    left: arrowX == null ? undefined : `${arrowX}px`,
    top: arrowY == null ? undefined : `${arrowY}px`,
    [arrowStaticSide]: "calc(var(--progress-heatmap-tooltip-tail-size) / -2)",
  } as CSSProperties;

  const setReference = useCallback(
    (node: HTMLButtonElement | null) => {
      floatingRefs.setReference(node);
    },
    [floatingRefs],
  );

  const setFloating = useCallback(
    (node: HTMLDivElement | null) => {
      floatingRefs.setFloating(node);
    },
    [floatingRefs],
  );

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
      <button
        ref={setReference}
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
      {isOpen && (
        <FloatingPortal>
          <div
            ref={setFloating}
            id={tooltipId}
            className="progress-heatmap-tooltip"
            role="dialog"
            aria-label="Section jump links"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closeCell();
              }
            }}
            onMouseEnter={clearHoverCloseTimer}
            onMouseLeave={queueHoverClose}
            style={floatingStyles}
          >
            <span
              ref={setArrowElement}
              className="progress-heatmap-tooltip-arrow"
              data-side={tooltipPlacementSide(placement)}
              style={arrowStyle}
            />
            <div className="progress-heatmap-tooltip-content">
              <p className="progress-heatmap-tooltip-title">
                {sectionCountLabel(cellSections.length)}
                <span>{state.percent}% read</span>
                {state.revised && <span>revised</span>}
              </p>
              <div className="progress-heatmap-tooltip-links">
                {cellSections.map((section) => (
                  <a key={section.sectionId} href={section.href}>
                    {section.title}
                  </a>
                ))}
              </div>
              {showHoverHint && (
                <p className="progress-heatmap-tooltip-hint">(click to jump)</p>
              )}
            </div>
          </div>
        </FloatingPortal>
      )}
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
