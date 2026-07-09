# The Coherence Thesis

The Coherence Thesis is a living manuscript project about interpersonal coherence, civilizational coordination, and future societies capable of becoming powerful without ceasing to become wise.

This repository is the source of truth for the text. Source manuscripts are Markdown files. Canonical reader sections live here as generated Markdown.

## Current Focus

Volumes One through Nine are published as independent complementary manuscripts.

The first reader experience is a hybrid Next.js site with:

- A five minute overview map that links into exact manuscript sections
- Statically generated manuscript routes for search engines and older devices
- Local first read progress and engagement history with optional account sync
- Section and paragraph fingerprints that reveal updated sections after a reader has read an older version
- Instant local search across the full manuscript body from a generated static index
- Browser speech audiobook playback with voice preferences
- A Markdown publishing workflow driven by source files and volume metadata

## Source of Truth

Source Markdown files are stored in:

```text
sources/manuscripts/
```

Volume metadata and manual deep link aliases are stored in:

```text
content/series/
```

Generated canonical reader sections are stored in:

```text
content/manuscripts/
```

Generated app data is stored in:

```text
src/generated/manuscripts/
```

Do not edit generated files by hand. Edit source Markdown or series metadata, then run the importer and compiler.

## Development Status

<!-- BEGIN:development-status -->

- Next.js: 16.2.9
- Manuscripts: 9 volume, 47 parts, 406 chapters, 561 sections
- Canonical words: 198,694
- Estimated full read: 904 minutes
- Overview nodes: 9

<!-- END:development-status -->

## Quick Start

```bash
npm install
npm run manuscripts:compile
npm run dev
```

Fresh worktrees can install dependencies with:

```bash
npm run bootstrap
```

Most npm scripts run the same dependency guard first and install with `npm ci`
when `node_modules` is missing, the lockfile changes, or the Node major version
changes.

Production preview after a build:

```bash
npm run build
npm start
```

Useful validation commands:

```bash
npm run manuscripts:validate
npm run test
npm run test:e2e:fast:desktop
npm run test:e2e:fast
npm run test:e2e
npm run lint
npm run build
```

Use `npm run test:e2e:fast` while iterating on UI. It reuses or starts an isolated Next dev server at `http://127.0.0.1:3200` and skips the production build. Use `npm run test:e2e` for the final production browser gate before shipping.

For the fastest repeated UI loop, keep the isolated e2e server running in one terminal:

```bash
npm run dev:e2e
npm run test:e2e:fast:desktop
```

## Manuscript Publishing Workflow

Regenerate canonical reader Markdown from source Markdown:

```bash
npm run manuscripts:import
```

Compile generated app data:

```bash
npm run manuscripts:compile
```

Validate section IDs, overview references, aliases, and generated catalog freshness:

```bash
npm run manuscripts:validate
```

After changing a source volume or `content/series/volumes.json`, run:

```bash
npm run manuscripts:import
npm run manuscripts:compile
npm run manuscripts:validate
```

When a future section route should keep working after a heading or structure change, add an entry to `content/series/aliases.json` instead of forcing new headings to match old paths.

## Audiobook Clip Publishing

Hosted audiobook clips are keyed by each section's `audioVersionId`. `npm run manuscripts:compile` updates those IDs from the current manuscript text and structure. If manuscript content, section boundaries, or volume metadata changes, treat changed `audioVersionId` values as an audiobook invalidation event.

Validate the current generated run against the current catalog before shipping manuscript changes that should keep high quality hosted playback complete:

```bash
npm run audio:publish-manifest -- --run-id <run-id> --version <version> --project-ref <supabase-project-ref>
```

Without `--upload`, this checks that every generated MP3 maps to a known section, matches the current `audioVersionId`, exists on disk, and covers every section for every voice in the run. It fails before writing `public/data/audio-manifest.json` when audio is stale or incomplete.

Regenerate changed clips with Fish Audio when needed. Use a focused section list when the changed sections are known, or `--mode full` so existing files skip and missing current clips generate:

```bash
FISH_AUDIO_API_KEY=<from-secret-store> npm run audio:fish -- --mode full --sections <section-id-1,section-id-2> --voices <voice-id:label> --run-id <run-id>
FISH_AUDIO_API_KEY=<from-secret-store> npm run audio:fish -- --mode full --voices <voice-id:label> --run-id <run-id>
```

Publish with a new immutable version path. Do not overwrite Supabase objects in place, and never commit or print upload credentials:

```bash
SUPABASE_S3_ACCESS_KEY_ID=<from-secret-store> \
SUPABASE_S3_SECRET_ACCESS_KEY=<from-secret-store> \
SUPABASE_S3_REGION=<region> \
npm run audio:publish-manifest -- --run-id <run-id> --version <new-version> --project-ref <supabase-project-ref> --upload --skip-existing
```

## Architecture

- `content/manuscripts/` contains author editable Markdown.
- `sources/manuscripts/` contains source Markdown for the publishing pipeline.
- `content/series/` contains volume metadata and manual deep link aliases.
- `content/overview/` contains the curated five minute overview map.
- `scripts/manuscripts/` owns Markdown import, compile, and validation workflows.
- `src/generated/manuscripts/catalog.json` is generated from Markdown.
- `public/data/search-index.json` is generated by `npm run manuscripts:compile`.
- `src/app/` renders statically generated reader routes plus server routes for auth and account actions.
- Client islands add local progress, engagement history, sync controls, and audio without making manuscript text dependent on JavaScript.

## Privacy

V1 uses local progress and local engagement history by default. The reader stores section IDs, section hashes, paragraph hashes, read timestamps, percent read, reading time summaries, return counts, scroll milestones, search and recommendation interactions, audio engagement, and reader preferences in the browser.

There is no account requirement. If a reader signs in with email, remote sync does not upload anything until the reader explicitly allows it. Synced data is protected by Supabase row level security in V1. Future client side encryption can be added with a new schema version.

## Licensing

The site software, including source code, scripts, components, tests, and build tooling, is licensed under the Apache License 2.0. See `LICENSE`.

Original manuscripts, site copy, and owned artwork are licensed under Creative Commons Attribution-ShareAlike 4.0 International. See `LICENSE-content`. Third party materials remain governed by their own licenses.

`NOTICE` maps each part of the repository to the license that applies to it.

## Roadmap

- Add final individual cover art for each manuscript.
- Add spaced repetition flashcards.
- Add recommendation paths across the full manuscript body.
- Add the introspection graph from local first reading history.
- Add an interactive AI that can converse with the complete body of visionary work.

## Design Notes

The visual system is inspired by Freed's local first product discipline and Scriptorium reading mode, adapted here for a manuscript site: warm paper, dark ink, bronze rules, restrained geometry, accessible contrast, and mobile first long form reading.
