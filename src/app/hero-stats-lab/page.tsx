import type { Metadata } from "next";
import { HeroActionsIsland } from "@/components/HeroActionsIsland";
import { HeroStats } from "@/components/HeroStats";
import { catalog } from "@/lib/manuscript-data";

export const metadata: Metadata = {
  title: "Hero stat treatments",
  robots: {
    index: false,
    follow: false,
  },
};

const firstReadTarget = catalog.sections[0]!;
const heroReadTargets = catalog.sections.map((section) => ({
  contentHash: section.contentHash,
  href: section.readerHref,
  sectionId: section.sectionId,
}));

const treatments = [
  {
    className: "hero-stats-lab-ledger",
    id: "ledger",
    label: "Option one",
    title: "Hairline ledger",
    description:
      "A quiet, high-contrast baseline with explicit labels and hairline divisions.",
  },
  {
    className: "hero-stats-lab-editorial",
    id: "editorial",
    label: "Option two",
    title: "Light editorial",
    description:
      "Ultra-light numerals do the speaking, while the labels recede into a single measured line.",
  },
  {
    className: "hero-stats-lab-copperplate",
    id: "copperplate",
    label: "Option three",
    title: "Copperplate reserve",
    description:
      "A crisper engraved feel, with restrained small caps and no visual clutter.",
  },
];

export default function HeroStatsLab() {
  return (
    <main className="hero-stats-lab">
      <header className="hero-stats-lab-intro">
        <p className="hero-stats-lab-kicker">Homepage refinement</p>
        <h1>Three treatments for the hero proof points.</h1>
        <p>
          Same live manuscript data, same hero controls, three different ways of
          making the small line at the bottom feel intentional.
        </p>
      </header>

      <div className="hero-stats-lab-options">
        {treatments.map((treatment) => (
          <section
            aria-labelledby={`${treatment.id}-title`}
            className={`hero-stats-lab-option ${treatment.className}`}
            key={treatment.id}
          >
            <header className="hero-stats-lab-option-heading">
              <p>{treatment.label}</p>
              <h2 id={`${treatment.id}-title`}>{treatment.title}</h2>
              <span>{treatment.description}</span>
            </header>
            <div className="hero-stats-lab-hero-footer">
              <HeroActionsIsland
                fallbackHref={firstReadTarget.href}
                sections={heroReadTargets}
              />
              <HeroStats
                className={`hero-stats-lab-stats${
                  treatment.id === "copperplate" ? " hero-stats--copperplate" : ""
                }`}
              />
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
