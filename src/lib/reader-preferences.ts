export const readerPreferencesStorageKey = "coherence-reader-preferences-v1";
export const readerPreferencesSchemaVersion = 2;

export const readerFontSizeMin = 85;
export const readerFontSizeMax = 125;
export const readerFontSizeStep = 5;

export const readerFocusOptions = [
  "none",
  "light",
  "normal",
  "strong",
] as const;
export type ReaderFocus = (typeof readerFocusOptions)[number];

export const readerThemeOptions = [
  "textured",
  "light",
  "dark",
  "black",
] as const;
export type ReaderTheme = (typeof readerThemeOptions)[number];

export const readerAnimationOptions = ["none", "balanced"] as const;
export type ReaderAnimations = (typeof readerAnimationOptions)[number];

export const readerHighlightOptions = ["off", "on"] as const;
export type ReaderHighlights = (typeof readerHighlightOptions)[number];

export const readerThemeColorByTheme: Record<ReaderTheme, string> = {
  textured: "#f4ead7",
  light: "#fffefa",
  dark: "#11100e",
  black: "#000000",
};

export const readerFontOptions = [
  {
    id: "literata",
    label: "Literata",
    stack: "var(--font-literata), Georgia, serif",
  },
  {
    id: "source-serif",
    label: "Source Serif 4",
    stack: "var(--font-source-serif), Georgia, serif",
  },
  {
    id: "newsreader",
    label: "Newsreader",
    stack: "var(--font-newsreader), Georgia, serif",
  },
  {
    id: "cormorant",
    label: "Cormorant Garamond",
    stack: "var(--font-cormorant), Georgia, serif",
  },
  {
    id: "fraunces",
    label: "Fraunces",
    stack: "var(--font-fraunces), Georgia, serif",
  },
] as const;

export type ReaderFontId = (typeof readerFontOptions)[number]["id"];

const legacyReaderFontAliases: Record<string, ReaderFontId> = {
  baskerville: "source-serif",
  charter: "newsreader",
  georgia: "source-serif",
  iowan: "literata",
  palatino: "cormorant",
};

export type ReaderPreferences = {
  fontSize: number;
  fontFamily: ReaderFontId;
  theme: ReaderTheme;
  animations: ReaderAnimations;
  highlights: ReaderHighlights;
  focus: ReaderFocus;
};

export const defaultReaderPreferences: ReaderPreferences = {
  fontSize: 100,
  fontFamily: "literata",
  theme: "textured",
  animations: "balanced",
  highlights: "on",
  focus: "none",
};

export const defaultReaderThemeColor =
  readerThemeColorByTheme[defaultReaderPreferences.theme];

function updateDocumentThemeColor(theme: ReaderTheme): void {
  if (typeof document === "undefined") return;

  const themeColor = readerThemeColorByTheme[theme];
  let themeMeta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );

  if (!themeMeta) {
    themeMeta = document.createElement("meta");
    themeMeta.name = "theme-color";
    document.head.appendChild(themeMeta);
  }

  themeMeta.content = themeColor;
}

export function fontOptionById(fontFamily: ReaderFontId) {
  return (
    readerFontOptions.find((fontOption) => fontOption.id === fontFamily) ??
    readerFontOptions[0]
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseFontSize(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultReaderPreferences.fontSize;
  }

  if (value < readerFontSizeMin || value > readerFontSizeMax) {
    return defaultReaderPreferences.fontSize;
  }

  if ((value - readerFontSizeMin) % readerFontSizeStep !== 0) {
    return defaultReaderPreferences.fontSize;
  }

  return value;
}

function parseFontFamily(value: unknown): ReaderFontId {
  if (
    typeof value === "string" &&
    readerFontOptions.some((fontOption) => fontOption.id === value)
  ) {
    return value as ReaderFontId;
  }

  if (typeof value === "string" && legacyReaderFontAliases[value]) {
    return legacyReaderFontAliases[value];
  }

  return defaultReaderPreferences.fontFamily;
}

function parseTheme(value: unknown): ReaderTheme {
  if (
    typeof value === "string" &&
    readerThemeOptions.includes(value as ReaderTheme)
  ) {
    return value as ReaderTheme;
  }

  return defaultReaderPreferences.theme;
}

function parseAnimations(value: unknown): ReaderAnimations {
  if (
    typeof value === "string" &&
    readerAnimationOptions.includes(value as ReaderAnimations)
  ) {
    return value as ReaderAnimations;
  }

  return defaultReaderPreferences.animations;
}

function parseHighlights(value: unknown): ReaderHighlights {
  if (
    typeof value === "string" &&
    readerHighlightOptions.includes(value as ReaderHighlights)
  ) {
    return value as ReaderHighlights;
  }

  return defaultReaderPreferences.highlights;
}

function parseFocus(value: unknown): ReaderFocus {
  if (
    typeof value === "string" &&
    readerFocusOptions.includes(value as ReaderFocus)
  ) {
    return value as ReaderFocus;
  }

  return defaultReaderPreferences.focus;
}

export function parseReaderPreferences(raw: string | null): ReaderPreferences {
  if (!raw) return defaultReaderPreferences;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return defaultReaderPreferences;

    const storedSchemaIsCurrent =
      parsed.schemaVersion === readerPreferencesSchemaVersion;

    return {
      fontSize: parseFontSize(parsed.fontSize),
      fontFamily: parseFontFamily(parsed.fontFamily),
      theme: parseTheme(parsed.theme),
      animations: parseAnimations(parsed.animations),
      // Version 1 wrote "off" whether the reader chose it or not. Treat that
      // legacy field as unset so the new visible default reaches existing
      // browsers. Version 2 preserves an intentional Hidden choice.
      highlights: storedSchemaIsCurrent
        ? parseHighlights(parsed.highlights)
        : defaultReaderPreferences.highlights,
      focus: parseFocus(parsed.focus),
    };
  } catch {
    return defaultReaderPreferences;
  }
}

export function serializeReaderPreferences(
  preferences: ReaderPreferences,
): string {
  return JSON.stringify({
    ...preferences,
    schemaVersion: readerPreferencesSchemaVersion,
  });
}

export function applyReaderPreferences(
  preferences: ReaderPreferences,
  root: HTMLElement,
): void {
  const fontStack = fontOptionById(preferences.fontFamily).stack;

  root.dataset.readerTheme = preferences.theme;
  root.dataset.readerAnimations = preferences.animations;
  root.dataset.readerHighlights = preferences.highlights;
  root.dataset.readerFocus = preferences.focus;
  root.style.setProperty(
    "--reader-font-scale",
    (preferences.fontSize / 100).toString(),
  );
  root.style.setProperty(
    "--reader-font-scale-percent",
    `${preferences.fontSize}%`,
  );
  root.style.setProperty("--font-body", fontStack);
  root.style.setProperty("--font-display", fontStack);
  root.style.setProperty("--font-ui", fontStack);
  updateDocumentThemeColor(preferences.theme);
}
