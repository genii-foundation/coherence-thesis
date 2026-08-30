import type { ReactNode } from "react";
import { SiteShell } from "@/components/SiteShell";
import {
  readerAnimationOptions,
  readerFocusOptions,
  readerHighlightOptions,
  readerFontOptions,
  readerFontSizeMax,
  readerFontSizeMin,
  readerFontSizeStep,
  readerPreferencesSchemaVersion,
  readerPreferencesStorageKey,
  readerThemeOptions,
  readerThemeColorByTheme,
} from "@/lib/reader-preferences";
import {
  coherencePublisherEmbeddedAppearanceByTheme,
  coherencePublisherEmbeddedCanvasProperty,
} from "@/publisher/embedded-reader-appearance";

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
)},TO=${JSON.stringify(readerThemeOptions)},TC=${JSON.stringify(readerThemeColorByTheme)},PA=${JSON.stringify(
  coherencePublisherEmbeddedAppearanceByTheme,
)},PC=${JSON.stringify(
  coherencePublisherEmbeddedCanvasProperty,
)},FS=${JSON.stringify(
  fontStacks,
)},FA=${JSON.stringify(
  legacyFontAliases,
)},AO=${JSON.stringify(readerAnimationOptions)},HO=${JSON.stringify(
  readerHighlightOptions,
)},FO=${JSON.stringify(readerFocusOptions)},PV=${readerPreferencesSchemaVersion},MIN=${readerFontSizeMin},MAX=${readerFontSizeMax},STEP=${readerFontSizeStep};var raw=localStorage.getItem(K);if(!raw)return;var p=JSON.parse(raw),r=document.documentElement;if(p&&TO.indexOf(p.theme)!==-1){r.dataset.readerTheme=p.theme;var pa=PA[p.theme];r.dataset.publisherReaderScheme=pa.scheme;r.style.setProperty(PC,pa.canvas);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',TC[p.theme]);}if(p&&typeof p.fontSize==='number'&&p.fontSize>=MIN&&p.fontSize<=MAX&&(p.fontSize-MIN)%STEP===0){r.style.setProperty('--reader-font-scale',(p.fontSize/100).toString());r.style.setProperty('--reader-font-scale-percent',p.fontSize+'%');}var fid=p&&typeof p.fontFamily==='string'?p.fontFamily:'';var stack=FS[fid]||FS[FA[fid]];if(stack){r.style.setProperty('--font-body',stack);r.style.setProperty('--font-display',stack);r.style.setProperty('--font-ui',stack);}if(p&&AO.indexOf(p.animations)!==-1){r.dataset.readerAnimations=p.animations;}if(p&&p.schemaVersion===PV&&HO.indexOf(p.highlights)!==-1){r.dataset.readerHighlights=p.highlights;}if(p&&FO.indexOf(p.focus)!==-1){r.dataset.readerFocus=p.focus;}}catch(e){}})();`;

export function CoherenceReaderPrepaint() {
  return (
    <script
      dangerouslySetInnerHTML={{ __html: preferencesBootstrap }}
      data-coherence-reader-prepaint=""
      suppressHydrationWarning
    />
  );
}

export function CoherenceSiteFrame({ children }: { children: ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
