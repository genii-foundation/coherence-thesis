const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const smoothstep = (value: number) => {
  const normalized = clamp(value, 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
};

const distributionPeak = (distance: number, peakOffset: number, width: number) => {
  const normalized = (distance - peakOffset) / width;
  return Math.exp(-0.5 * normalized * normalized);
};

export const coverFlowTuning = {
  scroll: {
    endSnapTolerancePx: 2,
    flickDistancePx: 620,
    flickPeakDeltaPx: 260,
    flickSettleMs: 110,
    verticalReleaseMs: 160,
    verticalTakeoverMinDeltaPx: 3,
    verticalTakeoverRatio: 1.15,
  },
  rotation: {
    maxDegrees: 72,
    degreesPerCardOffset: 86,
    maxMeasuredOffset: 2.6,
  },
  scale: {
    active: 1.14,
    falloffPerCard: 0.48,
    falloffCurve: 1.12,
    min: 0.54,
  },
  spacing: {
    backgroundDistributionCenterGateOffset: 0.25,
    firstBackgroundOutwardPx: 26,
    firstBackgroundPeakOffset: 0.48,
    firstBackgroundWidth: 0.26,
    secondBackgroundOutwardPx: 130,
    secondBackgroundPeakOffset: 0.94,
    secondBackgroundWidth: 0.28,
    thirdBackgroundInwardPx: 52,
    thirdBackgroundPeakOffset: 1.4,
    thirdBackgroundWidth: 0.31,
    centerGutterPx: 315,
    centerGutterFalloff: 1.18,
    centerGutterPeakOffset: 0.58,
    sideStackCompressionPx: 760,
    sideStackDistributionCurve: 0.98,
    sideStackMaxCompressionRatio: 0.92,
    sideStackMaxDistance: 2.45,
    sideStackStartOffset: 0.14,
  },
  depth: {
    pxPerCard: 118,
    falloffCurve: 1.08,
    maxNegativePx: 250,
  },
  coverWash: {
    opacityPerCard: 0.48,
    falloffCurve: 1.08,
    max: 0.88,
  },
  coverShadow: {
    falloffPerCard: 0.46,
    falloffCurve: 1.12,
    min: 0.08,
  },
  panelOpacity: {
    activeDistance: 0.34,
    active: 1,
    inactive: 0,
  },
  layer: {
    active: 100,
    falloffPerCard: 20,
    min: 1,
  },
};

export function getCoverFlowWheelIntent({
  deltaX,
  deltaY,
  shiftKey,
}: {
  deltaX: number;
  deltaY: number;
  shiftKey: boolean;
}): "horizontal" | "vertical" | "none" {
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (shiftKey && absY > 0) return "horizontal";
  if (absX === 0 && absY === 0) return "none";
  if (
    absY >= coverFlowTuning.scroll.verticalTakeoverMinDeltaPx &&
    absY >= absX * coverFlowTuning.scroll.verticalTakeoverRatio
  ) {
    return "vertical";
  }
  return absX > 0 || absY > 0 ? "horizontal" : "none";
}

export function getCoverFlowTransform(offset: number) {
  const distance = Math.abs(offset);
  const direction = Math.sign(offset);
  const clampedOffset = clamp(
    offset,
    -coverFlowTuning.rotation.maxMeasuredOffset,
    coverFlowTuning.rotation.maxMeasuredOffset,
  );
  const stackDistance = Math.min(
    distance,
    coverFlowTuning.spacing.sideStackMaxDistance,
  );
  const centerGutterProgress = smoothstep(
    distance / coverFlowTuning.spacing.centerGutterPeakOffset,
  );
  const centerGutterFade = Math.exp(
    -Math.max(0, distance - coverFlowTuning.spacing.centerGutterPeakOffset) *
      coverFlowTuning.spacing.centerGutterFalloff,
  );
  const centerGutter =
    direction *
    coverFlowTuning.spacing.centerGutterPx *
    centerGutterProgress *
    centerGutterFade;
  const sideStackProgress = smoothstep(
    (stackDistance - coverFlowTuning.spacing.sideStackStartOffset) /
      (coverFlowTuning.spacing.sideStackMaxDistance -
        coverFlowTuning.spacing.sideStackStartOffset),
  );
  const desiredCompression =
    coverFlowTuning.spacing.sideStackCompressionPx *
    Math.pow(
      sideStackProgress,
      coverFlowTuning.spacing.sideStackDistributionCurve,
    );
  const maxCompression =
    Math.abs(centerGutter) *
    coverFlowTuning.spacing.sideStackMaxCompressionRatio;
  const sideStackCompression =
    -direction * Math.min(desiredCompression, maxCompression);
  const distributionGate = smoothstep(
    distance / coverFlowTuning.spacing.backgroundDistributionCenterGateOffset,
  );
  const backgroundDistributionCorrection =
    direction *
    distributionGate *
    (coverFlowTuning.spacing.firstBackgroundOutwardPx *
      distributionPeak(
        distance,
        coverFlowTuning.spacing.firstBackgroundPeakOffset,
        coverFlowTuning.spacing.firstBackgroundWidth,
      ) +
      coverFlowTuning.spacing.secondBackgroundOutwardPx *
        distributionPeak(
          distance,
          coverFlowTuning.spacing.secondBackgroundPeakOffset,
          coverFlowTuning.spacing.secondBackgroundWidth,
        ) -
      coverFlowTuning.spacing.thirdBackgroundInwardPx *
        distributionPeak(
          distance,
          coverFlowTuning.spacing.thirdBackgroundPeakOffset,
          coverFlowTuning.spacing.thirdBackgroundWidth,
        ));
  const shift =
    distance < 0.001
      ? 0
      : centerGutter + sideStackCompression + backgroundDistributionCorrection;
  const rotate = clamp(
    clampedOffset * -coverFlowTuning.rotation.degreesPerCardOffset,
    -coverFlowTuning.rotation.maxDegrees,
    coverFlowTuning.rotation.maxDegrees,
  );
  const scale = Math.max(
    coverFlowTuning.scale.min,
    coverFlowTuning.scale.active -
      coverFlowTuning.scale.falloffPerCard *
        Math.pow(distance, coverFlowTuning.scale.falloffCurve),
  );
  const z = Math.max(
    -coverFlowTuning.depth.maxNegativePx,
    -coverFlowTuning.depth.pxPerCard *
      Math.pow(distance, coverFlowTuning.depth.falloffCurve),
  );
  const coverWashOpacity = Math.min(
    coverFlowTuning.coverWash.max,
    coverFlowTuning.coverWash.opacityPerCard *
      Math.pow(distance, coverFlowTuning.coverWash.falloffCurve),
  );
  const coverShadowStrength = Math.max(
    coverFlowTuning.coverShadow.min,
    1 -
      coverFlowTuning.coverShadow.falloffPerCard *
        Math.pow(distance, coverFlowTuning.coverShadow.falloffCurve),
  );
  const panelOpacity =
    distance < coverFlowTuning.panelOpacity.activeDistance
      ? coverFlowTuning.panelOpacity.active
      : coverFlowTuning.panelOpacity.inactive;
  const panelVisibility =
    distance < coverFlowTuning.panelOpacity.activeDistance
      ? "visible"
      : "hidden";
  const layer = Math.max(
    coverFlowTuning.layer.min,
    coverFlowTuning.layer.active -
      Math.round(distance * coverFlowTuning.layer.falloffPerCard),
  );

  return {
    coverShadowStrength,
    coverWashOpacity,
    layer,
    panelOpacity,
    panelVisibility,
    rotate,
    scale,
    shift,
    z,
  };
}

export function getCoverFlowFlickTarget({
  activeIndex,
  distancePx,
  peakDeltaPx,
  volumeCount,
}: {
  activeIndex: number;
  distancePx: number;
  peakDeltaPx: number;
  volumeCount: number;
}) {
  if (volumeCount < 2) return null;

  const direction = Math.sign(distancePx || peakDeltaPx);
  if (direction === 0) return null;

  const isFlick =
    Math.abs(distancePx) >= coverFlowTuning.scroll.flickDistancePx ||
    Math.abs(peakDeltaPx) >= coverFlowTuning.scroll.flickPeakDeltaPx;

  if (!isFlick) return null;

  const targetIndex = direction > 0 ? volumeCount - 1 : 0;
  return targetIndex === activeIndex ? null : targetIndex;
}
