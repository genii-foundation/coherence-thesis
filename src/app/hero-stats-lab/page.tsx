import type { Metadata } from "next";
import {
  Alegreya_SC,
  Bellefair,
  Cormorant_Garamond,
  Fraunces,
  Marcellus,
} from "next/font/google";
import { HeroActionsIsland } from "@/components/HeroActionsIsland";
import { HeroStats } from "@/components/HeroStats";
import { catalog } from "@/lib/manuscript-data";

export const metadata: Metadata = {
  title: "Hero stat font comparison",
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

const marcellus = Marcellus({
  display: "swap",
  preload: false,
  subsets: ["latin"],
  weight: "400",
});

const bellefair = Bellefair({
  display: "swap",
  preload: false,
  subsets: ["latin"],
  weight: "400",
});

const alegreyaSc = Alegreya_SC({
  display: "swap",
  preload: false,
  subsets: ["latin"],
  weight: "400",
});

const cormorantGaramond = Cormorant_Garamond({
  display: "swap",
  preload: false,
  subsets: ["latin"],
  weight: "400",
});

const fraunces = Fraunces({
  display: "swap",
  preload: false,
  subsets: ["latin"],
  weight: "400",
});

const treatments = [
  {
    fontClassName: marcellus.className,
    id: "marcellus",
    label: "Option one",
    title: "Marcellus",
    description:
      "Classical, upright numerals with open proportions and calm authority.",
  },
  {
    fontClassName: bellefair.className,
    id: "bellefair",
    label: "Option two",
    title: "Bellefair",
    description:
      "Airy, elegant numerals with soft curves and generous height.",
  },
  {
    fontClassName: alegreyaSc.className,
    id: "alegreya-sc",
    label: "Option three",
    title: "Alegreya SC",
    description:
      "Calligraphic numerals with humanist curves and a little mischief.",
  },
  {
    fontClassName: cormorantGaramond.className,
    id: "cormorant-garamond",
    label: "Option four",
    title: "Cormorant Garamond",
    description:
      "Tall, elegant figures with fine contrast and generous air.",
  },
  {
    fontClassName: fraunces.className,
    id: "fraunces",
    label: "Option five",
    title: "Fraunces",
    description:
      "Warm, sculpted numerals with soft corners and an Arts and Crafts flavor.",
  },
];

export default function HeroStatsLab() {
  return (
    <main className="hero-stats-lab">
      <header className="hero-stats-lab-intro">
        <p className="hero-stats-lab-kicker">Numeral study</p>
        <h1>Five type directions for the hero stats.</h1>
        <p>
          Same live data, controls, labels, size, and spacing. Only the large
          numeral face changes.
        </p>
      </header>

      <div className="hero-stats-lab-options">
        {treatments.map((treatment) => (
          <section
            aria-labelledby={`${treatment.id}-title`}
            className="hero-stats-lab-option"
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
                className={`hero-stats hero-stats--copperplate hero-stats-lab-stats ${treatment.fontClassName}`}
              />
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
