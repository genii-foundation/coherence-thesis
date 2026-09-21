export const audioNavigateAndPlayEventName =
  "coherence:audio-navigate-and-play";
export const audioStartFromWordEventName = "coherence:audio-start-word";

export type AudioNavigateAndPlayEventDetail = {
  sectionId: string;
  href: string;
};

export type AudioWordPlaybackIdentity = Readonly<{
  audioVersionId: string;
  contentHash: string;
}>;

export type AudioStartFromWordEventDetail = Readonly<{
  charIndex: number;
  queueIdentity?: AudioWordPlaybackIdentity;
  sectionId: string;
  wordId: string;
}>;

export function audioStartFromWordMatchesSection(
  detail: AudioStartFromWordEventDetail,
  section: Readonly<{
    audioVersionId: string;
    contentHash: string;
  }>,
): boolean {
  if (!Object.prototype.hasOwnProperty.call(detail, "queueIdentity")) {
    return true;
  }
  try {
    const identity = detail.queueIdentity;
    if (
      identity === null ||
      typeof identity !== "object" ||
      Array.isArray(identity) ||
      Reflect.ownKeys(identity).sort().join("\u0000") !==
        "audioVersionId\u0000contentHash" ||
      typeof identity.audioVersionId !== "string" ||
      typeof identity.contentHash !== "string" ||
      !Number.isSafeInteger(detail.charIndex) ||
      detail.charIndex < 0 ||
      typeof detail.wordId !== "string" ||
      detail.wordId.length === 0
    ) return false;
    return identity.audioVersionId === section.audioVersionId &&
      identity.contentHash === section.contentHash;
  } catch {
    return false;
  }
}

export function requestAudioNavigation(
  detail: AudioNavigateAndPlayEventDetail,
): boolean {
  const event = new CustomEvent<AudioNavigateAndPlayEventDetail>(
    audioNavigateAndPlayEventName,
    {
      cancelable: true,
      detail,
    },
  );
  window.dispatchEvent(event);
  return event.defaultPrevented;
}
