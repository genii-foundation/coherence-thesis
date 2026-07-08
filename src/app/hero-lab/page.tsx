import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Compass,
  Layers3,
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
  actionLabel: string;
  actionHref: string;
  Icon: LucideIcon;
  visual: "cover" | "thesis" | "map" | "library" | "intro";
  proofPoints: string[];
};

const overviewNodes = catalog.overview.nodes;
const firstVolume = catalog.volumes[0]!;
const orientation = catalog.sections[0]!;
const firstReadingMinutes = formatReadingDurationForWords(firstVolume.wordCount);
const fullReadingMinutes = formatReadingDurationForWords(catalog.stats.wordCount);
const manuscriptCount = catalog.stats.volumeCount.toLocaleString();
const sectionCount = catalog.stats.sectionCount.toLocaleString();

const thesisSeed =
  "The Coherence Thesis argues that the future will not be decided by technology or ideology alone, but by whether civilization can protect the biological conditions that make intelligence, trust, and coordination possible at scale.";

const heroVariants: HeroVariant[] = [
  {
    id: "living-architecture",
    eyebrow: "Variant 01",
    title: "A living architecture for a civilization worth inheriting.",
    deck:
      "Nine manuscripts trace one claim through biology, trust, economics, governance, technology, practice, and place: power has to grow inside coherence, or it eventually eats the conditions that made it possible.",
    actionLabel: "Read more",
    actionHref: "/overview/",
    Icon: Compass,
    visual: "cover",
    proofPoints: [
      `${manuscriptCount} volumes`,
      `${sectionCount} sections`,
      fullReadingMinutes,
    ],
  },
  {
    id: "begin-with-invitation",
    eyebrow: "Variant 02",
    title: "The future begins below politics.",
    deck: thesisSeed,
    actionLabel: "Read more",
    actionHref: orientation.href,
    Icon: BookOpen,
    visual: "intro",
    proofPoints: [
      "Start with the orientation",
      firstReadingMinutes,
      firstVolume.title,
    ],
  },
  {
    id: "from-crisis-to-craft",
    eyebrow: "Variant 03",
    title: "Not another diagnosis. A build manual for coherence.",
    deck:
      "The series moves from the substrate beneath our crises to the structures that could carry trust, care, wisdom, and action without turning them into coercion or surveillance.",
    actionLabel: "Read more",
    actionHref: "/overview/",
    Icon: Layers3,
    visual: "map",
    proofPoints: [
      overviewNodes[0]!.title,
      overviewNodes[2]!.title,
      overviewNodes[3]!.title,
    ],
  },
  {
    id: "builders-field",
    eyebrow: "Variant 04",
    title: "For builders trying to make wisdom operational.",
    deck:
      "Providence is treated as a coordination device, a social architecture, and eventually a place. The manuscripts ask what has to be true before humane technology can strengthen relationship instead of replacing it.",
    actionLabel: "Read more",
    actionHref: catalog.volumes[1]!.href,
    Icon: Network,
    visual: "library",
    proofPoints: [
      overviewNodes[1]!.title,
      overviewNodes[3]!.title,
      overviewNodes[8]!.title,
    ],
  },
  {
    id: "signal-for-the-work",
    eyebrow: "Variant 05",
    title: "There is a field forming around the work civilization forgot to name.",
    deck:
      "The thesis gathers the practical arts of coherence: presence, trust architecture, regenerative economics, anti-capture governance, humane intelligence, and the smallest viable nests where the pattern can become real.",
    actionLabel: "Read more",
    actionHref: "/manuscripts/",
    Icon: Radio,
    visual: "thesis",
    proofPoints: [
      overviewNodes[4]!.title,
      overviewNodes[5]!.title,
      overviewNodes[6]!.title,
    ],
  },
];

function VariantVisual({ variant }: { variant: HeroVariant }) {
  if (variant.visual === "cover") {
    return (
      <div className="hero-lab-cover-visual" aria-label="Coherence Thesis cover art">
        <Image
          src="/art/coherence-thesis-hero.png"
          alt="The Coherence Thesis hero artwork."
          width={1024}
          height={1536}
          priority
        />
      </div>
    );
  }

  if (variant.visual === "intro") {
    return (
      <div className="hero-lab-intro-visual" aria-label="Opening thesis excerpt">
        <p>{thesisSeed}</p>
        <span>{orientation.title}</span>
      </div>
    );
  }

  if (variant.visual === "map") {
    return (
      <div className="hero-lab-map-visual" aria-label="Thesis summary map">
        {overviewNodes.slice(0, 5).map((node, index) => (
          <Link
            href={
              catalog.sections.find(
                (section) => section.sectionId === node.references[0]?.sectionId,
              )?.href ?? "/overview/"
            }
            key={node.id}
            style={{ "--node-index": index } as CSSProperties}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{node.title}</strong>
          </Link>
        ))}
      </div>
    );
  }

  if (variant.visual === "library") {
    return (
      <div className="hero-lab-library-visual" aria-label="Manuscript cover stack">
        {catalog.volumes.slice(0, 5).map((volume) => (
          <Link href={volume.href} key={volume.volumeId}>
            <Image
              src={volume.coverImage}
              alt={volume.coverAlt}
              width={320}
              height={480}
            />
            <span>{volume.numberLabel}</span>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="hero-lab-thesis-visual" aria-label="Thesis strands">
      {overviewNodes.slice(0, 9).map((node, index) => (
        <span key={node.id} style={{ "--strand-index": index } as CSSProperties}>
          {node.title}
        </span>
      ))}
    </div>
  );
}

export default function HeroLabPage() {
  return (
    <div className="hero-lab-page">
      <header className="hero-lab-heading">
        <p className="eyebrow">Temporary homepage testing page</p>
        <h1>Five hero directions for The Coherence Thesis</h1>
        <p>
          Each option opens with a different thesis angle and keeps the next
          step brutally simple: read more.
        </p>
      </header>

      <div className="hero-lab-variants" aria-label="Homepage hero variants">
        {heroVariants.map((variant) => (
          <section className={`hero-lab-variant ${variant.id}`} key={variant.id}>
            <div className="hero-lab-copy">
              <p className="eyebrow">{variant.eyebrow}</p>
              <variant.Icon aria-hidden="true" className="hero-lab-icon" />
              <h2>{variant.title}</h2>
              <p>{variant.deck}</p>
              <div className="hero-lab-actions">
                <Link className="primary-link" href={variant.actionHref}>
                  <span>{variant.actionLabel}</span>
                  <ArrowRight aria-hidden="true" size={18} />
                </Link>
              </div>
              <ul aria-label={`${variant.eyebrow} proof points`}>
                {variant.proofPoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
            <VariantVisual variant={variant} />
          </section>
        ))}
      </div>
    </div>
  );
}
