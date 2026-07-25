import type { Metadata, Viewport } from "next";
import {
  Cormorant_Garamond,
  Fraunces,
  Literata,
  Newsreader,
  Source_Serif_4,
} from "next/font/google";
import { SiteShell } from "@/components/SiteShell";
import {
  defaultReaderThemeColor,
  readerAnimationOptions,
  readerFontOptions,
  readerFontSizeMax,
  readerFontSizeMin,
  readerPreferencesStorageKey,
  readerThemeColorByTheme,
} from "@/lib/reader-preferences";
import { siteOrigin } from "@/lib/site-url";
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

// Runs before first paint so a reader's saved theme and font scale are applied
// without the bright-default flash React hydration would otherwise cause. Built
// from the shared preference constants so it cannot drift from applyReaderPreferences.
const fontStacks = Object.fromEntries(
  readerFontOptions.map((option) => [option.id, option.stack]),
);
const legacyFontAliases = {
  baskerville: "source-serif",
  charter: "newsreader",
  georgia: "source-serif",
  iowan: "literata",
  palatino: "cormorant",
};
const preferencesBootstrap = `(function(){try{var K=${JSON.stringify(
  readerPreferencesStorageKey,
)},TC=${JSON.stringify(readerThemeColorByTheme)},FS=${JSON.stringify(
  fontStacks,
)},FA=${JSON.stringify(
  legacyFontAliases,
)},AO=${JSON.stringify(readerAnimationOptions)},MIN=${readerFontSizeMin},MAX=${readerFontSizeMax};var raw=localStorage.getItem(K);if(!raw)return;var p=JSON.parse(raw),r=document.documentElement;if(p&&TC[p.theme]){r.dataset.readerTheme=p.theme;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',TC[p.theme]);}if(p&&typeof p.fontSize==='number'&&p.fontSize>=MIN&&p.fontSize<=MAX){r.style.setProperty('--reader-font-scale',(p.fontSize/100).toString());r.style.setProperty('--reader-font-scale-percent',p.fontSize+'%');}var fid=p&&typeof p.fontFamily==='string'?p.fontFamily:'';var stack=FS[fid]||FS[FA[fid]];if(stack){r.style.setProperty('--font-body',stack);r.style.setProperty('--font-display',stack);r.style.setProperty('--font-ui',stack);}if(p&&AO.indexOf(p.animations)!==-1){r.dataset.readerAnimations=p.animations;}}catch(e){}})();`;

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={readerFontVariables}
      data-scroll-behavior="smooth"
      data-reader-animations="balanced"
      suppressHydrationWarning
    >
      <head>
        {/* The toolbar menus and breadcrumbs are client islands that do nothing
            without JavaScript. Hide them for no-JS readers rather than present
            inert, focusable controls (A11Y-06); the prose and prev/up/next links
            still work. */}
        <noscript>
          <style>{`.site-nav, .breadcrumb-trail, .reader-heading-link-button { display: none !important; }`}</style>
        </noscript>
      </head>
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
