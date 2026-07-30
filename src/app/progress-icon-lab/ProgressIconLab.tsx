"use client";

import { useEffect, useId, useState, type CSSProperties } from "react";
import {
  Bookmark,
  Headphones,
  ListTree,
  Search,
  Share2,
  SlidersVertical,
} from "lucide-react";
import {
  circleProgressArc,
  clampProgressPercent,
  progressDashArray,
  renderedCloudPathLength,
  type ProgressIconKind,
} from "./progress-icon-geometry";
import {
  progressIconGeometry,
  progressIconLabDefaultPercent,
  progressIconPreviewEventName,
  type ProgressIconPreview,
} from "@/lib/progress-icon-preview";
import styles from "./progress-icon-lab.module.css";

const cloudPath =
  "M20.6 46.4c-8.1 0-14.6-5.7-14.6-12.9 0-6.5 5.2-11.8 12.2-12.6C20.8 11 29.8 4.7 40.5 4.7c9.4 0 17.5 4.7 21.2 12.4 9.8.4 17.3 7.1 17.3 15.5 0 7.8-6.8 13.8-15.6 13.8H20.6Z";
const cloudProgressPath =
  "M40.5 4.7c9.4 0 17.5 4.7 21.2 12.4 9.8.4 17.3 7.1 17.3 15.5 0 7.8-6.8 13.8-15.6 13.8H20.6c-8.1 0-14.6-5.7-14.6-12.9 0-6.5 5.2-11.8 12.2-12.6C20.8 11 29.8 4.7 40.5 4.7Z";
const cloudPathTransform = "translate(0 7.667) scale(0.7619048)";
const cloudTopPoint = { x: 30.857, y: 11.248 };

type IconPreset = {
  id: string;
  label: string;
  note: string;
  size: number;
  stroke: number;
  text: number;
};

const presets: IconPreset[] = [
  {
    id: "current",
    label: "Current",
    note: "The existing 46 px badge and 2.4 px outline.",
    size: 46.4,
    stroke: 2.4,
    text: 15,
  },
  {
    id: "sharp",
    label: "Sharp",
    note: "A restrained reduction with a cleaner edge.",
    size: 40,
    stroke: 1.8,
    text: 12.5,
  },
  {
    id: "balanced",
    label: "Balanced",
    note: "The approved site geometry at its real toolbar scale.",
    size: progressIconGeometry.size,
    stroke: progressIconGeometry.stroke,
    text: progressIconGeometry.textSize,
  },
  {
    id: "lucide",
    label: "Lucide weight",
    note: "Matches the neighboring icons numerically at 2 px.",
    size: 38,
    stroke: 2,
    text: 12,
  },
  {
    id: "compact",
    label: "Compact",
    note: "A quiet 34 px footprint with a light outline.",
    size: 34,
    stroke: 1.6,
    text: 11,
  },
  {
    id: "hairline",
    label: "Hairline",
    note: "The most delicate option before small-scale breakup.",
    size: 38,
    stroke: 1.5,
    text: 12,
  },
];

type IconStyle = CSSProperties & {
  "--lab-icon-size": string;
  "--lab-icon-stroke": number;
  "--lab-icon-text": string;
};

function ProgressIcon({
  kind,
  percent,
  size,
  stroke,
  textSize,
  cloudOffset = 2,
}: {
  kind: ProgressIconKind;
  percent: number;
  size: number;
  stroke: number;
  textSize: number;
  cloudOffset?: number;
}) {
  const progress = clampProgressPercent(percent);
  const renderedCloudLength = renderedCloudPathLength(size);
  const cloudOffsetViewBox = (cloudOffset * 64) / size;
  const text = `${Math.round(progress)}%`;
  const resolvedTextSize = text.length >= 4 ? Math.max(9, textSize - 0.75) : textSize;
  const iconStyle: IconStyle = {
    "--lab-icon-size": `${size}px`,
    "--lab-icon-stroke": stroke,
    "--lab-icon-text": `${resolvedTextSize}px`,
  };

  return (
    <span
      className={styles.progressIcon}
      data-kind={kind}
      style={iconStyle}
      aria-label={`${kind} progress ${text}`}
    >
      <svg aria-hidden="true" focusable="false" viewBox="0 0 64 64">
        {kind === "cloud" ? (
          <g transform={`translate(0 ${cloudOffsetViewBox})`}>
            <g transform={cloudPathTransform}>
              <path className={styles.track} d={cloudPath} />
              {progress > 0 ? (
                <path
                  className={styles.progress}
                  d={cloudProgressPath}
                  strokeDasharray={progressDashArray(
                    progress,
                    renderedCloudLength,
                  )}
                />
              ) : null}
            </g>
            {progress <= 0 ? (
              <circle
                className={styles.blip}
                cx={cloudTopPoint.x}
                cy={cloudTopPoint.y}
                r={stroke * 0.82}
              />
            ) : null}
          </g>
        ) : (
          <>
            <circle
              className={styles.track}
              cx="32"
              cy="32"
              r="19.5"
              transform="rotate(-90 32 32)"
            />
            {progress >= 100 ? (
              <circle
                className={styles.progress}
                cx="32"
                cy="32"
                r="19.5"
              />
            ) : null}
            {progress > 0 && progress < 100 ? (
              <path
                className={styles.progress}
                d={circleProgressArc(progress)}
              />
            ) : null}
            {progress <= 0 ? (
              <circle
                className={styles.blip}
                cx="32"
                cy="12.5"
                r={stroke * 0.72}
              />
            ) : null}
          </>
        )}
        <text className={styles.iconText} x="32" y="33" textAnchor="middle">
          {text}
        </text>
      </svg>
    </span>
  );
}

function ToolbarContext({
  kind,
  percent,
  size,
  stroke,
  textSize,
  cloudOffset = 2,
  labelled = false,
}: {
  kind: ProgressIconKind;
  percent: number;
  size: number;
  stroke: number;
  textSize: number;
  cloudOffset?: number;
  labelled?: boolean;
}) {
  const tools = [
    { label: "Search", icon: <Search aria-hidden="true" size={18} /> },
    { label: "Outline", icon: <ListTree aria-hidden="true" size={17} /> },
    { label: "Bookmarks", icon: <Bookmark aria-hidden="true" size={17} /> },
    { label: "Appearance", icon: <SlidersVertical aria-hidden="true" size={17} /> },
    { label: "Share", icon: <Share2 aria-hidden="true" size={17} /> },
  ];

  return (
    <div
      className={`${styles.toolbarContext}${
        labelled ? ` ${styles.labelledToolbar}` : ""
      }`}
      aria-label="Toolbar scale comparison"
    >
      {tools.map((tool) => (
        <span className={styles.toolbarTool} key={tool.label}>
          {tool.icon}
          {labelled ? <small>{tool.label}</small> : null}
        </span>
      ))}
      <span className={`${styles.toolbarTool} ${styles.progressTool}`}>
        <ProgressIcon
          kind={kind}
          percent={percent}
          size={size}
          stroke={stroke}
          textSize={textSize}
          cloudOffset={cloudOffset}
        />
        {labelled ? <small>Progress</small> : null}
      </span>
      <span className={`${styles.toolbarTool} ${styles.audioTool}`}>
        <Headphones aria-hidden="true" size={21} />
        {labelled ? <small>Listen</small> : null}
      </span>
    </div>
  );
}

function NumberControl({
  id,
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  const formattedValue = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);

  return (
    <label className={styles.control} htmlFor={id}>
      <span>
        {label}
        <strong>
          {formattedValue}
          {unit}
        </strong>
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function ProgressIconLab() {
  const controlId = useId();
  const [kind, setKind] = useState<ProgressIconKind>("cloud");
  const [size, setSize] = useState<number>(progressIconGeometry.size);
  const [stroke, setStroke] = useState<number>(progressIconGeometry.stroke);
  const [textSize, setTextSize] = useState<number>(
    progressIconGeometry.textSize,
  );
  const [percent, setPercent] = useState(progressIconLabDefaultPercent);
  const [cloudOffset, setCloudOffset] = useState<number>(
    progressIconGeometry.cloudOffset,
  );
  const [selectedPreset, setSelectedPreset] = useState("balanced");

  useEffect(() => {
    const preview: ProgressIconPreview = {
      kind,
      size,
      stroke,
      textSize,
      percent,
      cloudOffset,
    };
    const timer = window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent<ProgressIconPreview>(progressIconPreviewEventName, {
          detail: preview,
        }),
      );
    });
    return () => window.clearTimeout(timer);
  }, [cloudOffset, kind, percent, size, stroke, textSize]);

  useEffect(
    () => () => {
      window.dispatchEvent(
        new CustomEvent<null>(progressIconPreviewEventName, {
          detail: null,
        }),
      );
    },
    [],
  );

  function applyPreset(preset: IconPreset) {
    setSize(preset.size);
    setStroke(preset.stroke);
    setTextSize(preset.text);
    setCloudOffset(progressIconGeometry.cloudOffset);
    setSelectedPreset(preset.id);
  }

  function markCustom(update: () => void) {
    update();
    setSelectedPreset("custom");
  }

  return (
    <article className={styles.lab}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>Private design study</p>
        <h1>Progress icon lab</h1>
        <p className={styles.lede}>
          Compare the cloud and local circle at their real toolbar scale. The
          surrounding icons use the same 17 to 18 px Lucide geometry as the live
          reader toolbar.
        </p>
      </header>

      <section className={styles.liveStage} aria-labelledby={`${controlId}-live`}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Live specimen</p>
            <h2 id={`${controlId}-live`}>Dial it in</h2>
          </div>
          <div className={styles.kindSwitch} aria-label="Progress icon shape">
            {(["cloud", "circle"] as const).map((option) => (
              <button
                className={kind === option ? styles.activeSwitch : undefined}
                key={option}
                type="button"
                aria-pressed={kind === option}
                onClick={() => setKind(option)}
              >
                {option === "cloud" ? "Cloud" : "Circle"}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.stageCanvas}>
          <ToolbarContext
            kind={kind}
            percent={percent}
            size={size}
            stroke={stroke}
            textSize={textSize}
            cloudOffset={cloudOffset}
            labelled
          />
        </div>

        <div className={styles.controls}>
          <NumberControl
            id={`${controlId}-size`}
            label="Footprint"
            value={size}
            min={30}
            max={48}
            step={0.1}
            unit=" px"
            onChange={(value) => markCustom(() => setSize(value))}
          />
          <NumberControl
            id={`${controlId}-stroke`}
            label="Outline"
            value={stroke}
            min={1.25}
            max={2.5}
            step={0.05}
            unit=" px"
            onChange={(value) => markCustom(() => setStroke(value))}
          />
          <NumberControl
            id={`${controlId}-text`}
            label="Numeral"
            value={textSize}
            min={9}
            max={15}
            step={0.5}
            unit=" px"
            onChange={(value) => markCustom(() => setTextSize(value))}
          />
          <NumberControl
            id={`${controlId}-cloud-offset`}
            label="Cloud Y offset"
            value={cloudOffset}
            min={-4}
            max={6}
            step={0.5}
            unit=" px"
            onChange={(value) => markCustom(() => setCloudOffset(value))}
          />
          <NumberControl
            id={`${controlId}-percent`}
            label="Progress"
            value={percent}
            min={0}
            max={100}
            step={1}
            unit="%"
            onChange={setPercent}
          />
        </div>
      </section>

      <section className={styles.comparison} aria-labelledby={`${controlId}-presets`}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Curated comparison</p>
            <h2 id={`${controlId}-presets`}>Six useful cuts</h2>
          </div>
          <p className={styles.sectionNote}>
            Click a card to load its measurements into the live specimen.
          </p>
        </div>

        <div className={styles.presetGrid}>
          {presets.map((preset) => (
            <button
              className={`${styles.presetCard}${
                selectedPreset === preset.id ? ` ${styles.selectedPreset}` : ""
              }`}
              key={preset.id}
              type="button"
              aria-pressed={selectedPreset === preset.id}
              onClick={() => applyPreset(preset)}
            >
              <span className={styles.presetTitle}>
                <strong>{preset.label}</strong>
                {preset.id === "balanced" ? <em>Suggested</em> : null}
              </span>
              <span className={styles.presetToolbar}>
                <ToolbarContext
                  kind="cloud"
                  percent={37}
                  size={preset.size}
                  stroke={preset.stroke}
                  textSize={preset.text}
                />
              </span>
              <span className={styles.presetToolbar}>
                <ToolbarContext
                  kind="circle"
                  percent={37}
                  size={preset.size}
                  stroke={preset.stroke}
                  textSize={preset.text}
                />
              </span>
              <span className={styles.measurements}>
                {preset.size.toFixed(preset.size % 1 ? 1 : 0)} px icon
                <i aria-hidden="true">·</i>
                {preset.stroke.toFixed(preset.stroke % 1 ? 2 : 0)} px outline
                <i aria-hidden="true">·</i>
                {preset.text.toFixed(preset.text % 1 ? 1 : 0)} px type
              </span>
              <span className={styles.presetNote}>{preset.note}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.states} aria-labelledby={`${controlId}-states`}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Boundary check</p>
            <h2 id={`${controlId}-states`}>Selected geometry at every state</h2>
          </div>
          <p className={styles.sectionNote}>
            The zero blip and full perimeter should remain clean, not congeal
            into tiny bronze dumplings.
          </p>
        </div>
        <div className={styles.stateGrid}>
          {(["cloud", "circle"] as const).map((iconKind) => (
            <div className={styles.stateRow} key={iconKind}>
              <strong>{iconKind === "cloud" ? "Cloud" : "Circle"}</strong>
              {[0, 25, 53, 54, 75, 100].map((statePercent) => (
                <div className={styles.stateIcon} key={statePercent}>
                  <ProgressIcon
                    kind={iconKind}
                    percent={statePercent}
                    size={size}
                    stroke={stroke}
                    textSize={textSize}
                    cloudOffset={cloudOffset}
                  />
                  <span>{statePercent}%</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <aside className={styles.reading}>
        <strong>My read</strong>
        <p>
          Balanced is now the site default. Its 48 px footprint keeps the
          numeral legible, while the 1.4 px outline gives the larger silhouette
          the same visual weight as the neighboring Lucide marks.
        </p>
      </aside>
    </article>
  );
}
