import type { Metadata } from "next";
import { ReaderProgressHeatmapIsland } from "@/components/ReaderProgressHeatmapIsland";
import { buildReaderHeatmapModel } from "@/lib/reader-heatmap";

export const metadata: Metadata = {
  title: "Reading Map",
  description: "A local progress map across The Coherence Thesis manuscripts.",
};

export default function ProgressPage() {
  const model = buildReaderHeatmapModel();

  return (
    <div className="page-frame progress-page">
      <header className="page-heading">
        <p className="eyebrow">Local progress</p>
        <h1>Reading Map</h1>
        <p>One thousand circles across the nine manuscripts.</p>
      </header>
      <ReaderProgressHeatmapIsland model={model} />
    </div>
  );
}
