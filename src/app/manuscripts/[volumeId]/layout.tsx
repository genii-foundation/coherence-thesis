import type { ReactNode } from "react";
import { CoherenceSiteFrame } from "@/components/CoherenceSiteFrame";

export default function PublisherManuscriptLayout({
  children,
}: {
  children: ReactNode;
}) {
  /* Publisher's provider currently activates its offline and narration
     surfaces together. Coherence keeps those live services until their data
     routes and worker ownership can move as one closed cutover. */
  return <CoherenceSiteFrame>{children}</CoherenceSiteFrame>;
}
