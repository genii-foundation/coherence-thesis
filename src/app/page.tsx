import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, ListTree } from "lucide-react";
import { ManuscriptCoverFlowIsland } from "@/components/ManuscriptCoverFlowIsland";
import { catalog } from "@/lib/manuscript-data";
import { formatReadingDurationForWords } from "@/lib/reading-time";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const heroStats = [
  `${catalog.stats.volumeCount.toLocaleString()} volumes`,
  `${catalog.stats.sectionCount.toLocaleString()} sections`,
  `${formatReadingDurationForWords(catalog.stats.wordCount)} of audio`,
];

export default function Home() {
  return (
    <div className="home-page">
      <section className="hero-section">
        <div className="hero-copy">
          <h1>There is a field forming around the work civilization forgot to name.</h1>
          <p className="hero-deck">
            Presence, trust architecture, regenerative economics, anti-capture
            governance, humane intelligence, and right-sized community are not
            separate projects here. They are strands of one civilizational craft.
          </p>
          <div className="hero-actions">
            <Link className="primary-link" href={catalog.volumes[0]!.href}>
              <BookOpen aria-hidden="true" size={18} />
              Begin Volume I
            </Link>
            <Link className="secondary-link" href="/overview/">
              <ListTree aria-hidden="true" size={18} />
              Read the overview
            </Link>
          </div>
          <ul className="hero-stats" aria-label="Manuscript stats">
            {heroStats.map((stat) => (
              <li key={stat}>{stat}</li>
            ))}
          </ul>
        </div>
        <div className="hero-art" aria-label="Coherence Thesis cover art">
          <Image
            src="/art/coherence-thesis-hero.png"
            alt="The Coherence Thesis final hero artwork."
            width={1024}
            height={1536}
            priority
          />
        </div>
      </section>

      <ManuscriptCoverFlowIsland volumes={catalog.volumes} />
    </div>
  );
}
