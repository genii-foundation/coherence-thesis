const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const coverFlowTuning = {
  rotation: {
    maxDegrees: 72,
    degreesPerCardOffset: 68,
    maxMeasuredOffset: 2.6,
  },
  scale: {
    active: 1.14,
    falloffPerCard: 0.48,
    falloffCurve: 1.12,
    min: 0.54,
  },
  verticalAlignment: {
    sideCoverCenterCompensation: 1.06,
  },
  spacing: {
    centerClearancePx: 420,
    centerClearanceCurve: 1.34,
    nativeScrollStepPx: 224,
    peripheralStackPx: 390,
    peripheralStackCurve: 0.78,
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

const visualDistanceForOffset = (distance: number) => {
  if (distance <= 1) {
    return (
      coverFlowTuning.spacing.centerClearancePx *
      (1 - Math.pow(1 - distance, coverFlowTuning.spacing.centerClearanceCurve))
    );
  }

  return (
    coverFlowTuning.spacing.centerClearancePx +
    coverFlowTuning.spacing.peripheralStackPx *
      (1 -
        Math.exp(
          -(distance - 1) * coverFlowTuning.spacing.peripheralStackCurve,
        ))
  );
};

export function getCoverFlowTransform(
  offset: number,
  nativeScrollStepPx = coverFlowTuning.spacing.nativeScrollStepPx,
) {
  const distance = Math.abs(offset);
  const direction = Math.sign(offset);
  const clampedOffset = clamp(
    offset,
    -coverFlowTuning.rotation.maxMeasuredOffset,
    coverFlowTuning.rotation.maxMeasuredOffset,
  );
  const visualDistance = visualDistanceForOffset(distance);
  const nativeDistance = distance * nativeScrollStepPx;
  const shift =
    distance < 0.001
      ? 0
      : direction * (visualDistance - nativeDistance);
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
