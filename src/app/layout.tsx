import type { Metadata, Viewport } from "next";
import { SiteShell } from "@/components/SiteShell";
import { defaultReaderThemeColor } from "@/lib/reader-preferences";
import "./globals.css";

const siteUrl = new URL("https://www.coherence-thesis.com");
const shareImage = {
  url: "/art/coherence-thesis-hero.png",
  width: 1024,
  height: 1536,
  alt: "The Coherence Thesis final hero artwork.",
  type: "image/png",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  colorScheme: "light",
  themeColor: defaultReaderThemeColor,
};

export const metadata: Metadata = {
  metadataBase: siteUrl,
  applicationName: "The Coherence Thesis",
  alternates: {
    canonical: "/",
  },
  title: {
    default: "The Coherence Thesis",
    template: "%s | The Coherence Thesis",
  },
  description:
    "A living manuscript body on interpersonal coherence and thriving future societies.",
  authors: [{ name: "Providence Collective" }],
  creator: "Providence Collective",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "The Coherence Thesis",
  },
  openGraph: {
    title: "The Coherence Thesis",
    description:
      "A living manuscript body on interpersonal coherence and thriving future societies.",
    url: "/",
    siteName: "The Coherence Thesis",
    type: "website",
    images: [shareImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Coherence Thesis",
    description:
      "A living manuscript body on interpersonal coherence and thriving future societies.",
    images: [shareImage],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
