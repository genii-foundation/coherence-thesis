---
name: coherence-manuscript-import
description: Import and update Coherence Thesis manuscripts from Markdown sources through the repository publishing workflow, then validate, commit, push, and open or update a focused pull request with source, generated data, alias, and validation context. Use when asked to seed or update manuscript sources, preserve public deep links with aliases, validate overview references, or regenerate manuscript data.
disable-model-invocation: true
---

# Manuscript Import

Markdown files in `sources/manuscripts/` are import inputs. Generated reader Markdown lives in `content/manuscripts/`.

## Workflow

1. Confirm the source Markdown path or volume manifest change and inspect the current git state. Preserve unrelated local changes.
2. Before creating a new import branch or worktree, refresh the remote base:

```bash
git fetch origin main
git rev-parse origin/main
```

If the fetch fails, stop and report the failure. Do not create an import branch from a stale local `main`, stale `origin/main`, or an existing feature worktree. Create the branch and worktree from the freshly fetched `origin/main` unless the user explicitly requested direct `main` work:

```bash
git worktree add -b edit/<slug> <worktree-path> origin/main
```

For direct `main` work, verify local `main` is clean and current with `origin/main` before editing. If it is behind, fast-forward it before editing. If it cannot be fast-forwarded cleanly, stop and report the blocker.
3. Confirm canonical Markdown and generated data are currently valid:

```bash
npm run manuscripts:compile
npm run manuscripts:validate
```

4. Regenerate canonical reader Markdown:

```bash
npm run manuscripts:import
```

5. Review changed generated sections and the Markdown import report:

```bash
git diff -- content/manuscripts artifacts/imports/markdown-series-report.json
```

6. Capture import context while working:
   - What source changed and why the import is needed.
   - Which generated reader sections, aliases, overview nodes, and browser data changed.
   - Whether public routes moved, split, merged, or were renamed.
   - Why any alias, source cleanup, importer change, or overview adjustment was created.
   - Any parser behavior, ordering decision, or manuscript structure tradeoff.
7. Regenerate and validate:

```bash
npm run manuscripts:compile
npm run manuscripts:validate
npm run readme:update
npm run updates:generate
npm run test
```

8. Check whether hosted audiobook clips became stale. Manuscript compile output owns `audioVersionId` values in `public/data/progress-sections.json`; any body or structure change can change those IDs.
   - If `public/data/progress-sections.json`, `src/generated/manuscripts/catalog.json`, or relevant generated section Markdown changed, validate the current audio run before shipping:

```bash
npm run audio:publish-manifest -- --run-id <run-id> --version <version> --project-ref <supabase-project-ref>
```

   - This command can run without upload credentials when `--upload` is omitted. It fails before writing a manifest when generated audio is missing, a section is unknown, an `audioVersionId` is stale, or a voice does not cover every current section.
   - If the validation fails because audio is stale or missing, regenerate changed clips before merge. Use `--sections` for a comma separated section list when only known sections changed, or `--mode full` to let existing files skip and missing current clips generate:

```bash
FISH_AUDIO_API_KEY=<from-secret-store> npm run audio:fish -- --mode full --voices <voice-id:label> --run-id <run-id>
FISH_AUDIO_API_KEY=<from-secret-store> npm run audio:fish -- --mode full --sections <section-id-1,section-id-2> --voices <voice-id:label> --run-id <run-id>
```

   - Republish only with temporary Supabase S3 credentials from the environment. Never commit, echo, paste, or log those credentials:

```bash
SUPABASE_S3_ACCESS_KEY_ID=<from-secret-store> \
SUPABASE_S3_SECRET_ACCESS_KEY=<from-secret-store> \
SUPABASE_S3_REGION=<region> \
npm run audio:publish-manifest -- --run-id <run-id> --version <new-version> --project-ref <supabase-project-ref> --upload --skip-existing
```

   - Use a new immutable version path when publishing new audio. Do not overwrite existing Supabase objects in place.
9. Run `npm run build` when route data, overview references, generated catalog data, or audio manifest data changed.
10. Review the final diff before staging. Confirm generated files are expected, public link preservation is handled, audio manifest state is current when manuscript audio changed, `src/generated/updates.json` is refreshed through the current main base, no import report surprise is ignored, and unrelated local changes are left alone.
11. Commit with an `edit:` Conventional Commit title, push the branch, and open or update a focused pull request. If the user explicitly requested direct main work, commit directly on `main` and do not open a pull request unless asked.

## Stable IDs

- Public section routes are preserved through `content/series/aliases.json`.
- Add an alias when a future route should keep resolving after a section moves, splits, merges, or is renamed.
- Do not force new headings to mimic old section structures just to preserve links.
- Paragraph fingerprints are generated into the catalog so local progress can identify changed passages after a reader has read an older section version.
- Audio version fingerprints are generated from section text and structure. Treat changed `audioVersionId` values as a hosted-audio invalidation event.

## Failure Handling

- Stop on duplicate IDs, empty bodies, missing frontmatter, broken overview references, bad aliases, bad ordering, or stale generated data.
- Stop on stale or missing hosted audio when the manuscript change affects current `audioVersionId` values and the user expects audiobook coverage to remain complete.
- If the parser collapses or fragments the document, fix the source or importer before publishing.
- Never normalize a broken import into canonical Markdown.

## Pull Request Quality

Start from `.agents/templates/pull-request-description.md`. The body must begin with `(AI Generated).`

Include manuscript-specific context whenever it applies:

- The source Markdown path, series metadata, or manifest entry that prompted the import.
- Generated canonical reader sections, browser data, overview references, aliases, and README state touched by the change.
- Audio impact: whether `audioVersionId` values changed, whether clips were regenerated, the audio version path used, and whether `public/data/audio-manifest.json` changed.
- Public route preservation decisions, including why aliases were added or why none were needed.
- Importer, parser, heading, ordering, or section ID decisions.
- Evidence from `artifacts/imports/markdown-series-report.json` when it explains the result.
- Validation commands run and any build or preview evidence for changed routes.
- Known risks, such as large section moves, intentional route changes, or follow-up cleanup.

## Commit Quality

Make every commit reviewable on its own:

- Keep one manuscript import or coherent source update per commit.
- Do not mix unrelated site feature work into manuscript import commits.
- Include generated artifacts only when they come from the required publishing workflow.
- Make sure validation evidence in the closeout and pull request matches the actual commands run.
- If validation fails, either fix the cause or leave a precise blocker with the failing command and relevant output.

## Closeout

Close out with the commit hash, pushed branch, pull request URL when one exists, validation commands, and any changed public routes or aliases. If validation was skipped or narrowed, state exactly why.
