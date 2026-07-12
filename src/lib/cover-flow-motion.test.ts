import { describe, expect, it } from "vitest";
import {
  advanceCoverFlowScroll,
  coverFlowTuning,
  getCoverFlowLayers,
  getCoverFlowTransform,
} from "./cover-flow-motion";

describe("cover flow motion", () => {
  it("keeps the center transform continuous through tiny scroll changes", () => {
    let previous = getCoverFlowTransform(-3).visualX;
    let maxShiftStep = 0;

    for (let offset = -2.995; offset <= 3; offset += 0.005) {
      const current = getCoverFlowTransform(offset).visualX;
      maxShiftStep = Math.max(maxShiftStep, Math.abs(current - previous));
      previous = current;
    }

    expect(maxShiftStep).toBeLessThan(5);
  });

  it("keeps side cover corrections mirrored and bounded", () => {
    for (let offset = 0.05; offset <= 2.6; offset += 0.05) {
      const right = getCoverFlowTransform(offset).visualX;
      const left = getCoverFlowTransform(-offset).visualX;

      expect(Math.abs(right + left)).toBeLessThan(0.001);
      expect(Math.abs(right)).toBeLessThan(800);
    }
  });

  it("caps every distant card at the same gentle rotation", () => {
    expect(coverFlowTuning.rotation.maxDegrees).toBe(27);

    for (const offset of [1, 2, 3, 8]) {
      expect(getCoverFlowTransform(offset).rotate).toBe(-27);
      expect(getCoverFlowTransform(-offset).rotate).toBe(27);
    }
  });

  it("keeps immediate side covers large enough to stay legible", () => {
    expect(getCoverFlowTransform(1).scale).toBeGreaterThanOrEqual(0.75);
    expect(getCoverFlowTransform(-1).scale).toBeGreaterThanOrEqual(0.75);
  });

  it("keeps visual card centers monotonic with a tighter peripheral stack", () => {
    const visualCenter = (offset: number) =>
      getCoverFlowTransform(offset).visualX;

    const halfStep = visualCenter(0.5);
    const firstBackground = visualCenter(1);
    const secondBackground = visualCenter(2);
    const thirdBackground = visualCenter(3);
    const fourthBackground = visualCenter(4);

    expect(halfStep).toBeGreaterThan(240);
    expect(firstBackground).toBeGreaterThan(400);
    expect(secondBackground).toBeGreaterThan(firstBackground);
    expect(thirdBackground).toBeGreaterThan(secondBackground);
    expect(fourthBackground).toBeGreaterThan(thirdBackground);
    expect(secondBackground - firstBackground).toBeLessThan(firstBackground);
    expect(thirdBackground - secondBackground).toBeLessThan(
      secondBackground - firstBackground,
    );
  });

  it("smooths toward a target monotonically without overshooting", () => {
    let current = 0;
    const target = 224;

    for (let frame = 0; frame < 120 && current !== target; frame += 1) {
      const previous = current;
      current = advanceCoverFlowScroll(current, target, 1000 / 60);
      expect(current).toBeGreaterThan(previous);
      expect(current).toBeLessThanOrEqual(target);
    }

    expect(current).toBe(target);
  });

  it("keeps smoothing consistent across refresh rates", () => {
    const advanceFor = (frameMs: number, frameCount: number) => {
      let current = 0;
      for (let frame = 0; frame < frameCount; frame += 1) {
        current = advanceCoverFlowScroll(current, 224, frameMs);
      }
      return current;
    };

    expect(advanceFor(1000 / 60, 30)).toBeCloseTo(
      advanceFor(1000 / 120, 60),
      8,
    );
  });

  it("bounds long frames and snaps when motion is disabled", () => {
    expect(advanceCoverFlowScroll(0, 224, 1000)).toBe(
      advanceCoverFlowScroll(0, 224, coverFlowTuning.motion.maxFrameDeltaMs),
    );
    expect(advanceCoverFlowScroll(0, 224, 16, true)).toBe(224);
  });

  it("remains bounded through repeated direction reversals", () => {
    let current = 0;

    for (const target of [12, 12, -8, -8, 6, 6, 0]) {
      const previous = current;
      current = advanceCoverFlowScroll(current, target, 1000 / 60);
      expect(current).toBeGreaterThanOrEqual(Math.min(previous, target));
      expect(current).toBeLessThanOrEqual(Math.max(previous, target));
    }
  });

  it("gives every cover a unique layer that rises toward the center", () => {
    const cardCount = 9;

    for (const center of [0, 0.25, 0.5, 2.4, 4, 7.75, 8]) {
      const offsets = Array.from(
        { length: cardCount },
        (_, index) => index - center,
      );
      const layers = getCoverFlowLayers(offsets);

      expect(new Set(layers).size).toBe(cardCount);

      offsets.forEach((offset, index) => {
        offsets.forEach((otherOffset, otherIndex) => {
          if (Math.abs(offset) >= Math.abs(otherOffset)) return;
          expect(layers[index]!).toBeGreaterThan(layers[otherIndex]!);
        });
      });
    }
  });

  it("hides inactive details while keeping all cover anchors fully opaque", () => {
    expect(getCoverFlowTransform(0).panelOpacity).toBe(1);
    expect(getCoverFlowTransform(0).panelVisibility).toBe("visible");
    expect(getCoverFlowTransform(0).coverWashOpacity).toBe(0);

    const inactive = getCoverFlowTransform(1);
    expect(inactive.panelOpacity).toBe(0);
    expect(inactive.panelVisibility).toBe("hidden");
    expect(inactive.coverWashOpacity).toBeGreaterThan(0);
  });

  it("fades cover shadows as cards move into the background", () => {
    const active = getCoverFlowTransform(0).coverShadowStrength;
    const side = getCoverFlowTransform(1).coverShadowStrength;
    const far = getCoverFlowTransform(2.4).coverShadowStrength;

    expect(active).toBe(1);
    expect(side).toBeLessThan(active);
    expect(far).toBeLessThan(side);
    expect(far).toBe(coverFlowTuning.coverShadow.min);
  });
});
