import type {
  PublisherNextReaderStateBootstrap,
  ResolvedPublisherNextReaderStateBootstrap,
} from "@genii-foundation/publisher-next/server";

const READER_STATE_BOOTSTRAP_SOURCE = String.raw`
const report = (copied, refused) => ({ schemaVersion: "1.0", copied, refused });
const copied = [];
const refused = [];
const hasValue = (key) => {
  const value = localStorage.getItem(key);
  return value !== null && value !== "";
};
const targetIsEmpty = (key) => {
  const value = localStorage.getItem(key);
  return value === null || value === "";
};
const hasAnyValue = (keys) => keys.some(hasValue);
const refuseWhenLegacyExists = (label, targetKey, legacyKeys) => {
  if (targetIsEmpty(targetKey) && hasAnyValue(legacyKeys)) refused.push(label);
};
const utf8ByteLengthWithin = (value, maximumBytes) => {
  if (typeof value !== "string" || value.length > maximumBytes) return false;
  let byteLength = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 127) {
      byteLength += 1;
    } else if (code <= 2047) {
      byteLength += 2;
    } else if (
      code >= 55296 &&
      code <= 56319 &&
      index + 1 < value.length &&
      value.charCodeAt(index + 1) >= 56320 &&
      value.charCodeAt(index + 1) <= 57343
    ) {
      byteLength += 4;
      index += 1;
    } else {
      byteLength += 3;
    }
    if (byteLength > maximumBytes) return false;
  }
  return true;
};
const translatePreferences = (legacy) => {
  if (!utf8ByteLengthWithin(legacy, 16384)) return null;
  const preferences = JSON.parse(legacy);
  const expectedKeys = [
    "schemaVersion",
    "fontSize",
    "fontFamily",
    "theme",
    "animations",
    "highlights",
    "focus",
  ];
  if (
    preferences === null ||
    typeof preferences !== "object" ||
    Array.isArray(preferences) ||
    Object.getPrototypeOf(preferences) !== Object.prototype ||
    Reflect.ownKeys(preferences).length !== expectedKeys.length ||
    !expectedKeys.every((key) =>
      Object.prototype.hasOwnProperty.call(preferences, key),
    ) ||
    (preferences.schemaVersion !== 1 && preferences.schemaVersion !== 2)
  ) {
    return null;
  }
  const fontScales = [85, 90, 95, 100, 105, 110, 115, 120, 125];
  if (!fontScales.includes(preferences.fontSize)) return null;
  const fontAliases = {
    baskerville: "source-serif",
    charter: "newsreader",
    georgia: "source-serif",
    iowan: "literata",
    palatino: "cormorant",
  };
  const fontFamilies = [
    "literata",
    "source-serif",
    "newsreader",
    "cormorant",
    "fraunces",
  ];
  const fontFamilyId = fontFamilies.includes(preferences.fontFamily)
    ? preferences.fontFamily
    : fontAliases[preferences.fontFamily];
  if (typeof fontFamilyId !== "string") return null;
  if (!["light", "dark", "black"].includes(preferences.theme)) return null;
  if (!["none", "balanced"].includes(preferences.animations)) return null;
  if (!["off", "on"].includes(preferences.highlights)) return null;
  if (!["none", "light", "normal", "strong"].includes(preferences.focus)) {
    return null;
  }
  return JSON.stringify({
    schemaVersion: 1,
    fontScale: preferences.fontSize,
    fontFamilyId,
    colorScheme: preferences.theme,
    motion: preferences.animations === "none" ? "reduced" : "system",
    highlights:
      preferences.schemaVersion === 1 ? true : preferences.highlights === "on",
    focus: preferences.focus,
  });
};
try {
  refuseWhenLegacyExists(
    "progress",
    context.targetStorageKeys.progress,
    ["coherence-reader-progress-v2", "coherence-reader-progress-v1"],
  );
  refuseWhenLegacyExists(
    "bookmarks",
    context.targetStorageKeys.bookmarks,
    ["coherence-reader-bookmarks-v2", "coherence-reader-bookmarks-v1"],
  );
  refuseWhenLegacyExists(
    "sync-consent",
    context.targetStorageKeys.syncConsent,
    ["coherence-reader-sync-consent-v1"],
  );
  refuseWhenLegacyExists(
    "engagement",
    context.targetStorageKeys.engagement,
    ["coherence-reader-events-v1"],
  );
  refuseWhenLegacyExists(
    "narration-preferences",
    context.targetStorageKeys.narrationPreferences,
    [
      "coherence-audio-voice-v3",
      "coherence-audio-voice-v2",
      "coherence-audio-voice-v1",
    ],
  );
  if (hasValue("coherence-reader-last-synced-at-v1")) {
    refused.push("last-sync-display");
  }

  const targetKey = context.targetStorageKeys.preferences;
  if (targetIsEmpty(targetKey)) {
    const legacyKey = "coherence-reader-preferences-v1";
    const legacy = localStorage.getItem(legacyKey);
    if (legacy !== null && legacy !== "") {
      let translated = null;
      try {
        translated = translatePreferences(legacy);
      } catch {}
      if (translated === null) {
        refused.push("preferences");
      } else {
        localStorage.setItem(targetKey, translated);
        copied.push("preferences");
      }
    }
  }
  return report(copied, refused);
} catch {
  return report([], ["bootstrap"]);
}
`;

const implementation: PublisherNextReaderStateBootstrap = Object.freeze({
  kind: "genii.publisher.next-reader-state-bootstrap",
  apiVersion: "1.1",
  configure: () => ({
    valid: true,
    value: Object.freeze({
      createSource: () => ({
        valid: true,
        value: READER_STATE_BOOTSTRAP_SOURCE,
        diagnostics: [],
      }),
    }),
    diagnostics: [],
  }),
});

export const coherenceReaderStateBootstrap: ResolvedPublisherNextReaderStateBootstrap =
  Object.freeze({
    package: "coherence-thesis",
    version: "0.2.0",
    rendererCompatibility: ">=0.1.0-alpha.0 <0.2.0",
    config: Object.freeze({}),
    implementation,
  });
