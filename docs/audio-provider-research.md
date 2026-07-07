# Audio Provider Research And Implementation Strategy

Last researched: June 30, 2026.

This document summarizes the audio provider research for upgrading The Coherence Thesis reader from browser speech synthesis to high quality generated audio. It is written for implementation handoff.

## Executive Summary

The best production path is to precompute three approved voices at publish time, serve those clips as static audio, and keep browser speech synthesis as the free fallback. Live text to speech generation should stay limited to voice previews, experiments, and missing cached clips.

The current corpus contains 566 sections, 198,717 words, 904 estimated reading minutes, 1,246,100 plain text characters, and 1,252,115 UTF-8 bytes. With three approved voices, the full generation surface is about 3,738,300 billed characters, or 3,756,345 UTF-8 bytes for providers that bill bytes.

ElevenLabs remains the safest first choice if the highest priority is personal voice cloning with two or more hours of source audio. Its Professional Voice Cloning workflow is mature, its voices are strong, and its API supports serving cloned voices by voice ID. The cost problem is only serious if every listener triggers fresh real-time generation. With precomputed audio, three full high quality ElevenLabs voices are expected to cost about $374 per complete corpus version. The lower latency ElevenLabs Flash or Turbo models would cost about $187 for all three voices.

Cheaper providers are worth sampling, especially Fish Audio, Cartesia, Inworld, Resemble AI, and Rime. None should replace ElevenLabs on price alone. The main decision should be made from sample clips across representative manuscript passages, not from pricing tables. As fake Alan Watts might have said while reading an invoice, the menu is not the meal, but it still tells you whether the restaurant intends to rob you.

## Current Reader State

The reader currently uses the browser `speechSynthesis` API in `src/components/AudioPlayerIsland.tsx`. Playback sections are loaded from `public/data/reader-sections.json` through `src/lib/reader-data.ts`, and queue entries are built in `src/lib/audio-queue.ts`.

The site is configured as a static export in `next.config.ts` with `output: "export"`. This means a client-only integration with a paid TTS API would expose API keys. A live streaming path would require a protected server route, edge function, worker, or a separate generation service. A precomputed static audio path fits the current deployment model.

## Cost Model

All estimates use the current corpus size:

| Metric | Value |
| --- | ---: |
| Sections | 566 |
| Words | 198,717 |
| Estimated reading time | 904 minutes |
| Plain text characters | 1,246,100 |
| UTF-8 bytes | 1,252,115 |
| Three voice generation surface | 3,738,300 characters |

### Three Approved Voices

| Provider or model path | Billing basis | Estimated cost for 3 full voices |
| --- | ---: | ---: |
| ElevenLabs Flash or Turbo | $0.05 per 1,000 characters | $186.92 |
| ElevenLabs Multilingual v2 or v3 | $0.10 per 1,000 characters | $373.83 |
| Fish Audio | $15 per 1M UTF-8 bytes | $56.35 |
| Google Neural2 | $16 per 1M characters | $59.81 |
| Google Chirp 3 HD | $30 per 1M characters | $112.15 |
| AWS Polly Neural | $16 per 1M characters | $59.81 |
| AWS Polly Generative | $30 per 1M characters | $112.15 |
| Azure Neural | $15 per 1M characters | $56.07 |
| Azure Neural HD | $22 per 1M characters | $82.24 |
| Deepgram Aura 1 | $15 per 1M characters | $56.07 |
| Deepgram Aura 2 | $30 per 1M characters | $112.15 |
| Rime Mist starter | $30 per 1M characters | $112.15 |
| Rime Arcana starter | $40 per 1M characters | $149.53 |
| Cartesia Sonic 3.5 | Startup plan plus overage, or per minute estimate | about $161 |
| Resemble AI | $0.0005 per generated second | about $81.36 |
| Unreal Speech discounted plan | 3M characters for $4.99, then plan dependent | about $15 or more |

Provider pricing changes quickly. Recheck before buying a paid plan.

### Why Live Generation Is The Wrong Default

If 100 people listen to the entire manuscript through live ElevenLabs generation, the billing surface is 124,610,000 characters. That is about $6,230.50 with Flash or Turbo, or $12,461.00 with Multilingual v2 or v3.

If the same corpus is precomputed once for three approved voices, the ElevenLabs cost is about $186.92 to $373.83. That difference is large enough to settle the architecture. Live generation is a feature for rare flexibility. It should not be the default playback path.

## Provider Findings

### ElevenLabs

ElevenLabs is the recommended first production provider for cloned author voices. It has strong text to speech quality, streaming APIs, voice IDs, history retrieval, and Professional Voice Cloning. The Professional Voice Cloning docs recommend at least 30 minutes of clean audio and say two or more hours improves similarity. That aligns with the preferred plan to record two hours or more for each approved voice.

Useful capabilities:

- High quality voice cloning for personal author voices.
- REST streaming and WebSocket surfaces.
- Voice IDs that can be referenced from generation scripts.
- History APIs that can retrieve generated audio.
- Strong enough quality that the first production trial should start here.

Cost notes:

- Flash and Turbo are about $0.05 per 1,000 characters.
- Multilingual v2 and v3 are about $0.10 per 1,000 characters.
- Three full corpus voices should cost about $187 to $374 per version.
- Live generation for repeated listeners is expensive.

Caching notes:

- ElevenLabs history retrieval is useful, but it is not shared provider-side cache billing.
- Their help docs say API requests are not free when regenerating the same text.
- We should treat every generation request as billable unless it is served from our own cache.

Sources:

- [ElevenLabs API pricing](https://elevenlabs.io/pricing/api)
- [ElevenLabs text to speech docs](https://elevenlabs.io/docs/overview/capabilities/text-to-speech)
- [ElevenLabs Professional Voice Cloning](https://elevenlabs.io/docs/eleven-creative/voices/voice-cloning/professional-voice-cloning)
- [ElevenLabs generation quota help](https://help.elevenlabs.io/hc/en-us/articles/13313274666769-Do-I-use-quota-on-every-generation)
- [ElevenLabs history audio API](https://elevenlabs.io/docs/api-reference/history/get-audio)

### Cartesia

Cartesia is a strong API and latency candidate. Its docs expose byte, SSE, and WebSocket text to speech APIs. Its pricing is credit based, with one credit equal to one character for Sonic text to speech. Cartesia says one minute of audio generation uses about 750 to 800 credits.

Useful capabilities:

- Byte stream, SSE, and WebSocket APIs.
- Sonic 3.5 text to speech.
- Voice cloning support.
- Good fit for live or lazy generation if quality passes samples.

Cost notes:

- Startup is $49 per month for 1.25M credits.
- Startup overage is listed at $45 per 1M credits.
- The current three voice corpus would use about 3.74M credits.
- Estimated Startup plus overage cost is about $161.
- Scale is $299 per month for 8M credits, which would cover this corpus with headroom.

Sources:

- [Cartesia pricing](https://cartesia.ai/pricing)
- [Cartesia TTS bytes API](https://docs.cartesia.ai/api-reference/tts/bytes)

### Fish Audio

Fish Audio is the cheapest serious candidate found. It bills TTS by millions of UTF-8 bytes and supports generated speech, stream with timestamps, and WebSocket TTS.

Useful capabilities:

- Low pricing for high volume generation.
- Streaming and WebSocket TTS.
- Voice cloning and voice library features.
- Good sample pack candidate.

Cost notes:

- TTS models are listed at $15 per 1M UTF-8 bytes.
- Three full voices for the current corpus should cost about $56.

Sources:

- [Fish Audio pricing and rate limits](https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits)

### OpenAI

OpenAI has a strong and simple text to speech API, including `gpt-4o-mini-tts`, streaming support, and built in voices. It is not the right first choice for this project because it does not offer a general custom voice cloning path for using two hours of the authors' voices.

Useful capabilities:

- Simple speech endpoint.
- Streaming output support.
- Good fallback for non-cloned voices.
- Reasonable pricing.

Cost notes:

- `tts-1` is listed at $15 per 1M characters.
- `tts-1-hd` is listed at $30 per 1M characters.
- `gpt-4o-mini-tts` uses audio token pricing in current docs.
- For a three voice precompute, older character priced models would be about $56 to $112.

Sources:

- [OpenAI text to speech guide](https://developers.openai.com/api/docs/guides/text-to-speech)
- [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)

### Google Cloud Text-to-Speech

Google is a reliable platform provider with a broad voice catalog. Chirp 3 HD is the quality tier worth sampling. Neural2 and WaveNet are cheaper, but less likely to beat dedicated voice cloning providers for author voice narration.

Useful capabilities:

- Chirp 3 HD voices.
- Neural2 and WaveNet tiers.
- Stable platform and broad locale support.
- Good infrastructure fit if Google Cloud is already in use.

Cost notes:

- Chirp 3 HD is $30 per 1M characters.
- Neural2 is $16 per 1M characters.
- WaveNet and Standard are $4 per 1M characters.
- Three voices with Chirp 3 HD should cost about $112.

Sources:

- [Google Cloud Text-to-Speech pricing](https://cloud.google.com/text-to-speech/pricing)
- [Google Cloud voice types](https://cloud.google.com/text-to-speech/docs/list-voices-and-types)

### AWS Polly

AWS Polly is reliable and mechanically simple. It supports synchronous byte streams and asynchronous S3 synthesis tasks. It is a strong operational fallback, but not the most compelling option for personal author voice clones.

Useful capabilities:

- `SynthesizeSpeech` returns a stream of bytes.
- `StartSpeechSynthesisTask` supports asynchronous generation to S3.
- Supports standard, neural, long form, and generative engines.
- AWS explicitly allows caching and replaying generated speech at no additional Polly cost.

Cost notes:

- Standard voices are $4 per 1M characters.
- Neural voices are $16 per 1M characters.
- Generative voices are $30 per 1M characters.
- Long Form voices are $100 per 1M characters.
- Three neural voices should cost about $60.
- Three generative voices should cost about $112.

Sources:

- [AWS Polly pricing](https://aws.amazon.com/polly/pricing/)
- [AWS Polly SynthesizeSpeech API](https://docs.aws.amazon.com/polly/latest/APIReference/API_SynthesizeSpeech.html)
- [AWS Polly StartSpeechSynthesisTask API](https://docs.aws.amazon.com/polly/latest/APIReference/API_StartSpeechSynthesisTask.html)

### Azure Speech

Azure Speech is a reliable platform provider with neural and Neural HD voices, streaming formats, and batch style options. It is cost effective, but it is not the top personal clone choice unless Azure custom voice quality wins a sample test.

Useful capabilities:

- Neural and Neural HD voices.
- REST synthesis supports audio returned in the response body.
- Long Audio API exists for longer material.
- Many streaming and nonstreaming output formats.

Cost notes:

- Neural is listed at $15 per 1M characters.
- Neural HD is listed at $22 per 1M characters in supported regions.
- Three Neural voices should cost about $56.
- Three Neural HD voices should cost about $82.

Sources:

- [Azure Speech pricing](https://azure.microsoft.com/en-us/pricing/details/speech/)
- [Azure text to speech REST API](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech)

### Deepgram Aura

Deepgram Aura is a solid API option, especially where TTS is part of a larger speech stack. It is not the strongest match for personal author voice cloning based on the current project requirement.

Useful capabilities:

- Aura 1 and Aura 2 TTS.
- Streaming oriented speech platform.
- Clear character based pricing.

Cost notes:

- Aura 1 is $0.015 per 1,000 characters.
- Aura 2 is $0.030 per 1,000 characters.
- Three voices should cost about $56 to $112.

Source:

- [Deepgram pricing](https://deepgram.com/pricing)

### Rime

Rime is a strong quality candidate for commercial voice experiences and advertises an open API. It should be sampled, but it does not obviously beat ElevenLabs for personal long form author narration.

Useful capabilities:

- Arcana and Mist voice models.
- Low latency claims.
- Voice catalog and custom voice options.
- Open API.

Cost notes:

- Starter pricing is listed around $40 per 1M characters for Arcana and $30 per 1M for Mist.
- Growth pricing is lower, around $30 per 1M for Arcana and $20 per 1M for Mist.
- Three voices on starter pricing should cost about $112 to $150.

Source:

- [Rime pricing](https://rime.ai/pricing)

### Resemble AI

Resemble AI is a voice cloning focused provider and should be part of the sample pack. Its billing is per generated second, which makes the current corpus easy to estimate from the 904 minute reading time.

Useful capabilities:

- Voice cloning oriented product.
- API usage.
- Useful for custom voice workflows where clone controls matter.

Cost notes:

- Public pricing found during research listed $0.0005 per generated second.
- Current corpus is about 54,240 seconds.
- Three voices should cost about $81.

Source:

- [Resemble AI pricing](https://www.resemble.ai/pricing)

### Unreal Speech

Unreal Speech is the cheapest option found, but it should be treated as a budget fallback until quality is heard directly. Its public page says it is powered by Kokoro TTS, offers streaming, and has very low character pricing.

Useful capabilities:

- Very low cost.
- Streaming.
- Long audio generation claims.
- Good for cost pressure tests.

Cost notes:

- The discounted plan found during research listed 3M characters for $4.99.
- Three voices for the current corpus would require more than one such bucket.
- Treat actual total as plan dependent and verify before relying on it.

Source:

- [Unreal Speech pricing](https://unrealspeech.com/pricing)

## Caching And Freshness

The core cache key should include:

```text
sectionId
contentHash
provider
model
voiceId
audioSettingsHash
format
```

This makes the audio cache self-invalidating. When manuscript text changes, `contentHash` changes, so the old audio no longer matches. The publishing pipeline can regenerate only changed section and voice combinations.

Recommended static paths:

```text
public/audio/manuscripts/{provider}/{model}/{voiceId}/{sectionId}-{contentHash}.{ext}
public/data/audio-manifest.json
```

The manifest should include section ID, content hash, provider, model, voice ID, format, duration when available, byte size, and public URL. The reader should load the manifest, prefer matching static audio, and fall back to browser speech synthesis when no clip exists.

Provider-side shared billing cache should not be assumed. The safe assumption is that every provider API generation request is billable unless our app serves a cached file. AWS explicitly says generated Polly speech can be cached and replayed at no additional Polly cost, which supports our own cache strategy. ElevenLabs history retrieval helps recover generated files, but it does not make repeated API generation free.

## Recommended Implementation

### Phase 1, Sample Pack

Generate a small sample set before choosing the provider or voices. Use the same three representative passages for each provider:

- A dense philosophical passage with long sentences.
- A lyrical or emotionally warm passage.
- A technical passage with terms such as Coherence, Providence, Bio-Consensus, Proof of Council, and Tao Yu.

Sample providers:

- ElevenLabs Professional Voice Clone with Multilingual v3 and Flash.
- Cartesia Sonic 3.5 with a cloned voice.
- Fish Audio cloned voice.
- Rime Arcana and Mist.
- Resemble AI cloned voice.
- Optional platform baselines from OpenAI, Google, AWS, and Azure.

Evaluate:

- Similarity to the source speaker.
- Long form listening fatigue over at least 10 minutes.
- Paragraph pacing.
- Pronunciation of project vocabulary.
- Emotional range without melodrama.
- Artifacts around punctuation, headings, and italicized phrases.
- Cost per full regeneration.

### Phase 2, Precomputed Production Path

Add a generation script and provider adapter layer. The script should:

- Read `src/generated/manuscripts/catalog.json`.
- Segment by existing section boundaries.
- Skip existing clips when `sectionId`, `contentHash`, voice, model, and settings match.
- Write audio files to `public/audio/manuscripts`.
- Write `public/data/audio-manifest.json`.
- Support a dry run mode to estimate characters, bytes, sections, voices, and expected cost.
- Support provider, model, voice, output format, and concurrency settings.
- Retry transient failures with conservative backoff.
- Never put API keys in browser code.

### Phase 3, Reader Integration

Update `AudioPlayerIsland` so it:

- Loads `audio-manifest.json`.
- Shows the three approved voices when matching audio exists.
- Uses `<audio>` playback for precomputed clips.
- Keeps browser `speechSynthesis` as fallback.
- Preserves play, pause, stop, route reset, and section queue behavior.
- Avoids blocking manuscript text when JavaScript is unavailable.

### Phase 4, Optional Lazy Generation

If alternate voices are needed later, add a protected generation service. It should:

- Accept only known `sectionId`, voice, model, and settings.
- Look up canonical text from generated catalog data.
- Check storage first.
- Generate only when the cache is missing.
- Write the generated file and manifest entry.
- Return the static URL.
- Rate limit requests and hide provider keys.

## Decision Record

The current product decision is:

- Three approved voices.
- Precompute as the production default.
- Use content hash based invalidation.
- Keep live generation out of the reader's default path.
- Start provider sampling with ElevenLabs because voice clone quality matters more than the small difference in one-time generation cost.
- Do not pick a cheaper provider without a direct sample comparison.

## Open Questions For The Next Implementer

- Which three people will record approved voices?
- Should all three voices use the same provider and model, or can one be a lower cost fallback?
- Should the site ship all three voices publicly, or should one be the default and the others stay behind a reader preference?
- Should generated audio files live in git, Vercel output, object storage, or a CDN backed bucket?
- What disclosure text should appear for cloned AI voices?
- Should audio generation happen locally before publish, in CI, or in a separate authenticated job?

## Practical Recommendation

Build the implementation so provider choice is replaceable, but run the first production trial with ElevenLabs Professional Voice Cloning. Record two or more clean hours for each approved voice, create sample packs, pick one model quality tier, precompute all three voices, and serve static section clips through a manifest.

That gives readers excellent voice quality, current manuscript audio through content hashes, predictable costs, and a sane path for future provider swaps.
