import { describe, expect, it } from "vitest";
import { coverFlowTuning, getCoverFlowTransform } from "./cover-flow-motion";

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

  it("keeps every card safely short of a backside rotation", () => {
    for (
      let offset = -coverFlowTuning.rotation.maxMeasuredOffset;
      offset <= coverFlowTuning.rotation.maxMeasuredOffset;
      offset += 0.05
    ) {
      expect(Math.abs(getCoverFlowTransform(offset).rotate)).toBeLessThan(45);
      expect(Math.abs(getCoverFlowTransform(offset).rotate)).toBeLessThan(90);
    }
  });

  it("keeps immediate side covers large enough to stay legible", () => {
    expect(getCoverFlowTransform(1).scale).toBeGreaterThanOrEqual(0.75);
    expect(getCoverFlowTransform(-1).scale).toBeGreaterThanOrEqual(0.75);
  });

  it("keeps visual card centers monotonic with a tighter peripheral stack", () => {
    const step = coverFlowTuning.spacing.nativeScrollStepPx;
    const visualCenter = (offset: number) =>
      offset * step + getCoverFlowTransform(offset, step).shift;

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
