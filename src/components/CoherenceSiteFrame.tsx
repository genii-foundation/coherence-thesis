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
import { coherencePublisherEmbeddedSchemeByTheme } from "@/publisher/embedded-reader-appearance";
import { isCoherencePublisherPreviewEnabled } from "@/publisher/preview-mode";
import type { OfflineAudioRuntimeMode } from "@/lib/audio-offline-cache";

const sha256Identity = /^sha256:[0-9a-f]{64}$/u;

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
  coherencePublisherEmbeddedSchemeByTheme,
)},FS=${JSON.stringify(
  fontStacks,
)},FA=${JSON.stringify(
  legacyFontAliases,
)},AO=${JSON.stringify(readerAnimationOptions)},HO=${JSON.stringify(
  readerHighlightOptions,
)},FO=${JSON.stringify(readerFocusOptions)},PV=${readerPreferencesSchemaVersion},MIN=${readerFontSizeMin},MAX=${readerFontSizeMax},STEP=${readerFontSizeStep};var raw=localStorage.getItem(K);if(!raw)return;var p=JSON.parse(raw),r=document.documentElement;if(p&&TO.indexOf(p.theme)!==-1){r.dataset.readerTheme=p.theme;r.dataset.publisherReaderScheme=PA[p.theme];var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',TC[p.theme]);}if(p&&typeof p.fontSize==='number'&&p.fontSize>=MIN&&p.fontSize<=MAX&&(p.fontSize-MIN)%STEP===0){r.style.setProperty('--reader-font-scale',(p.fontSize/100).toString());r.style.setProperty('--reader-font-scale-percent',p.fontSize+'%');}var fid=p&&typeof p.fontFamily==='string'?p.fontFamily:'';var stack=FS[fid]||FS[FA[fid]];if(stack){r.style.setProperty('--font-body',stack);r.style.setProperty('--font-display',stack);r.style.setProperty('--font-ui',stack);}if(p&&AO.indexOf(p.animations)!==-1){r.dataset.readerAnimations=p.animations;}if(p&&p.schemaVersion===PV&&HO.indexOf(p.highlights)!==-1){r.dataset.readerHighlights=p.highlights;}if(p&&FO.indexOf(p.focus)!==-1){r.dataset.readerFocus=p.focus;}}catch(e){}})();`;

export function CoherenceReaderPrepaint() {
  return (
    <script
      dangerouslySetInnerHTML={{ __html: preferencesBootstrap }}
      data-coherence-reader-prepaint=""
      suppressHydrationWarning
    />
  );
}

// Native playback belongs to the persistent root, not a replaceable route
// segment. The experimental Publisher frame still owns route-bound authority.
export function CoherenceRootSiteFrame({ children }: { children: ReactNode }) {
  if (isCoherencePublisherPreviewEnabled()) return <>{children}</>;
  return (
    <SiteShell offlineRuntimeMode={{ kind: "coherence-reader" }}>
      {children}
    </SiteShell>
  );
}

export function CoherenceSiteFrame({
  children,
  publisherOfflineAuthorityBuildId,
}: {
  children: ReactNode;
  publisherOfflineAuthorityBuildId?: string | null;
}) {
  if (!isCoherencePublisherPreviewEnabled()) return <>{children}</>;
  const offlineRuntimeMode: OfflineAudioRuntimeMode =
    typeof publisherOfflineAuthorityBuildId === "string" &&
      sha256Identity.test(publisherOfflineAuthorityBuildId)
      ? Object.freeze({
          buildId: publisherOfflineAuthorityBuildId,
          kind: "publisher-embedded" as const,
        })
      : isCoherencePublisherPreviewEnabled()
        ? Object.freeze({ kind: "unavailable" as const })
        : Object.freeze({ kind: "coherence-reader" as const });
  return (
    <SiteShell offlineRuntimeMode={offlineRuntimeMode}>{children}</SiteShell>
  );
}
