export type { ProgressIconKind } from "@/lib/progress-icon-preview";

const cloudSourcePathLength = 188.17681884765625;
const cloudPathScale = 0.7619048;
const circleRadius = 19.5;
const viewBoxSize = 64;

export function clampProgressPercent(percent: number) {
  return Math.max(0, Math.min(100, percent));
}

export function renderedCloudPathLength(iconSize: number) {
  const viewBoxScale = iconSize / viewBoxSize;
  return cloudSourcePathLength * cloudPathScale * viewBoxScale;
}

export function progressDashArray(percent: number, renderedPathLength: number) {
  const progress = clampProgressPercent(percent);
  if (progress >= 100) return undefined;
  const progressLength = (renderedPathLength * progress) / 100;

  // The stroke uses vector-effect="non-scaling-stroke", so dash values are
  // interpreted as rendered CSS pixels. Use the rendered perimeter as the gap
  // instead of an abstract 100-unit path or the dash repeats before 100%.
  return `${progressLength} ${renderedPathLength}`;
}

function circlePoint(angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: 32 + circleRadius * Math.cos(radians),
    y: 32 + circleRadius * Math.sin(radians),
  };
}

export function circleProgressArc(percent: number) {
  const progress = clampProgressPercent(percent);
  if (progress <= 0 || progress >= 100) return "";
  const start = circlePoint(0);
  const end = circlePoint((progress / 100) * 360);
  const largeArcFlag = progress > 50 ? 1 : 0;

  return [
    `M ${start.x.toFixed(3)} ${start.y.toFixed(3)}`,
    `A ${circleRadius} ${circleRadius} 0 ${largeArcFlag} 1`,
    `${end.x.toFixed(3)} ${end.y.toFixed(3)}`,
  ].join(" ");
}
