import { describe, expect, it } from "vitest";
import {
  coverFlowTuning,
  getCoverFlowFlickTarget,
  getCoverFlowTransform,
  getCoverFlowWheelIntent,
} from "./cover-flow-motion";

describe("cover flow motion", () => {
  it("keeps the center transform continuous through tiny scroll changes", () => {
    let previous = getCoverFlowTransform(-3).shift;
    let maxShiftStep = 0;

    for (let offset = -2.995; offset <= 3; offset += 0.005) {
      const current = getCoverFlowTransform(offset).shift;
      maxShiftStep = Math.max(maxShiftStep, Math.abs(current - previous));
      previous = current;
    }

    expect(maxShiftStep).toBeLessThan(5);
  });

  it("keeps side cover corrections mirrored and bounded", () => {
    for (let offset = 0.05; offset <= 2.6; offset += 0.05) {
      const right = getCoverFlowTransform(offset).shift;
      const left = getCoverFlowTransform(-offset).shift;

      expect(Math.abs(right + left)).toBeLessThan(0.001);
      expect(Math.abs(right)).toBeLessThan(340);
    }
  });

  it("fans the first two background cards while pulling the outer stack inward", () => {
    const activeNeighbor = getCoverFlowTransform(0.44).shift;
    const firstBackground = getCoverFlowTransform(1).shift;
    const outerBackground = getCoverFlowTransform(1.4).shift;
    const farBackground = getCoverFlowTransform(2).shift;

    expect(activeNeighbor).toBeGreaterThan(260);
    expect(firstBackground).toBeGreaterThan(80);
    expect(outerBackground).toBeLessThan(10);
    expect(farBackground).toBeLessThan(firstBackground / 2);
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

  it("sends a decisive forward flick to the last cover", () => {
    expect(
      getCoverFlowFlickTarget({
        activeIndex: 2,
        distancePx: coverFlowTuning.scroll.flickDistancePx + 1,
        peakDeltaPx: 12,
        volumeCount: 9,
      }),
    ).toBe(8);
  });

  it("sends a decisive backward flick to the first cover", () => {
    expect(
      getCoverFlowFlickTarget({
        activeIndex: 6,
        distancePx: -coverFlowTuning.scroll.flickDistancePx - 1,
        peakDeltaPx: -12,
        volumeCount: 9,
      }),
    ).toBe(0);
  });

  it("ignores small cover flow wheel movement", () => {
    expect(
      getCoverFlowFlickTarget({
        activeIndex: 2,
        distancePx: coverFlowTuning.scroll.flickDistancePx - 1,
        peakDeltaPx: coverFlowTuning.scroll.flickPeakDeltaPx - 1,
        volumeCount: 9,
      }),
    ).toBeNull();
  });

  it("ignores flicks that already target the active rail end", () => {
    expect(
      getCoverFlowFlickTarget({
        activeIndex: 8,
        distancePx: coverFlowTuning.scroll.flickDistancePx + 1,
        peakDeltaPx: 12,
        volumeCount: 9,
      }),
    ).toBeNull();
  });

  it("hands meaningful vertical wheel intent back to the page during leftover horizontal inertia", () => {
    expect(
      getCoverFlowWheelIntent({ deltaX: 20, deltaY: 32, shiftKey: false }),
    ).toBe("vertical");
  });

  it("keeps horizontal trackpad swipes and shift-wheel gestures on the cover rail", () => {
    expect(
      getCoverFlowWheelIntent({ deltaX: 20, deltaY: 12, shiftKey: false }),
    ).toBe("horizontal");
    expect(
      getCoverFlowWheelIntent({ deltaX: 24, deltaY: 2, shiftKey: false }),
    ).toBe("horizontal");
    expect(
      getCoverFlowWheelIntent({ deltaX: 0, deltaY: 24, shiftKey: true }),
    ).toBe("horizontal");
  });
});
