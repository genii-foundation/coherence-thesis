import type { Metadata } from "next";
import BackgroundLabIsland from "@/components/BackgroundLabIsland";

export const metadata: Metadata = {
  title: "Background Lab",
  description:
    "A visual test page for organic background texture variations across common layout elements.",
};

export default function BackgroundLabPage() {
  return <BackgroundLabIsland />;
}
