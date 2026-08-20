import type {
  PublisherNextReaderStateBootstrap,
  ResolvedPublisherNextReaderStateBootstrap,
} from "@genii-foundation/publisher-next/server";

const READER_STATE_BOOTSTRAP_SOURCE = String.raw`
const report = (copied, refused) => ({
  schemaVersion: "1.0",
  copied,
  refused,
});
const refusePreferences = () => report([], ["preferences"]);
try {
  const targetKey = context.targetStorageKeys.preferences;
  const existingTarget = localStorage.getItem(targetKey);
  if (existingTarget !== null && existingTarget !== "") {
    return report([], []);
  }

  const legacyKey = "coherence-reader-preferences-v1";
  const legacy = localStorage.getItem(legacyKey);
  if (legacy === null || legacy === "") {
    return report([], []);
  }

  const maximumBytes = 16384;
  if (typeof legacy !== "string" || legacy.length > maximumBytes) {
    return refusePreferences();
  }
  let byteLength = 0;
  for (let index = 0; index < legacy.length; index += 1) {
    const code = legacy.charCodeAt(index);
    if (code <= 127) {
      byteLength += 1;
    } else if (code <= 2047) {
      byteLength += 2;
    } else if (
      code >= 55296 &&
      code <= 56319 &&
      index + 1 < legacy.length &&
      legacy.charCodeAt(index + 1) >= 56320 &&
      legacy.charCodeAt(index + 1) <= 57343
    ) {
      byteLength += 4;
      index += 1;
    } else {
      byteLength += 3;
    }
    if (byteLength > maximumBytes) {
      return refusePreferences();
    }
  }

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
    preferences.schemaVersion !== 2 ||
    preferences.fontSize !== 115 ||
    preferences.fontFamily !== "newsreader" ||
    preferences.theme !== "black" ||
    preferences.animations !== "balanced" ||
    preferences.highlights !== "off" ||
    preferences.focus !== "strong"
  ) {
    return refusePreferences();
  }

  const translated =
    '{"schemaVersion":1,"fontScale":115,"fontFamilyId":"newsreader","colorScheme":"black","motion":"system","highlights":false,"focus":"strong"}';
  localStorage.setItem(targetKey, translated);
  return report(["preferences"], []);
} catch {
  return refusePreferences();
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
    version: "0.1.0",
    rendererCompatibility: ">=0.1.0-alpha.0 <0.2.0",
    config: Object.freeze({}),
    implementation,
  });
