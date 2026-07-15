export const audioNavigateAndPlayEventName =
  "coherence:audio-navigate-and-play";

export type AudioNavigateAndPlayEventDetail = {
  sectionId: string;
  href: string;
};

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
