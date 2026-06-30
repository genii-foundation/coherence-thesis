import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ManuscriptNavigation } from "@/components/ManuscriptNavigation";
import { catalog, manuscriptsNavigation } from "@/lib/manuscript-data";

export const metadata: Metadata = {
  title: "Manuscripts",
  description: "All published volumes of The Coherence Thesis.",
};

export default function ManuscriptsPage() {
  const navigation = manuscriptsNavigation();

  return (
    <div className="page-frame">
      <header className="page-heading">
        <p className="eyebrow">The complete body</p>
        <h1>Manuscripts</h1>
        <p>
          Nine complementary volumes, indexed as independent manuscripts and connected
          through one reader.
        </p>
      </header>
      <section className="volume-grid" aria-label="Published manuscripts">
        {catalog.volumes.map((volume) => (
          <Link key={volume.volumeId} href={volume.href} className="volume-card">
            <Image
              src={volume.coverImage}
              alt={volume.coverAlt}
              width={512}
              height={768}
              sizes="(max-width: 720px) 42vw, 180px"
            />
            <span>Volume {volume.numberLabel}</span>
            <strong>{volume.title}</strong>
            <small>{volume.subtitle}</small>
            <em>
              {volume.wordCount.toLocaleString()} words, {volume.parts.length} parts
            </em>
          </Link>
        ))}
      </section>
      <ManuscriptNavigation
        previous={navigation.previous}
        parent={navigation.parent}
        next={navigation.next}
      />
    </div>
  );
}
