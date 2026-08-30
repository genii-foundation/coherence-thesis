import type { ReactNode } from "react";
import { CoherenceSiteFrame } from "@/components/CoherenceSiteFrame";

export default function ProgressIconLabLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <CoherenceSiteFrame>{children}</CoherenceSiteFrame>;
}
