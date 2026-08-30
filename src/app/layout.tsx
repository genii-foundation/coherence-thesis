import type { Metadata, Viewport } from "next";
import {
  Cormorant_Garamond,
  Fraunces,
  Literata,
  Newsreader,
  Source_Serif_4,
} from "next/font/google";
import { CoherenceReaderPrepaint } from "@/components/CoherenceSiteFrame";
import { defaultReaderThemeColor } from "@/lib/reader-preferences";
import { siteOrigin } from "@/lib/site-url";
import { loadCoherencePublisherPreviewApplication } from "@/publisher/preview-mode";
import "@genii-foundation/publisher-next/styles.css";
import "./globals.css";

const literata = Literata({
  axes: ["opsz"],
  display: "swap",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-literata",
  weight: "variable",
});

const sourceSerif = Source_Serif_4({
  axes: ["opsz"],
  display: "swap",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-source-serif",
  weight: "variable",
});

const newsreader = Newsreader({
  axes: ["opsz"],
  display: "swap",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-newsreader",
  weight: "variable",
});

const cormorant = Cormorant_Garamond({
  display: "swap",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-cormorant",
  weight: "variable",
});

const fraunces = Fraunces({
  axes: ["opsz"],
  display: "swap",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: "variable",
});

const readerFontVariables = [
  literata.variable,
  sourceSerif.variable,
  newsreader.variable,
  cormorant.variable,
  fraunces.variable,
].join(" ");

// A dedicated 1200x630 optimized share image. The full-resolution hero PNG is
// 2.4 MB and several preview crawlers reject or degrade images that large.
const shareImage = {
  url: "/share/coherence-thesis-og.jpg",
  width: 1200,
  height: 630,
  alt: "The Coherence Thesis.",
  type: "image/jpeg",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  colorScheme: "light",
  themeColor: defaultReaderThemeColor,
};

export const metadata: Metadata = {
  metadataBase: siteOrigin,
  applicationName: "The Coherence Thesis",
  title: {
    default: "The Coherence Thesis",
    template: "%s | The Coherence Thesis",
  },
  description:
    "A living manuscript body on interpersonal coherence and thriving future societies.",
  authors: [{ name: "GENII Foundation", url: "https://genii.foundation" }],
  creator: "GENII Foundation",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "The Coherence Thesis",
  },
  openGraph: {
    title: "The Coherence Thesis",
    description:
      "A living manuscript body on interpersonal coherence and thriving future societies.",
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publisherApplication =
    await loadCoherencePublisherPreviewApplication();
  return (
    <html
      lang="en"
      className={readerFontVariables}
      data-scroll-behavior="smooth"
      data-reader-animations="balanced"
      data-reader-highlights="on"
      data-reader-focus="none"
      suppressHydrationWarning
    >
      <head>
        {publisherApplication ? (
          <publisherApplication.ReaderPrepaint />
        ) : (
          <CoherenceReaderPrepaint />
        )}
        {/* The toolbar menus and breadcrumbs are client islands that do nothing
            without JavaScript. Hide them for no-JS readers rather than present
            inert, focusable controls (A11Y-06); the prose and prev/up/next links
            still work. */}
        <noscript>
          <style>{`.site-nav, .breadcrumb-trail, .reader-heading-link-button { display: none !important; }`}</style>
        </noscript>
      </head>
      <body>{children}</body>
    </html>
  );
}
