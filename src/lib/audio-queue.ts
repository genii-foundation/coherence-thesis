export type AudioQueueItem = {
  sectionId: string;
  title: string;
  text: string;
  audioVersionId: string;
};

export type AudioVoicePreference = {
  voiceURI: string | null;
  rate: number;
  pitch: number;
};

export const defaultVoicePreference: AudioVoicePreference = {
  voiceURI: null,
  rate: 1,
  pitch: 1,
};

export function queueFromSections(
  sections: readonly AudioQueueItem[],
): AudioQueueItem[] {
  return sections.map((section) => ({
    sectionId: section.sectionId,
    title: section.title,
    text: section.text,
    audioVersionId: section.audioVersionId,
  }));
}
