---
name: coherence-manuscript-publish
description: Publish Coherence Thesis manuscript and volume source changes through the source-first workflow, historical path resolution, semantic cross-reference review, route preservation, generated inspection, validation, audio impact review, and a focused pull request. Use for changes to manuscript.md, voice-card.md, volume.json, corpus source, overview source, section structure, semantic links, public routes, and durable continuity records.
---

# Manuscript Publish

Carry an approved editorial source change into a validated and reviewable publication branch. Do not publish hosted audio or merge to production from this skill.

## Establish source identity

1. Read the root AGENTS.md, editorial/AGENTS.md, and publishing/AGENTS.md.
2. Identify the package at editorial/sources/volumes/<editorial-id>/.
3. Read manuscript.md, voice-card.md, and volume.json together.
4. Preserve editorialId, sourcePath, voiceCardPath, and every historicalSourcePaths entry.
5. Inspect repository status, refresh origin/main, and use an isolated edit worktree unless direct main work is explicitly authorized.

Corpus source lives at editorial/sources/corpus/. Overview source lives at editorial/sources/overview/.

## Prepare a baseline

Run the current source preparation and validation:

    npm run manuscripts:prepare
    npm run manuscripts:validate

Capture the base revision, source hash, section identities, headings, routes, overview references, and current audio version identities.

## Materialize and inspect

1. Import the canonical source.
2. Inspect generated reader sections and the import report under ignored generated locations.
3. Reject collapsed, fragmented, reordered, empty, duplicated, or incorrectly renamed sections.
4. Confirm that generated output remains untracked.

    npm run manuscripts:import

## Preserve continuity

Treat every removed or renamed heading, section, and route as a continuity event.

    npm run manuscripts:preserve-links -- --base <base-sha>
    npm run manuscripts:record-routes

- Review every lineage and alias decision.
- Supply explicit mappings for ambiguous moves, splits, and merges.
- Preserve historical source paths in volume.json.
- Never rewrite historical review evidence to use the current path.
- Commit only reviewed durable continuity state under publishing/continuity/.

## Review semantic cross-references

Treat internal references as editorial decisions, not search-and-replace targets.

    npm run editorial:semantic-links:audit -- --volume <editorial-id>

1. Review the ignored JSON and Markdown reports under generated/reports/semantic-links/.
2. Record one decision and rationale for each approved link or durable exclusion.
3. Validate the decision file in dry-run mode.
4. Use `--write` only after reviewing every decision.

    npm run editorial:semantic-links:review -- --report <report> --decisions <review-file>
    npm run editorial:semantic-links:review -- --report <report> --decisions <review-file> --write

- Store reviewed concepts and occurrences in editorial/sources/corpus/semantic-links.json.
- Target continuity identities and a route level. Never store guessed or frozen destination URLs.
- Preserve canonical prose. The compiler adds reviewed links only to generated reader bodies.
- Leave ordinary language, metaphor, self-reference, code, headings, and existing links unlinked unless a human review says otherwise.
- Re-run the audit after source or section identity changes. Compilation must fail when an approved source locator or target no longer resolves uniquely.

## Regenerate and validate

    npm run manuscripts:prepare -- --force
    npm run editorial:semantic-links:validate
    npm run manuscripts:validate
    npm run readme:update
    npm run updates:generate
    npm run validate

Run the combined static and browser gate when routes or rendered manuscript behavior can change:

    npm run validate:ui

## Review audio impact

- Treat changed section text or structure as a possible audio invalidation.
- Compare current audioVersionId values with publishing/audio/manifest.json.
- Run read-only audio manifest validation when a current generated run is available.
- Record stale or missing coverage in the pull request.
- Do not upload clips, overwrite objects, or change remote storage from this skill.

## Prepare the pull request

1. Review the complete diff.
2. Confirm canonical source, voice authority, overview source, reviewed continuity, and the checked Updates snapshot are intentional.
3. Confirm generated sections, catalogs, reports, browser payloads, and PDFs are absent from Git.
4. Commit with an edit Conventional Commit title.
5. Push and open or update one focused pull request.
6. Open complete and validated work in the ready state.
7. Include source paths, voice-card impact, review evidence, route decisions, generated inspection, audio impact, validation, open author queries, and remaining approval gates.

Author approval gates merge and publication. Use coherence-ship-site only after that approval.
