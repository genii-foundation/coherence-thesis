import type { Metadata, Viewport } from "next";
import { SiteShell } from "@/components/SiteShell";
import {
  defaultReaderThemeColor,
  readerFontOptions,
  readerFontSizeMax,
  readerFontSizeMin,
  readerPreferencesStorageKey,
  readerThemeColorByTheme,
} from "@/lib/reader-preferences";
import { siteOrigin } from "@/lib/site-url";
import "./globals.css";

// A dedicated 1200x630 optimized share image. The full-resolution hero PNG is
// 2.4 MB and several preview crawlers reject or degrade images that large.
const shareImage = {
  url: "/share/coherence-thesis-og.jpg",
  width: 1200,
  height: 630,
  alt: "The Coherence Thesis.",
  type: "image/jpeg",
};

// Runs before first paint so a reader's saved theme and font scale are applied
// without the bright-default flash React hydration would otherwise cause. Built
// from the shared preference constants so it cannot drift from applyReaderPreferences.
const fontStacks = Object.fromEntries(
  readerFontOptions.map((option) => [option.id, option.stack]),
);
const preferencesBootstrap = `(function(){try{var K=${JSON.stringify(
  readerPreferencesStorageKey,
)},TC=${JSON.stringify(readerThemeColorByTheme)},FS=${JSON.stringify(
  fontStacks,
)},MIN=${readerFontSizeMin},MAX=${readerFontSizeMax};var raw=localStorage.getItem(K);if(!raw)return;var p=JSON.parse(raw),r=document.documentElement;if(p&&TC[p.theme]){r.dataset.readerTheme=p.theme;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',TC[p.theme]);}if(p&&typeof p.fontSize==='number'&&p.fontSize>=MIN&&p.fontSize<=MAX){r.style.setProperty('--reader-font-scale',(p.fontSize/100).toString());r.style.setProperty('--reader-font-scale-percent',p.fontSize+'%');}if(p&&FS[p.fontFamily]){r.style.setProperty('--font-body',FS[p.fontFamily]);r.style.setProperty('--font-display',FS[p.fontFamily]);r.style.setProperty('--font-ui',FS[p.fontFamily]);}}catch(e){}})();`;

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
        <script
          dangerouslySetInnerHTML={{ __html: preferencesBootstrap }}
          suppressHydrationWarning
        />
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
