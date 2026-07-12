const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const coverFlowTuning = {
  rotation: {
    maxDegrees: 40,
    degreesPerCardOffset: 42,
    maxMeasuredOffset: 2.6,
  },
  scale: {
    active: 1.14,
    falloffPerCard: 0.38,
    falloffCurve: 1.08,
    min: 0.62,
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
  return {
    coverShadowStrength,
    coverWashOpacity,
    panelOpacity,
    panelVisibility,
    rotate,
    scale,
    shift,
    z,
  };
}

export function getCoverFlowLayers(offsets: readonly number[]) {
  const layers = new Array<number>(offsets.length);

  offsets
    .map((offset, index) => ({ distance: Math.abs(offset), index }))
    .sort(
      (first, second) =>
        second.distance - first.distance || first.index - second.index,
    )
    .forEach(({ index }, rank) => {
      layers[index] = rank + 1;
    });

  return layers;
}
