import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  BookOpen,
  Compass,
  Layers3,
  ListTree,
  Network,
  Radio,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { catalog } from "@/lib/manuscript-data";
import { formatReadingDurationForWords } from "@/lib/reading-time";

export const metadata: Metadata = {
  title: "Homepage Hero Lab",
  description: "Temporary homepage hero variants for The Coherence Thesis.",
  alternates: { canonical: "/hero-lab/" },
  robots: {
    index: false,
    follow: false,
  },
};

type HeroVariant = {
  id: string;
  eyebrow: string;
  title: string;
  deck: string;
  Icon: LucideIcon;
};

const firstVolume = catalog.volumes[0]!;
const manuscriptCount = catalog.stats.volumeCount.toLocaleString();
const sectionCount = catalog.stats.sectionCount.toLocaleString();
const wordCount = catalog.stats.wordCount.toLocaleString();
const audioLength = formatReadingDurationForWords(catalog.stats.wordCount);
const heroStats = [
  `${audioLength} audio`,
  `${wordCount} words`,
  `${manuscriptCount} volumes`,
  `${sectionCount} sections`,
];

const heroVariants: HeroVariant[] = [
  {
    id: "field-forming",
    eyebrow: "Variant 01",
    title: "There is a field forming around the work civilization forgot to name.",
    deck:
      "Presence, trust architecture, regenerative economics, anti-capture governance, humane intelligence, and right-sized community are not separate projects here. They are strands of one civilizational craft.",
    Icon: Radio,
  },
  {
    id: "civilizational-craft",
    eyebrow: "Variant 02",
    title: "A field guide for people building what comes after extraction.",
    deck:
      "The Coherence Thesis gathers the practical arts of a different civilization: builders, stewards, technologists, teachers, funders, and communities learning how to make wisdom operational.",
    Icon: Compass,
  },
  {
    id: "named-work",
    eyebrow: "Variant 03",
    title: "For the people who can feel the pattern before it has a name.",
    deck:
      "If your work sits between inner development, social architecture, humane technology, and place-based regeneration, this body of manuscripts is an attempt to make the whole pattern legible.",
    Icon: Network,
  },
  {
    id: "coherence-commons",
    eyebrow: "Variant 04",
    title: "The commons beneath the next civilization is coherence.",
    deck:
      "This is not a manifesto for better vibes. It is a long attempt to describe the substrate that lets trust, intelligence, governance, economics, culture, and power stay in right relationship.",
    Icon: Layers3,
  },
  {
    id: "body-again",
    eyebrow: "Variant 05",
    title: "Start where civilization becomes a living body again.",
    deck:
      "The future cannot be repaired by abstractions alone. These manuscripts begin with the living conditions of trust and follow them until they become tools, practices, institutions, and a place to stand.",
    Icon: BookOpen,
  },
];

function VariantActions() {
  return (
    <div className="hero-lab-actions">
      <Link className="primary-link" href={firstVolume.href}>
        <BookOpen aria-hidden="true" size={18} />
        <span>Begin Volume I</span>
      </Link>
      <Link className="secondary-link" href="/overview/">
        <ListTree aria-hidden="true" size={18} />
        <span>Read the overview</span>
      </Link>
    </div>
  );
}

function VariantCover({ priority = false }: { priority?: boolean }) {
  return (
    <div className="hero-lab-cover-visual" aria-label="Coherence Thesis cover art">
      <Image
        src="/art/coherence-thesis-hero.png"
        alt="The Coherence Thesis hero artwork."
        width={1024}
        height={1536}
        priority={priority}
      />
    </div>
  );
}

export default function HeroLabPage() {
  return (
    <div className="hero-lab-page">
      <header className="hero-lab-heading">
        <p className="eyebrow">Temporary homepage testing page</p>
        <h1>Five merged hero directions for The Coherence Thesis</h1>
        <p>
          Each option blends the architecture, builder, and field-forming
          directions while keeping the cover image and the original homepage
          entry points.
        </p>
      </header>

      <div className="hero-lab-variants" aria-label="Homepage hero variants">
        {heroVariants.map((variant, index) => (
          <section className={`hero-lab-variant ${variant.id}`} key={variant.id}>
            <div className="hero-lab-copy">
              <p className="eyebrow">{variant.eyebrow}</p>
              <variant.Icon aria-hidden="true" className="hero-lab-icon" />
              <h2>{variant.title}</h2>
              <p>{variant.deck}</p>
              <VariantActions />
              <ul aria-label={`${variant.eyebrow} stats`}>
                {heroStats.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
            <VariantCover priority={index === 0} />
          </section>
        ))}
      </div>
    </div>
  );
}
