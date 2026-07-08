import type { Metadata } from "next";
import { OverviewMap } from "@/components/OverviewMap";
import { catalog } from "@/lib/manuscript-data";
import { formatReadingDurationForWords } from "@/lib/reading-time";

export const metadata: Metadata = {
  title: "Overview",
  description:
    "Five-Minute Overview of The Coherence Thesis with direct links into the manuscript.",
  alternates: { canonical: "/overview/" },
};

export default function OverviewPage() {
  const fullReadDuration = formatReadingDurationForWords(catalog.stats.wordCount);
  const [fullReadValue, ...fullReadUnitParts] = fullReadDuration.split(" ");
  const fullReadUnit = fullReadUnitParts.join(" ");

  return (
    <div className="page-frame reader-layout">
      <article className="reader-main">
        <header className="page-heading">
          <h1>{catalog.overview.title}</h1>
          <p>{catalog.overview.subtitle}</p>
        </header>
        <section className="stats-band" aria-label="Manuscript stats">
          <div className="stats-band-item">
            <strong>{catalog.stats.volumeCount.toLocaleString()}</strong>
            <span>volumes</span>
          </div>
          <div className="stats-band-item">
            <strong>{catalog.stats.partCount.toLocaleString()}</strong>
            <span>parts</span>
          </div>
          <div className="stats-band-item">
            <strong>{catalog.stats.sectionCount.toLocaleString()}</strong>
            <span>sections</span>
          </div>
          <div className="stats-band-item stats-band-duration">
            <strong>
              <span className="stats-band-duration-value">
                {fullReadValue}
              </span>{" "}
              <span className="stats-band-duration-unit">{fullReadUnit}</span>
            </strong>
            <span>full read</span>
          </div>
        </section>
        <OverviewMap />
      </article>
    </div>
  );
}
