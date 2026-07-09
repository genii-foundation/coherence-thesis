import type { Metadata } from "next";
import Image from "next/image";
import { HeroActionsIsland } from "@/components/HeroActionsIsland";
import { HeroStats } from "@/components/HeroStats";
import { ManuscriptCoverFlowIsland } from "@/components/ManuscriptCoverFlowIsland";
import { catalog } from "@/lib/manuscript-data";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const firstReadTarget = catalog.sections[0]!;
const heroReadTargets = catalog.sections.map((section) => ({
  sectionId: section.sectionId,
  contentHash: section.contentHash,
  href: section.readerHref,
}));
export default function Home() {
  const volumes = catalog.volumes.map((volume) => ({
    ...volume,
    firstSectionHref:
      catalog.sections.find((section) => section.volumeId === volume.volumeId)
        ?.href ?? volume.href,
  }));
  const progressSections = catalog.sections.map((section) => ({
    contentHash: section.contentHash,
    href: section.readerHref,
    sectionId: section.sectionId,
  }));

  return (
    <div className="home-page">
      <section className="hero-section">
        <div className="hero-copy">
          <h1>Follow the common thread.</h1>
          <p className="hero-deck">
            If your path moves through inner development, social architecture,
            humane technology, and place-based regeneration, join us in shaping
            a future worth inheriting.
          </p>
          <div className="hero-cta-stack">
            <HeroActionsIsland
              fallbackHref={firstReadTarget.href}
              sections={heroReadTargets}
            />
            <HeroStats className="hero-stats hero-stats--copperplate" />
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

      <ManuscriptCoverFlowIsland
        progressSections={progressSections}
        volumes={volumes}
      />
    </div>
  );
}
