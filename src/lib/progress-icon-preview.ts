export const progressIconPreviewEventName =
  "coherence-progress-icon-preview";

export const progressIconGeometry = {
  size: 48,
  stroke: 1.4,
  textSize: 12.5,
  cloudOffset: 2,
} as const;

export const progressIconLabDefaultPercent = 62;

export type ProgressIconKind = "cloud" | "circle";

export type ProgressIconPreview = {
  kind: ProgressIconKind;
  size: number;
  stroke: number;
  textSize: number;
  percent: number;
  cloudOffset: number;
};
