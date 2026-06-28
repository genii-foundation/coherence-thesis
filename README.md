# The Coherence Thesis

The Coherence Thesis is a living manuscript project about interpersonal coherence, civilizational coordination, and future societies capable of becoming powerful without ceasing to become wise.

This repository is the source of truth for the text. Word documents can seed or update drafts, but canonical manuscripts live here as Markdown.

## Current Focus

Volume Three, **The Providence Imperative**, is seeded from `sources/manuscripts/coherence-thesis-vol3-providence-imperative.docx`.

The first reader experience is a static Next.js site with:

- A five minute overview map that links into exact manuscript sections
- Static HTML manuscript routes for search engines and older devices
- Local first read progress with no login and no server side reading history
- Browser speech audiobook playback with voice preferences
- A Word import workflow that creates reviewable diffs before updating canonical text

## Source of Truth

Canonical text is stored in:

```text
content/manuscripts/
```

Generated app data is stored in:

```text
src/generated/manuscripts/
```

Do not edit generated files by hand. Edit Markdown, then run the compiler.

## Development Status

<!-- BEGIN:development-status -->

Generated: 2026-06-28T00:38:57.578Z

- Branch: main
- Revision: 4dd7220
- Working tree: local changes present
- Next.js: 16.2.9
- Manuscripts: 1 volume, 9 parts, 29 chapters, 116 sections
- Canonical words: 41,152
- Estimated full read: 188 minutes
- Overview nodes: 8

Recent commits:

```text
4dd7220 Initialize Coherence Thesis manuscript site
```

<!-- END:development-status -->

## Quick Start

```bash
npm install
npm run manuscripts:compile
npm run dev
```

Static preview after a build:

```bash
npm run build
npm start
```

Useful validation commands:

```bash
npm run manuscripts:validate
npm run test
npm run lint
npm run build
```

## Manuscript Import Workflow

Seed or draft a Word import:

```bash
npm run manuscripts:import -- --source sources/manuscripts/coherence-thesis-vol3-providence-imperative.docx
```

Seed directly into canonical Markdown only for the initial baseline:

```bash
npm run manuscripts:import -- --apply
```

Compare a draft import with canonical Markdown:

```bash
npm run manuscripts:diff-import -- --draft artifacts/imports/<import-id>/content/manuscripts
```

Apply a reviewed draft:

```bash
npm run manuscripts:apply-import -- --draft artifacts/imports/<import-id>/content/manuscripts --force
```

After applying:

```bash
npm run manuscripts:compile
npm run manuscripts:validate
```

## Architecture

- `content/manuscripts/` contains author editable Markdown.
- `content/overview/` contains the curated five minute overview map.
- `scripts/manuscripts/` owns import, compile, diff, apply, and validation workflows.
- `src/generated/manuscripts/catalog.json` is generated from Markdown.
- `src/app/` renders static Next.js routes.
- Client islands add local progress and audio without making manuscript text dependent on JavaScript.

## Privacy

V1 uses local progress only. The reader stores section IDs, content hashes, read timestamps, percent read, and audio preferences in the browser.

There is no account requirement and no server side reading history. Future cross device sync should be optional and encrypted.

## Roadmap

- Add the remaining complementary manuscripts and connect them through the overview map.
- Add richer import conflict review for changed, added, and removed sections.
- Add spaced repetition flashcards.
- Add recommendation paths across the full manuscript body.
- Add optional encrypted progress sync.
- Add an interactive AI that can converse with the complete body of visionary work.

## Design Notes

The visual system is inspired by Freed's local first product discipline and Scriptorium reading mode, adapted here for a manuscript site: warm paper, dark ink, bronze rules, restrained geometry, accessible contrast, and mobile first long form reading.
