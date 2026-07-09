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
    const halfway = renderToStaticMarkup(
      <ProgressCloudBadge connected percent={50} />,
    );
    const complete = renderToStaticMarkup(
      <ProgressCloudBadge connected percent={100} />,
    );

    expect(partial).toContain('viewBox="0 0 64 64"');
    expect(empty).toContain('class="progress-cloud-progress-blip"');
    expect(empty).toContain('cx="30.857" cy="14.248" r="1.9"');
    expect(partial).toContain(
      'transform="translate(0 10.667) scale(0.7619048)"',
    );
    expect(partial).toContain('--progress-cloud-text-size:14px');
    expect(partial).toContain('d="M20.6 46.4');
    expect(partial).toContain('stroke-dasharray="1 99"');
    expect(partial).toContain('stroke-dashoffset="62.75"');
    expect(halfway).toContain('stroke-dasharray="50 50"');
    expect(halfway).toContain('stroke-dashoffset="62.75"');
    expect(complete).toContain('stroke-dasharray="100 0"');
    expect(complete).toContain('stroke-dashoffset="0"');
  });

  it("starts offline circle progress at twelve o'clock, including the zero-percent blip", () => {
    const empty = renderToStaticMarkup(<ProgressCloudBadge percent={0} />);
    const partial = renderToStaticMarkup(<ProgressCloudBadge percent={1} />);
    const complete = renderToStaticMarkup(
      <ProgressCloudBadge percent={100} />,
    );

    expect(empty).toContain('class="progress-cloud-progress-blip"');
    expect(empty).toContain('cx="32" cy="6.8" r="1.6"');
    expect(partial).toContain('d="M 32.000 6.800');
    expect(partial).toContain('--progress-cloud-text-size:14px');
    expect(partial).toContain('stroke-linecap="round"');
    expect(complete).toContain('transform="rotate(-90 32 32)"');
    expect(complete).toContain('stroke-dasharray="158.33626974092556 0"');
    expect(complete).toContain('stroke-linecap="round"');
  });
});
