import type { ReactNode } from "react";
import { CoherenceSiteFrame } from "@/components/CoherenceSiteFrame";
import { loadCoherencePublisherApplication } from "@/publisher/application";

export default async function PublisherManuscriptLayout({
  children,
}: {
  children: ReactNode;
}) {
  const application = await loadCoherencePublisherApplication();
  return (
    <>
      <application.ReaderPrepaint />
      {/* Publisher's provider currently activates its offline and narration
          surfaces together. Coherence keeps those live services until their
          data routes and worker ownership can move as one closed cutover. */}
      <CoherenceSiteFrame>{children}</CoherenceSiteFrame>
    </>
  );
}
