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
};

type ProgressCloudBadgeProps = {
  connected?: boolean;
  percent: number;
  variantId?: string;
};

type ProgressCloudStyle = CSSProperties & {
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
const cloudProgressPath =
  "M40.5 4.7c9.4 0 17.5 4.7 21.2 12.4 9.8.4 17.3 7.1 17.3 15.5 0 7.8-6.8 13.8-15.6 13.8H20.6c-8.1 0-14.6-5.7-14.6-12.9 0-6.5 5.2-11.8 12.2-12.6C20.8 11 29.8 4.7 40.5 4.7Z";
const cloudPathScale = 0.7619048;
const cloudPathTransform = `translate(0 7.667) scale(${cloudPathScale})`;
const cloudViewBoxSize = 64;
// Measured from the source path with SVGGeometryElement.getTotalLength().
const cloudPathLength = 188.17681884765625;
const cloudTopPoint = { x: 30.857, y: 11.248 };
const cloudProgressBlipRadius = 1.9;
const offlineCircleRadius = 25.2;
const offlineCircleLength = 2 * Math.PI * offlineCircleRadius;
const offlineProgressBlipRadius = 1.6;
const offlineProgressStartY = 6.8;

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
  textSize: 15,
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
  },
];

function clampPercent(percent: number) {
  return Math.max(0, Math.min(100, percent));
}

function cloudRenderedPathLength(variant: ProgressCloudVariant) {
  // A non-scaling stroke interprets dash lengths in rendered CSS pixels. Map
  // the source perimeter through the group and viewBox scales before applying
  // a percentage, or a nominal 50% dash covers about 90% of the visible cloud.
  const viewBoxScale =
    Math.min(variant.width, variant.height) / cloudViewBoxSize;
  return cloudPathLength * cloudPathScale * viewBoxScale;
}

function cloudProgressDash(percent: number, renderedPathLength: number) {
  const progress = clampPercent(percent);
  if (progress >= 100) return undefined;
  const progressLength = (renderedPathLength * progress) / 100;
  return `${progressLength} ${renderedPathLength}`;
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
  connected = false,
  percent,
  variantId = "sync-orbit",
}: ProgressCloudBadgeProps) {
  const variant =
    progressCloudVariants.find((item) => item.id === variantId) ??
    syncOrbitVariant;

  const progressPercent = clampPercent(percent);
  const renderedCloudPathLength = cloudRenderedPathLength(variant);
  const text = `${Math.round(progressPercent)}%`;
  const textSize =
    text.length >= 4 ? Math.max(10.5, variant.textSize - 0.75) : variant.textSize;
  const style: ProgressCloudStyle = {
    "--progress-cloud-fill": variant.cloudFill,
    "--progress-cloud-height": `${variant.height}px`,
    "--progress-cloud-progress": variant.progress,
    "--progress-cloud-stroke": variant.cloudStroke,
    "--progress-cloud-text-color": variant.textColor,
    "--progress-cloud-text-size": `${textSize}px`,
    "--progress-cloud-track": variant.track,
    "--progress-cloud-width": `${variant.width}px`,
  };

  const offlineRotation = "rotate(-90 32 32)";
  const offlineProgressArc = circleProgressArc(progressPercent, 0);

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
          viewBox="0 0 64 64"
        >
          <g transform={cloudPathTransform}>
            <path className="progress-cloud-fill" d={cloudPath} />
            <path
              className="progress-cloud-track"
              d={cloudPath}
            />
            {progressPercent <= 0 ? null : (
              <path
                className="progress-cloud-progress"
                d={cloudProgressPath}
                strokeDasharray={cloudProgressDash(
                  progressPercent,
                  renderedCloudPathLength,
                )}
              />
            )}
          </g>
          {progressPercent <= 0 ? (
            <circle
              className="progress-cloud-progress-blip"
              cx={cloudTopPoint.x}
              cy={cloudTopPoint.y}
              r={cloudProgressBlipRadius}
            />
          ) : null}
          <text className="progress-cloud-text" x="32" y="33" textAnchor="middle">
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
          {progressPercent <= 0 ? (
            <circle
              className="progress-cloud-progress-blip"
              cx="32"
              cy={offlineProgressStartY}
              r={offlineProgressBlipRadius}
            />
          ) : null}
          {progressPercent >= 100 ? (
            <circle
              className="progress-cloud-progress"
              cx="32"
              cy="32"
              r={offlineCircleRadius}
              strokeDasharray={`${offlineCircleLength} 0`}
              strokeLinecap="round"
              transform={offlineRotation}
            />
          ) : null}
          {progressPercent > 0 && progressPercent < 100 ? (
            <path
              className="progress-cloud-progress"
              d={offlineProgressArc}
              strokeLinecap="round"
            />
          ) : null}
          <text className="progress-cloud-text" x="32" y="33" textAnchor="middle">
            {text}
          </text>
        </svg>
      )}
    </span>
  );
}
