# Publishing State

This directory contains reviewed, tracked facts required to publish The Coherence Thesis. It does not contain canonical prose or disposable build output.

## Layout

    publishing/
      continuity/
        aliases.json
        historical-section-mappings.json
        route-aliases.json
        route-ledger.json
        section-ledger.json
        section-lineage.json
        version-provenance.json
      audio/
        manifest.json
      updates/
        snapshot.json
      guides/
        manuscript-link-continuity.md

Continuity records preserve public access as headings and structure evolve. The audio manifest records immutable hosted publication state. The Updates snapshot is the checked fallback for public repository history.

Publishing workflow guidance lives under `publishing/guides/`. See [Manuscript Link Continuity](guides/manuscript-link-continuity.md) before changing headings, section identity, or routes.

## Source and generated boundaries

Canonical manuscripts, voice cards, volume metadata, overview material, and the corpus ledger live under editorial/sources/.

Generated reader sections, application catalogs, reports, browser payloads, search data, breadcrumbs, and PDFs are untracked. They are recreated under `generated/`, `public/data/`, and `public/downloads/` by repository commands. No generated file is an authority for editorial or publishing state.

Build, preview, test, import, compile, and preparation commands must leave publishing/ unchanged. A durable update requires a clearly named record, publish, or generate command followed by review of the complete diff.

## Continuity workflow

After a source change that can affect headings, identities, or routes:

    npm run manuscripts:import
    npm run manuscripts:preserve-links -- --base HEAD
    npm run manuscripts:record-routes
    npm run manuscripts:prepare -- --force
    npm run manuscripts:validate

Review every proposed lineage and alias. Similarity can suggest a successor, but it cannot authorize one.

Each editorial volume manifest records canonical and historical source paths. Historical review ledgers keep the path and hash of their immutable baseline. Validators resolve old and current locations through that manifest. Do not rewrite historical evidence to match the current directory layout.

## Audio workflow

Validate a generated audio run against the current catalog before uploading:

    npm run audio:publish-manifest -- --run-id <run-id> --version <version> --project-ref <project-ref>

The default command validates without writing. Add `--write` only after reviewing the manifest diff. Add `--upload` only after explicit publication authorization. Upload mode also writes the reviewed manifest. Use a new immutable version path and environment-provided credentials. Never overwrite a published object in place.

## Updates workflow

Refresh and verify the checked snapshot through the required revision:

    npm run updates:generate
    npm run updates:verify -- <revision>

The production build writes its exact history snapshot to ignored `generated/updates/snapshot.json` through `npm run updates:prepare`. It does not modify this directory. The production Updates page must include complete history through the deployed revision. Optional historical deployment links may be absent. Commits may not.

## Licensing

Publishing state has mixed licensing. Continuity and audio state follow the creative material they describe. The Updates snapshot follows repository and software history. NOTICE contains the authoritative path-level map.
