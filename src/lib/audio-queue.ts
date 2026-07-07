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
