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
    label: "Hours of audio",
    value: formatReadingDurationForWords(catalog.stats.wordCount).replace(
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
