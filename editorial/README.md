# Editorial Workspace

This directory holds the canonical prose, its editorial authority, and the durable record of editorial work.

## Layout

```text
editorial/
  sources/
    corpus/master-ledger.md
    overview/coherence-thesis.json
    volumes/volume-01/
      manuscript.md
      voice-card.md
      volume.json
  reviews/
    corpus/<batch-id>/
    volumes/volume-01/<batch-id>/
      review.json
      review.md
      sentence-ledger.jsonl
      structure-ledger.jsonl
  audits/
  debt/
  standards/
  schemas/
  templates/
```

The pattern continues through `volume-09`. Each volume package is complete in one place. `manuscript.md` is canonical prose. `voice-card.md` records editorial authority. `volume.json` records stable identity, current paths, historical source paths, display metadata, and import configuration.

Keep temporary detector output, scratch comparisons, generated reader fragments, and local reports under ignored workspace locations. They are not literary history.

## Source workflow

After changing a manuscript or volume manifest, inspect the import and preserve public links:

```bash
npm run manuscripts:import
npm run manuscripts:preserve-links -- --base HEAD
npm run manuscripts:record-routes
npm run manuscripts:prepare -- --force
npm run manuscripts:validate
```

Do not accept an import that collapses, fragments, reorders, or wrongly renames sections. Fix the source or importer first.

## Voice cards

Create and maintain one voice card beside each manuscript. Record the argument, register, cadence, protected language, images, risks, controls, and author decisions. Start from `editorial/templates/voice-card.md` and follow `editorial/standards/editorial.md`.

A voice card guides judgment. It is not a bag of preferred synonyms. Update it when the source or an explicit author decision changes the editorial authority. Do not rewrite it merely to excuse an edit already made.

## Review batches

Store volume review evidence at `editorial/reviews/volumes/<editorial-id>/<batch-id>/`. Store corpus reconciliation at `editorial/reviews/corpus/<batch-id>/`.

Every volume batch contains `review.json`. It names the immutable baseline, reviewed source identity, current canonical source path, exact ledger scope, validation state, open query count, residual risk, standing, publication state, every evidence file, and author approval state. Its hashes make orphan recovery and silent evidence drift visible. If no remote ref can reach the baseline commit, preserve a byte exact `baseline.md` snapshot in the batch and bind it with `baseline.snapshotPath`.

Historical ledger paths identify the source at the baseline commit. Keep them intact. Validators resolve those paths through the adjacent `volume.json`.

The sentence ledger accounts for every baseline sentence in scope. The structure ledger accounts for headings and standalone display units. `review.md` records material editorial choices, unresolved questions, route decisions, validation, and approval context. Follow the schemas under `editorial/schemas/`.

Validate the complete editorial repository with:

```bash
npm run editorial:validate
```

Initialize a new review batch from an immutable baseline:

```bash
npm run editorial:ledgers:init -- \
  --base <base-sha> \
  --current WORKTREE \
  --source editorial/sources/volumes/<editorial-id>/manuscript.md \
  --output editorial/reviews/volumes/<editorial-id>/<batch-id>
```

Validate approved ledgers with:

```bash
npm run editorial:ledgers:validate -- \
  --base <base-sha> \
  --current WORKTREE \
  --source editorial/sources/volumes/<editorial-id>/manuscript.md \
  --require-approved \
  editorial/reviews/volumes/<editorial-id>/<batch-id>/sentence-ledger.jsonl

npm run editorial:structure-ledger -- \
  --base <base-sha> \
  --current WORKTREE \
  --source editorial/sources/volumes/<editorial-id>/manuscript.md \
  --require-approved \
  editorial/reviews/volumes/<editorial-id>/<batch-id>/structure-ledger.jsonl
```

The initializer aligns text. It does not make editorial judgments. Review every inferred disposition, result location, claim, citation attachment, and route outcome before approval.

## Editorial audit

Run the advisory prose audit across the corpus or one volume:

```bash
npm run editorial:lint
npm run editorial:lint -- --volume <volume-id>
npm run editorial:lint -- editorial/sources/volumes/<editorial-id>/manuscript.md
```

The strict audit fails on prohibited punctuation:

```bash
npm run editorial:lint:strict
```

Automated findings are prompts for judgment. They do not approve an edit.

## Editorial debt

Durable inconsistencies, unfulfilled promises, unresolved claims, citation gaps, literary weaknesses, link obligations, audio obligations, and technical limits live in `editorial/debt/`.

Add or reopen a stable item instead of hiding unfinished work in a review summary. Resolve it with evidence instead of deleting it. Use `editorial/templates/debt-item.md`.

```bash
npm run editorial:debt:update
npm run editorial:debt
```

The first command rebuilds the index. The second validates item structure, identifiers, evidence paths, lifecycle dates, and index freshness.

## Pull request comments

Ledgers are exhaustive. Pull request comments are selective. Comment when the author needs to judge a claim, image, cadence, structural choice, or unresolved question. Group related edits. Leave ordinary copy repairs silent unless they expose a wider problem.

Comments should sound like an attentive editor speaking to an author. Do not paste disposition labels, reason codes, hashes, or detector categories into the conversation.
