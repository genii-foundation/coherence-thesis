"use client";

import { useState } from "react";
import { ProgressCloudBadge } from "@/components/ProgressCloudBadge";

const samplePercents = [1, 25, 50, 97];

export function ProgressCloudOffsetEditor() {
  const [offset, setOffset] = useState(62.75);

  return (
    <section
      aria-labelledby="cloud-offset-heading"
      className="progress-cloud-offset-editor"
    >
      <div className="progress-cloud-offset-heading">
        <div>
          <p className="eyebrow">Temporary calibration</p>
          <h2 id="cloud-offset-heading">Cloud partial-progress start</h2>
        </div>
        <output aria-live="polite" htmlFor="cloud-offset">
          {offset.toFixed(2)}
        </output>
      </div>
      <label className="progress-cloud-offset-control" htmlFor="cloud-offset">
        <span>Dash offset</span>
        <input
          id="cloud-offset"
          max="100"
          min="0"
          onChange={(event) => setOffset(Number(event.target.value))}
          step="0.25"
          type="range"
          value={offset}
        />
      </label>
      <p className="progress-cloud-offset-help">
        This changes only partial cloud states. Zero remains fixed at twelve
        o&apos;clock so its start dot cannot drift.
      </p>
      <div className="progress-cloud-offset-samples">
        {samplePercents.map((percent) => (
          <figure key={percent}>
            <div className="progress-preview-icon" aria-hidden="true">
              <ProgressCloudBadge
                cloudDashOffset={offset}
                connected
                percent={percent}
              />
            </div>
            <figcaption>{percent.toLocaleString()}%</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
