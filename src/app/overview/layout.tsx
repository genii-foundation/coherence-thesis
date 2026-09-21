import type { ReactNode } from "react";
import { CoherenceSiteFrame } from "@/components/CoherenceSiteFrame";

export default function OverviewLayout({ children }: { children: ReactNode }) {
  return <CoherenceSiteFrame>{children}</CoherenceSiteFrame>;
}
