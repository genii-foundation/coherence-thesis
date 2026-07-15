# Fish Audiobook Generation and Publication

## Decision

Use Fish Audio's timestamped SSE endpoint with one pinned narrator `reference_id` for the complete corpus. Do not generate a full run with the provider default voice. The first corpus run omitted `reference_id`, so Fish was free to choose or vary the voice across independent requests and section chunks.

The preferred narrator source is a private Fish voice model created from a licensed studio recording. Public Fish models are suitable for auditions, but they can change visibility or be removed. Confirm commercial rights before publishing a public model's output.

The selected narrator for the condensed 2026 corpus is [Calm Narrative Voice](https://fish.audio/m/31f5f64677c643c8ba3962c002177519/), reference ID `31f5f64677c643c8ba3962c002177519`. The production voice slot is `high-quality-1`, with display label `High Quality 1`. Every full run request must use that one pinned reference. A provider default voice is never permitted.

## Voice Audition

Generate the same four passages with every candidate voice:

1. A quiet, reflective passage with long sentences.
2. A dense technical passage containing abbreviations, dates, and numbers.
3. A passage with direct address and emotional intensity.
4. A short section with headings and abrupt paragraph transitions.

Evaluate each candidate for identity consistency, listener fatigue, consonant clarity, breath noise, sentence endings, pronunciation, emotional restraint, and pacing. Listen on headphones, laptop speakers, and a phone speaker. Select one narrator before any full run.

Useful public Fish benchmarks:

- [Male Narrator](https://fish.audio/en/m/efc2f5153a24463dbfe54acd93a145f8), reference ID `efc2f5153a24463dbfe54acd93a145f8`
- [Calm Narrator](https://fish.audio/m/645ac578f9804b39a3ba0e7ff61565ca/), reference ID `645ac578f9804b39a3ba0e7ff61565ca`
- [Calm Narrative Voice](https://fish.audio/en/m/31f5f64677c643c8ba3962c002177519), reference ID `31f5f64677c643c8ba3962c002177519`
- [Deep Authoritative Voice](https://fish.audio/m/429eb407cd5c4e8caebc5fbd994478e8/), reference ID `429eb407cd5c4e8caebc5fbd994478e8`

The first candidate is the strongest initial public benchmark because Fish currently presents it as an S2.1 Pro narrator voice with substantially more usage than the other candidates. It still needs a real manuscript audition. Deep voices often sound impressive for two minutes and exhausting after two hours.

## Generation Contract

The generator uses these defaults:

- Endpoint: `POST /v1/tts/stream/with-timestamp`
- Model: `s2.1-pro-free`
- Format: 48 kHz Opus at 64 kbps
- Latency: `normal`
- Fish chunk length: 300 characters
- Temperature: 0.7
- Top P: 0.7
- Repetition penalty: 1.2
- Previous Fish chunks conditioned for continuity
- Text normalization enabled
- One API stream per canonical reader section
- One pinned narrator for full corpus mode
- Local word alignment with `mlx-community/whisper-large-v3-turbo` for the production run

One request per section lets Fish preserve context across its internal chunks. It also avoids the voice and prosody resets caused by the previous external 1,500 character request splitting.

Every generated section produces:

```text
<audioVersionId>-<settingsHash>.opus
<audioVersionId>-<settingsHash>.timings.json
```

The timing sidecar maps word boundaries to character ranges in the exact canonical audio text. Fish alignment snapshots are cumulative within each provider chunk, so the generator preserves their progression and uses the latest nonnull snapshot for each chunk. The Pro Free endpoint can return incomplete snapshots. Production generation therefore runs local MLX Whisper alignment against the completed Fish audio. Provider and local alignment evidence remain in the ignored run directory for diagnosis and resume safety.

The complete spoken text must map to at least 90 percent of canonical words. At least 60 percent of words must have exact anchors, and no interpolated gap may exceed 12 words. Sequence alignment contains pronunciation and normalization differences instead of allowing a repeated word to shift the rest of a section.

## Run Sequence

Copy `.env.audio.example` to `.env.audio.local` in the primary repository checkout, fill in the Fish and Supabase credentials, and set permissions to `600`. The audio commands find this ignored file from any worktree. Explicit process environment values override local file values.

Install the Apple Silicon word aligner once:

```bash
pipx install mlx-whisper
```

The first local alignment downloads `mlx-community/whisper-large-v3-turbo`. Later sections reuse the cached model. The generator keeps persistent worker processes alive so the model is not loaded again for every section.

First generate auditions. Multiple pinned voices are allowed in sample mode:

```bash
npm run audio:fish -- \
  --mode sample \
  --sections <section-id-1,section-id-2,section-id-3,section-id-4> \
  --voices <voice-a>:<reference-a>:<label-a>,<voice-b>:<reference-b>:<label-b> \
  --run-id <audition-run-id>
```

After approval, generate one pinned narrator:

```bash
npm run audio:fish -- \
  --mode full \
  --voices <narrator-id>:<reference-id>:High\ Quality\ 1 \
  --run-id <full-run-id> \
  --timing-source local \
  --alignment-concurrency 2
```

Targeted regeneration keeps the full inventory in the same compatible run and updates only the selected sections:

```bash
npm run audio:fish -- \
  --mode full \
  --sections <section-id-1,section-id-2> \
  --voices <narrator-id>:<reference-id>:High\ Quality\ 1 \
  --run-id <full-run-id> \
  --timing-source local \
  --alignment-concurrency 2
```

The command rejects reuse when the run has a different narrator, model, format, timing source, local alignment model, settings hash, or catalog hash. A dry run reports the proposed inventory without writing it. `--timing-source fallback` uses valid Fish boundaries first and invokes MLX only when Fish validation fails. `--timing-source fish` disables local alignment.

Publish to a new immutable version path. The publisher uploads audio and timing sidecars together and refuses stale, duplicate, incomplete, malformed, or path escaping mappings. It compares the current title and exact audio input contract before publication. Uploaded objects include signed SHA256 metadata and byte size, so watch mode can resume only when an existing object is byte identical. It withholds the public application manifest until the complete corpus passes strict validation:

```bash
npm run audio:publish-manifest -- \
  --run-id <full-run-id> \
  --version <immutable-version> \
  --upload \
  --skip-existing \
  --watch
```

## Quality Notes

Use a dry, quiet reference recording with one speaker and no music. Fish recommends at least 10 seconds. Use 30 to 60 seconds for a narrator model so the sample contains natural pauses, restrained emotion, long sentences, and clean sentence endings.

Do not add global emotion tags to the manuscript. A strong reference performance should carry the narrator's baseline delivery. Tags should be an editorial exception because they alter generation input and complicate canonical word alignment.

Opus is the production default because Fish recommends it for clean timestamp boundaries. WAV is available for lossless auditions or archival masters, but a full corpus is several gigabytes larger. MP3 remains supported by the existing application manifest, so the current hosted corpus continues to play during migration.

## Official References

- [Timestamped TTS endpoint](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech-stream-with-timestamps)
- [Text to Speech API](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech)
- [Voice cloning best practices](https://docs.fish.audio/developer-guide/best-practices/voice-cloning)
- [Create a private voice model](https://docs.fish.audio/api-reference/endpoint/model/create-model)
- [Pricing and rate limits](https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits)
