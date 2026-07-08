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
  proofPoints: string[];
};

const overviewNodes = catalog.overview.nodes;
const firstVolume = catalog.volumes[0]!;
const fullReadingMinutes = formatReadingDurationForWords(catalog.stats.wordCount);
const manuscriptCount = catalog.stats.volumeCount.toLocaleString();
const sectionCount = catalog.stats.sectionCount.toLocaleString();

const heroVariants: HeroVariant[] = [
  {
    id: "coherent-power",
    eyebrow: "Variant 01",
    title: "Power, but grown inside coherence.",
    deck:
      "Nine manuscripts trace a practical architecture for becoming more capable without becoming more extractive. The work moves from biology and trust into governance, technology, culture, and place.",
    Icon: Compass,
    proofPoints: [
      `${manuscriptCount} volumes`,
      `${sectionCount} sections`,
      fullReadingMinutes,
    ],
  },
  {
    id: "builders-threshold",
    eyebrow: "Variant 02",
    title: "A build manual for the people carrying the future.",
    deck:
      "Providence is treated as a coordination device, a social architecture, and eventually a place. The thesis asks what builders need before wisdom can become operational.",
    Icon: Network,
    proofPoints: [
      overviewNodes[1]!.title,
      overviewNodes[3]!.title,
      overviewNodes[8]!.title,
    ],
  },
  {
    id: "field-forming",
    eyebrow: "Variant 03",
    title: "There is a field forming around the work civilization forgot to name.",
    deck:
      "Presence, trust architecture, regenerative economics, anti-capture governance, humane intelligence, and right-sized community are not separate projects here. They are strands of one civilizational craft.",
    Icon: Radio,
    proofPoints: [
      overviewNodes[4]!.title,
      overviewNodes[5]!.title,
      overviewNodes[6]!.title,
    ],
  },
  {
    id: "architecture-of-trust",
    eyebrow: "Variant 04",
    title: "The thesis is not a mood. It is architecture.",
    deck:
      "The argument is built like infrastructure: substrate, coordination device, build sequence, human practice, and first scale. The question is whether power can be held by systems designed not to capture what they touch.",
    Icon: Layers3,
    proofPoints: [
      overviewNodes[0]!.title,
      overviewNodes[2]!.title,
      overviewNodes[3]!.title,
    ],
  },
  {
    id: "begin-the-body",
    eyebrow: "Variant 05",
    title: "Start where civilization becomes a body again.",
    deck:
      "The Coherence Thesis is for readers who suspect the future cannot be repaired by abstractions alone. It begins with the living conditions of trust and follows them until they become tools, culture, and a place to stand.",
    Icon: BookOpen,
    proofPoints: [
      firstVolume.title,
      "The practical arts of coherence",
      "A place to begin",
    ],
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
              <ul aria-label={`${variant.eyebrow} proof points`}>
                {variant.proofPoints.map((point) => (
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
