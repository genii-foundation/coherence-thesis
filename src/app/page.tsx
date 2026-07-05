import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, ListTree } from "lucide-react";
import { ManuscriptCoverFlowIsland } from "@/components/ManuscriptCoverFlowIsland";
import { catalog } from "@/lib/manuscript-data";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <div className="home-page">
      <section className="hero-section">
        <div className="hero-copy">
          <h1>The Coherence Thesis</h1>
          <p className="hero-deck">
            Nine living manuscripts on coherence, trust, and the future
            institutions required for a civilization worth inheriting.
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
