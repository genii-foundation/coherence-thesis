import { catalog } from "@/lib/manuscript-data";
import { formatReadingDurationForWords } from "@/lib/reading-time";

const heroStats = [
  {
    label: "Volumes",
    value: catalog.stats.volumeCount.toLocaleString(),
  },
  {
    label: "Sections",
    value: catalog.stats.sectionCount.toLocaleString(),
  },
  {
    label:
      catalog.stats.recordedAudioSectionCount > 0
        ? "Hours of audio"
        : "Estimated hours",
    value:
      catalog.stats.recordedAudioSectionCount > 0
        ? (catalog.stats.audioDurationSeconds / 3600).toLocaleString(undefined, {
            maximumFractionDigits: 1,
            minimumFractionDigits: 1,
          })
        : formatReadingDurationForWords(catalog.stats.wordCount).replace(
            / hours$/,
            "",
          ),
  },
];

type HeroStatsProps = {
  className: string;
};

export function HeroStats({ className }: HeroStatsProps) {
  return (
    <dl className={className} aria-label="Manuscript stats">
      {heroStats.map((stat) => (
        <div key={stat.label}>
          <dt>{stat.label}</dt>
          <dd>{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}
