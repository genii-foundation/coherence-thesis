import { describe, expect, it } from "vitest";
import {
  circleProgressArc,
  progressDashArray,
  renderedCloudPathLength,
} from "./progress-icon-geometry";

describe("progress icon geometry", () => {
  it.each([34, 38, 46.4])(
    "keeps cloud progress proportional at a %d px footprint",
    (size) => {
      const perimeter = renderedCloudPathLength(size);

      for (const percent of [25, 53, 54, 75]) {
        const dash = progressDashArray(percent, perimeter);
        expect(dash).toBeDefined();
        const parts = dash!.split(" ").map(Number);
        const progressLength = parts[0]!;
        const gapLength = parts[1]!;

        expect(progressLength / perimeter).toBeCloseTo(percent / 100, 8);
        expect(progressLength).toBeLessThan(perimeter);
        expect(gapLength).toBeCloseTo(perimeter, 8);
      }

      expect(progressDashArray(100, perimeter)).toBeUndefined();
    },
  );

  it("draws partial circles as proportional angular arcs", () => {
    const arcs = [25, 53, 54, 75].map((percent) => ({
      arc: circleProgressArc(percent),
      percent,
    }));

    for (const { arc, percent } of arcs) {
      const coordinates = arc.split(" ");
      const endX = Number(coordinates.at(-2));
      const endY = Number(coordinates.at(-1));
      const radians = ((percent * 3.6 - 90) * Math.PI) / 180;

      expect(endX).toBeCloseTo(32 + 19.5 * Math.cos(radians), 3);
      expect(endY).toBeCloseTo(32 + 19.5 * Math.sin(radians), 3);
      expect(arc).toContain(`A 19.5 19.5 0 ${percent > 50 ? 1 : 0} 1`);
    }

    expect(new Set(arcs.map(({ arc }) => arc)).size).toBe(arcs.length);
    expect(circleProgressArc(0)).toBe("");
    expect(circleProgressArc(100)).toBe("");
  });
});
