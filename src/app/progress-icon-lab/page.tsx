import type { Metadata } from "next";
import { ProgressIconLab } from "./ProgressIconLab";

export const metadata: Metadata = {
  title: "Progress Icon Lab",
  description:
    "A private comparison surface for refining the reader toolbar progress icons.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ProgressIconLabPage() {
  return <ProgressIconLab />;
}
