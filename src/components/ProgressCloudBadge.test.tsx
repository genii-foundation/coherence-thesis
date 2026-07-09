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
    expect(partial).toContain(
      'stroke-dasharray="1.8817681884765625 188.17681884765625"',
    );
    expect(partial).not.toContain('stroke-dashoffset');
    expect(quarter).toContain(
      'stroke-dasharray="47.04420471191406 188.17681884765625"',
    );
    expect(halfway).toContain(
      'stroke-dasharray="94.08840942382812 188.17681884765625"',
    );
    expect(almostComplete).toContain(
      'stroke-dasharray="182.53151428222657 188.17681884765625"',
    );
    expect(complete).not.toContain('stroke-dasharray');
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
    expect(partial).toContain('--progress-cloud-text-size:15px');
    expect(partial).toContain('stroke-linecap="round"');
    expect(complete).toContain('transform="rotate(-90 32 32)"');
    expect(complete).toContain('stroke-dasharray="158.33626974092556 0"');
    expect(complete).toContain('stroke-linecap="round"');
  });
});
