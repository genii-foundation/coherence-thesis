import type { Metadata } from "next";
import { ProgressCloudBadge } from "@/components/ProgressCloudBadge";
import { ProgressCloudOffsetEditor } from "@/components/ProgressCloudOffsetEditor";

export const metadata: Metadata = {
  title: "Progress Icon Preview",
  robots: { follow: false, index: false },
};

const progressValues = [0, 1, 25, 50, 97, 100];

export default function ProgressPreviewPage() {
  return (
    <main className="page-frame progress-preview-page">
      <header className="page-heading">
        <p className="eyebrow">Temporary visual check</p>
        <h1>Toolbar progress icons</h1>
        <p>
          Cloud shows synced progress. Circle shows local-only progress. This
          page is not linked from the reader and will be removed before release.
        </p>
      </header>
      <div className="progress-preview-grid">
        {progressValues.map((percent) => (
          <section className="progress-preview-card" key={percent}>
            <h2>{percent.toLocaleString()}%</h2>
            <div className="progress-preview-icons">
              <figure>
                <div className="progress-preview-icon" aria-hidden="true">
                  <ProgressCloudBadge connected percent={percent} />
                </div>
                <figcaption>Cloud sync</figcaption>
              </figure>
              <figure>
                <div className="progress-preview-icon" aria-hidden="true">
                  <ProgressCloudBadge percent={percent} />
                </div>
                <figcaption>Local circle</figcaption>
              </figure>
            </div>
          </section>
        ))}
      </div>
      <ProgressCloudOffsetEditor />
    </main>
  );
}
