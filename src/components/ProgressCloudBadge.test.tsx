import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProgressCloudBadge } from "./ProgressCloudBadge";

describe("ProgressCloudBadge", () => {
  it("starts connected cloud progress at the top and closes the outline at 100%", () => {
    const partial = renderToStaticMarkup(
      <ProgressCloudBadge connected percent={1} />,
    );
    const complete = renderToStaticMarkup(
      <ProgressCloudBadge connected percent={100} />,
    );

    expect(partial).toContain('d="M40.5 4.7');
    expect(partial).toContain('stroke-dasharray="1 99"');
    expect(partial).toContain('stroke-dashoffset="0"');
    expect(complete).toContain('stroke-dasharray="100 0"');
    expect(complete).toContain('stroke-dashoffset="0"');
  });

  it("starts offline circle progress at twelve o'clock and closes it at 100%", () => {
    const partial = renderToStaticMarkup(<ProgressCloudBadge percent={1} />);
    const complete = renderToStaticMarkup(
      <ProgressCloudBadge percent={100} />,
    );

    expect(partial).toContain('d="M 32.000 6.800');
    expect(complete).toContain('transform="rotate(-90 32 32)"');
    expect(complete).toContain('stroke-dasharray="158.33626974092556 0"');
  });
});
