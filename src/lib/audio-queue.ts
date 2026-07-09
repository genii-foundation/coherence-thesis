import { clipVoicePreferenceId } from "@/lib/audio-manifest";

export type AudioQueueItem = {
  sectionId: string;
  title: string;
  text: string;
  audioVersionId: string;
  href?: string;
  chapterHref?: string;
  readerHref?: string;
};

export type AudioVoicePreference = {
  voiceURI: string | null;
  rate: number;
  pitch: number;
  useSystemVoice?: boolean;
};

export const defaultVoicePreference: AudioVoicePreference = {
  voiceURI: clipVoicePreferenceId("default"),
  rate: 1,
  pitch: 1,
};
