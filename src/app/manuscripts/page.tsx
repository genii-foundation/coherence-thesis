import type { Metadata } from "next";
import { ManuscriptCoverFlowIsland } from "@/components/ManuscriptCoverFlowIsland";
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
      <ManuscriptCoverFlowIsland volumes={catalog.volumes} />
      <ManuscriptNavigation
        previous={navigation.previous}
        parent={navigation.parent}
        next={navigation.next}
      />
    </div>
  );
}
