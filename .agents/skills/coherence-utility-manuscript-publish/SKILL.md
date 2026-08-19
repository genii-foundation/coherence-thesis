---
name: coherence-utility-manuscript-publish
description: Publish Coherence Thesis manuscript and volume source changes through the source-first workflow, historical path resolution, semantic cross-reference review, route preservation, generated inspection, validation, mandatory audio republication, and a focused pull request. Use for changes to manuscript.md, voice-card.md, volume.json, corpus source, overview source, section structure, semantic links, public routes, and durable continuity records.
---

# Manuscript Publish

Carry an approved editorial source change and its matching audio into a validated and reviewable publication branch. Do not merge or deploy from this skill.

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

## Show the local result

1. Follow the root local preview review gate before broad validation or pull request publication.
2. Start the preview from the manuscript worktree on an unused port and verify its reported worktree, branch, Git SHA, and candidate digest.
3. Open every affected manuscript or overview route needed to judge the change, then give the author the direct local URL.
4. Apply feedback locally and show the revised preview before pushing another candidate.
5. After the final commit, reconfirm the exact candidate in the preview and wait for the author's approval. A hosted preview does not satisfy this gate.

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

Run `npm run validate` only when executable logic, schemas, or tooling change. Do not run unit, build, or Playwright suites for prose-only publication changes.

Run the combined static and browser gate only when routes or rendered manuscript behavior can change:

    npm run validate:ui

## Resolve audio invalidation

Run the fail-closed comparison against the fresh pull request base:

    npm run audio:verify-manuscript-publication -- --base <base-sha>

If no spoken title or body changed, record the passing result. If the command
reports changed sections:

1. Show the author the exact section IDs. Explain that the manuscript cannot
   merge or deploy until matching audio is published.
2. Confirm authorization before generating paid audio, uploading objects, or
   changing the public manifest.
3. Read `publishing/guides/fish-audiobook-generation.md` and use one pinned
   narrator. Generate the reported sections inside a complete compatible run:

       npm run audio:fish -- --mode full --sections <section-id-1,section-id-2> --voices <voice-id>:<reference-id>:<label> --run-id <run-id>

4. Publish timestamped audio and timing sidecars under a new immutable version.
   Record and validate the volume checkpoint, then promote it through
   `npm run audio:promote-volume`. Never hand edit the manifest.
5. Rerun the publication gate against the same base. It must pass for every
   public narrator before the pull request is ready.

Require matching remote SHA256 metadata and byte size. Reject incomplete runs,
absolute legacy paths, path escapes, narrator or settings drift, and stale
catalog hashes. A debt record or a note in the pull request does not waive the
gate.

A draft pull request may be opened after exact preview approval when external
audio work remains. Name the audio gate as its blocker. Never mark it ready or
merge it until the gate passes.

## Prepare the pull request

1. Review the complete diff.
2. Confirm canonical source, voice authority, overview source, reviewed continuity, and the checked Updates snapshot are intentional.
3. Confirm generated sections, catalogs, reports, browser payloads, and PDFs are absent from Git.
4. Commit with an edit Conventional Commit title.
5. Push and open or update one focused pull request only after the author approves the exact local preview or explicitly waives the root preview gate.
6. Open complete and validated work in the ready state only after the audio
   publication gate passes.
7. Include source paths, voice-card impact, review evidence, route decisions,
   generated inspection, changed audio sections, immutable audio publication
   evidence, validation, open author queries, and remaining approval gates.

## Stage the approved publication candidate

Wording approval authorizes the source change. Publication approval authorizes
the release. Do not conflate them.

After the exact candidate source is committed and the author explicitly
authorizes publication:

1. Create the publication approval record defined in
   `editorial/method/schemas/publication-approval.md`.
2. Confirm its source path and hash match the committed manuscript.
3. Stage the candidate through `npm run editorial:checkpoints -- stage`.
4. Commit the approval record, snapshot, and manifest candidate together.
5. Revalidate and update the pull request.

The staged candidate remains outside the published checkpoint chain. Use
coherence-utility-ship-site to merge, deploy, verify the exact bytes, and promote the
candidate only after production succeeds.
