import type { CSSProperties } from "react";

type ProgressCloudVariant = {
  id: string;
  label: string;
  percent: number;
  width: number;
  height: number;
  cloudFill: string;
  cloudStroke: string;
  track: string;
  progress: string;
  textColor: string;
  textSize: number;
  strokeWidth: number;
  dashOffset?: number;
};

type ProgressCloudBadgeProps = {
  cloudDashOffset?: number;
  connected?: boolean;
  offlineLineCap?: "butt" | "round" | "square";
  offlineDashOffset?: number;
  percent: number;
  variantId?: string;
};

type ProgressCloudStyle = CSSProperties & {
  "--progress-circle-linecap": string;
  "--progress-cloud-fill": string;
  "--progress-cloud-height": string;
  "--progress-cloud-progress": string;
  "--progress-cloud-stroke": string;
  "--progress-cloud-text-color": string;
  "--progress-cloud-text-size": string;
  "--progress-cloud-track": string;
  "--progress-cloud-width": string;
};

const cloudPath =
  "M20.6 46.4c-8.1 0-14.6-5.7-14.6-12.9 0-6.5 5.2-11.8 12.2-12.6C20.8 11 29.8 4.7 40.5 4.7c9.4 0 17.5 4.7 21.2 12.4 9.8.4 17.3 7.1 17.3 15.5 0 7.8-6.8 13.8-15.6 13.8H20.6Z";
const offlineCircleRadius = 25.2;
const offlineCircleLength = 2 * Math.PI * offlineCircleRadius;

const syncOrbitVariant: ProgressCloudVariant = {
  id: "sync-orbit",
  label: "Orbit",
  percent: 1,
  width: 46.4,
  height: 46.4,
  cloudFill: "rgba(255, 252, 244, 0.92)",
  cloudStroke: "rgba(119, 84, 42, 0.16)",
  track: "rgba(119, 84, 42, 0.06)",
  progress: "var(--bronze-deep)",
  textColor: "var(--bronze-deep)",
  textSize: 12.8,
  strokeWidth: 2.7,
};

export const progressCloudVariants: ProgressCloudVariant[] = [
  syncOrbitVariant,
  {
    id: "sync-lantern",
    label: "Lantern",
    percent: 8,
    width: 48,
    height: 32,
    cloudFill: "rgba(255, 252, 244, 0.96)",
    cloudStroke: "rgba(19, 32, 42, 0.48)",
    track: "rgba(119, 84, 42, 0.11)",
    progress: "var(--ink-soft)",
    textColor: "var(--ink-soft)",
    textSize: 14.5,
    strokeWidth: 2.5,
    dashOffset: 10,
  },
  {
    id: "sync-archive",
    label: "Archive",
    percent: 14,
    width: 50,
    height: 33,
    cloudFill: "rgba(244, 235, 214, 0.9)",
    cloudStroke: "rgba(119, 84, 42, 0.72)",
    track: "rgba(19, 32, 42, 0.12)",
    progress: "var(--bronze)",
    textColor: "var(--bronze-deep)",
    textSize: 13.8,
    strokeWidth: 2.8,
    dashOffset: 20,
  },
  {
    id: "sync-seal",
    label: "Seal",
    percent: 22,
    width: 50,
    height: 33,
    cloudFill: "rgba(255, 252, 244, 0.96)",
    cloudStroke: "var(--ink)",
    track: "rgba(119, 84, 42, 0.13)",
    progress: "var(--ink)",
    textColor: "var(--ink)",
    textSize: 13.8,
    strokeWidth: 2.55,
    dashOffset: 30,
  },
  {
    id: "sync-tide",
    label: "Tide",
    percent: 37,
    width: 52,
    height: 34,
    cloudFill: "rgba(255, 252, 244, 0.94)",
    cloudStroke: "rgba(119, 84, 42, 0.66)",
    track: "rgba(19, 32, 42, 0.1)",
    progress: "var(--sage)",
    textColor: "var(--bronze-deep)",
    textSize: 13.4,
    strokeWidth: 2.6,
    dashOffset: 40,
  },
  {
    id: "sync-brass",
    label: "Brass",
    percent: 44,
    width: 52,
    height: 34,
    cloudFill: "rgba(244, 235, 214, 0.94)",
    cloudStroke: "rgba(164, 123, 63, 0.78)",
    track: "rgba(119, 84, 42, 0.14)",
    progress: "var(--bronze-deep)",
    textColor: "var(--bronze-deep)",
    textSize: 13.4,
    strokeWidth: 2.7,
    dashOffset: 50,
  },
  {
    id: "sync-quiet",
    label: "Quiet",
    percent: 58,
    width: 50,
    height: 33,
    cloudFill: "rgba(255, 252, 244, 0.92)",
    cloudStroke: "rgba(19, 32, 42, 0.46)",
    track: "rgba(19, 32, 42, 0.09)",
    progress: "var(--ink-soft)",
    textColor: "var(--ink-soft)",
    textSize: 13.3,
    strokeWidth: 2.35,
    dashOffset: 60,
  },
  {
    id: "sync-ember",
    label: "Ember",
    percent: 73,
    width: 52,
    height: 34,
    cloudFill: "rgba(244, 235, 214, 0.92)",
    cloudStroke: "rgba(119, 84, 42, 0.74)",
    track: "rgba(119, 84, 42, 0.13)",
    progress: "var(--bronze)",
    textColor: "var(--bronze-deep)",
    textSize: 13,
    strokeWidth: 2.85,
    dashOffset: 70,
  },
  {
    id: "sync-ink",
    label: "Ink",
    percent: 91,
    width: 52,
    height: 34,
    cloudFill: "rgba(255, 252, 244, 0.97)",
    cloudStroke: "var(--ink)",
    track: "rgba(19, 32, 42, 0.1)",
    progress: "var(--ink)",
    textColor: "var(--ink)",
    textSize: 13,
    strokeWidth: 2.6,
    dashOffset: 80,
  },
  {
    id: "sync-full",
    label: "Full",
    percent: 100,
    width: 54,
    height: 35,
    cloudFill: "rgba(255, 252, 244, 0.98)",
    cloudStroke: "rgba(119, 84, 42, 0.8)",
    track: "rgba(119, 84, 42, 0.13)",
    progress: "var(--bronze-deep)",
    textColor: "var(--bronze-deep)",
    textSize: 11.5,
    strokeWidth: 2.75,
    dashOffset: 90,
  },
];

function clampPercent(percent: number) {
  return Math.max(0, Math.min(100, percent));
}

function progressDash(percent: number) {
  const progress = clampPercent(percent);
  if (progress >= 100) return "100 0";
  return `${progress} ${100 - progress}`;
}

function circlePoint(angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: 32 + offlineCircleRadius * Math.cos(radians),
    y: 32 + offlineCircleRadius * Math.sin(radians),
  };
}

function circleProgressArc(percent: number, offset: number) {
  const progress = clampPercent(percent);
  if (progress <= 0 || progress >= 100) return "";
  const startAngle = (offset / 100) * 360;
  const endAngle = startAngle + (progress / 100) * 360;
  const start = circlePoint(startAngle);
  const end = circlePoint(endAngle);
  const largeArcFlag = progress > 50 ? 1 : 0;
  return [
    `M ${start.x.toFixed(3)} ${start.y.toFixed(3)}`,
    `A ${offlineCircleRadius} ${offlineCircleRadius} 0 ${largeArcFlag} 1`,
    `${end.x.toFixed(3)} ${end.y.toFixed(3)}`,
  ].join(" ");
}

export function ProgressCloudBadge({
  cloudDashOffset: cloudDashOffsetOverride,
  connected = false,
  offlineLineCap = "butt",
  offlineDashOffset: offlineDashOffsetOverride,
  percent,
  variantId = "sync-orbit",
}: ProgressCloudBadgeProps) {
  const variant =
    progressCloudVariants.find((item) => item.id === variantId) ??
    syncOrbitVariant;

  const progressPercent = clampPercent(percent);
  const text = `${Math.round(progressPercent)}%`;
  const textSize =
    text.length >= 4 ? Math.max(10.5, variant.textSize - 1.5) : variant.textSize;
  const style: ProgressCloudStyle = {
    "--progress-circle-linecap": offlineLineCap,
    "--progress-cloud-fill": variant.cloudFill,
    "--progress-cloud-height": `${variant.height}px`,
    "--progress-cloud-progress": variant.progress,
    "--progress-cloud-stroke": variant.cloudStroke,
    "--progress-cloud-text-color": variant.textColor,
    "--progress-cloud-text-size": `${textSize}px`,
    "--progress-cloud-track": variant.track,
    "--progress-cloud-width": `${variant.width}px`,
  };

  const cloudDashOffset =
    progressPercent >= 100
      ? 0
      : (cloudDashOffsetOverride ?? 75) - (variant.dashOffset ?? 0);
  const offlineRotation = `rotate(${-90 + (variant.dashOffset ?? 0)} 32 32)`;
  const offlineStartOffset = offlineDashOffsetOverride ?? 0;
  const offlineProgressArc = circleProgressArc(
    progressPercent,
    offlineStartOffset,
  );

  return (
    <span
      className="progress-percent"
      data-cloud-variant={variant.id}
      data-connected={connected ? "true" : "false"}
      style={style}
    >
      {connected ? (
        <svg
          aria-hidden="true"
          className="progress-cloud-mark"
          focusable="false"
          viewBox="0 0 84 56"
        >
          <path className="progress-cloud-fill" d={cloudPath} />
          <path
            className="progress-cloud-track"
            d={cloudPath}
            pathLength={100}
          />
          <path
            className="progress-cloud-progress"
            d={cloudPath}
            pathLength={100}
            strokeDasharray={progressDash(progressPercent)}
            strokeDashoffset={cloudDashOffset}
          />
          <text className="progress-cloud-text" x="42" y="33" textAnchor="middle">
            {text}
          </text>
        </svg>
      ) : (
        <svg
          aria-hidden="true"
          className="progress-cloud-mark progress-cloud-mark-offline"
          focusable="false"
          viewBox="0 0 64 64"
        >
          <circle className="progress-cloud-fill" cx="32" cy="32" r="26" />
          <circle
            className="progress-cloud-track"
            cx="32"
            cy="32"
            r={offlineCircleRadius}
            transform={offlineRotation}
          />
          {progressPercent >= 100 ? (
            <circle
              className="progress-cloud-progress"
              cx="32"
              cy="32"
              r={offlineCircleRadius}
              strokeDasharray={`${offlineCircleLength} 0`}
              transform={offlineRotation}
            />
          ) : null}
          {progressPercent > 0 && progressPercent < 100 ? (
            <path className="progress-cloud-progress" d={offlineProgressArc} />
          ) : null}
          <text className="progress-cloud-text" x="32" y="33" textAnchor="middle">
            {text}
          </text>
        </svg>
      )}
    </span>
  );
}
