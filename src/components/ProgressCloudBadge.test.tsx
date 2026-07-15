import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProgressCloudBadge } from "./ProgressCloudBadge";

describe("ProgressCloudBadge", () => {
  it("starts connected cloud progress at the measured top and keeps partial fills proportional", () => {
    const empty = renderToStaticMarkup(
      <ProgressCloudBadge connected percent={0} />,
    );
    const partial = renderToStaticMarkup(
      <ProgressCloudBadge connected percent={1} />,
    );
    const quarter = renderToStaticMarkup(
      <ProgressCloudBadge connected percent={25} />,
    );
    const halfway = renderToStaticMarkup(
      <ProgressCloudBadge connected percent={50} />,
    );
    const almostComplete = renderToStaticMarkup(
      <ProgressCloudBadge connected percent={97} />,
    );
    const complete = renderToStaticMarkup(
      <ProgressCloudBadge connected percent={100} />,
    );

    expect(partial).toContain('viewBox="0 0 64 64"');
    expect(empty).toContain('class="progress-cloud-progress-blip"');
    expect(empty).toContain('cx="30.857" cy="11.248" r="1.9"');
    expect(partial).toContain(
      'transform="translate(0 7.667) scale(0.7619048)"',
    );
    expect(partial).toContain('--progress-cloud-text-size:15px');
    expect(partial).toContain('d="M40.5 4.7');
    expect(partial).not.toContain('stroke-dashoffset');
    for (const [markup, expectedPercent] of [
      [partial, 1],
      [quarter, 25],
      [halfway, 50],
      [almostComplete, 97],
    ] as const) {
      const dash = markup.match(/stroke-dasharray="([^"]+)"/)?.[1];
      if (!dash) throw new Error("Missing connected cloud dash array");
      const dashValues = dash.split(" ").map(Number);
      const progressLength = dashValues[0] ?? Number.NaN;
      const renderedPathLength = dashValues[1] ?? Number.NaN;
      expect(renderedPathLength).toBeCloseTo(103.9453, 4);
      expect((progressLength / renderedPathLength) * 100).toBeCloseTo(
        expectedPercent,
        6,
      );
    }
    expect(complete).not.toContain('stroke-dasharray');
  });

  it("starts offline circle progress at twelve o'clock, including the zero-percent blip", () => {
    const empty = renderToStaticMarkup(<ProgressCloudBadge percent={0} />);
    const partial = renderToStaticMarkup(<ProgressCloudBadge percent={1} />);
    const complete = renderToStaticMarkup(
      <ProgressCloudBadge percent={100} />,
    );

    expect(empty).toContain('class="progress-cloud-progress-blip"');
    expect(empty).toContain('cx="32" cy="12.5" r="1.6"');
    expect(partial).toContain('d="M 32.000 12.500');
    expect(partial).toContain('--progress-cloud-text-size:15px');
    expect(partial).toContain('stroke-linecap="round"');
    expect(complete).toContain('transform="rotate(-90 32 32)"');
    expect(complete).toContain('stroke-dasharray="122.52211349000193 0"');
    expect(complete).toContain('stroke-linecap="round"');
  });
});
