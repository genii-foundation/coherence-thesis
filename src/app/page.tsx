import Link from "next/link";
import Image from "next/image";
import { BookOpen, ListTree } from "lucide-react";
import { ManuscriptCoverFlowIsland } from "@/components/ManuscriptCoverFlowIsland";
import { catalog } from "@/lib/manuscript-data";

export default function Home() {
  return (
    <div className="home-page">
      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow">Nine volume series</p>
          <h1>The Coherence Thesis</h1>
          <p className="hero-deck">
            A living manuscript body on coherence, intelligence, coordination,
            human potential, and the future institutions required for a civilization
            worth inheriting.
          </p>
          <div className="hero-actions">
            <Link className="primary-link" href="/overview/">
              <ListTree aria-hidden="true" size={18} />
              Read the overview
            </Link>
            <Link className="secondary-link" href="/manuscripts/">
              <BookOpen aria-hidden="true" size={18} />
              Browse manuscripts
            </Link>
          </div>
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

      <section className="stats-band" aria-label="Manuscript stats">
        <div>
          <strong>{catalog.stats.volumeCount}</strong>
          <span>volumes</span>
        </div>
        <div>
          <strong>{catalog.stats.wordCount.toLocaleString()}</strong>
          <span>words</span>
        </div>
        <div>
          <strong>{catalog.stats.sectionCount.toLocaleString()}</strong>
          <span>sections</span>
        </div>
        <div>
          <strong>{catalog.stats.readingMinutes.toLocaleString()}</strong>
          <span>minutes full read</span>
        </div>
      </section>

      <ManuscriptCoverFlowIsland volumes={catalog.volumes} />
    </div>
  );
}
