export const COHERENCE_PUBLISHER_AUDIO_WORD_AUTHORITY_SCHEMA_VERSION = "1.0";
export const COHERENCE_PUBLISHER_AUDIO_WORD_ROUTE_MODEL_SCHEMA_VERSION = 1;

export const coherencePublisherAudioWordRouteLimits = Object.freeze({
  maximumBytes: 32_768,
  maximumSections: 4,
  maximumWords: 1_200,
});

export type CoherencePublisherAudioWordRouteSection = Readonly<{
  bodyStartCharacter: number;
  bodyWordCount: number;
  profileText: string;
  queueIdentity: Readonly<{
    audioVersionId: string;
    contentHash: string;
  }>;
  sectionId: string;
  titleWordCount: number;
}>;

export type CoherencePublisherAudioWordRouteModel = Readonly<{
  authorityBuildId: string | null;
  schemaVersion: typeof COHERENCE_PUBLISHER_AUDIO_WORD_ROUTE_MODEL_SCHEMA_VERSION;
  sections: readonly CoherencePublisherAudioWordRouteSection[];
}>;

export const emptyCoherencePublisherAudioWordRouteModel:
  CoherencePublisherAudioWordRouteModel = Object.freeze({
    authorityBuildId: null,
    schemaVersion: COHERENCE_PUBLISHER_AUDIO_WORD_ROUTE_MODEL_SCHEMA_VERSION,
    sections: Object.freeze([]),
  });
