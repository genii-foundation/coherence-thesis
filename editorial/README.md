# Editorial Records

This directory stores durable evidence for Coherence Thesis pilot and production edits. It does not contain canonical manuscript prose. Authors edit `sources/manuscripts/`.

Use this layout:

```text
editorial/
  debt/index.md
  debt/items/<ctd-id>-<slug>.md
  voice-cards/<volume-id>.md
  reviews/<volume-id>/<batch-id>/review.md
  reviews/<volume-id>/<batch-id>/sentence-ledger.jsonl
  reviews/<volume-id>/<batch-id>/structure-ledger.jsonl
```

Keep temporary detector output, scratch comparisons, rendered previews, and generated reader fragments outside this directory. They are working material, not literary history.

## Editorial debt

The debt register preserves obligations that outlive one review batch. Add a stable item as soon as an inconsistency, unfulfilled promise, unresolved claim, citation gap, literary weakness, link obligation, audio obligation, or technical limitation is discovered. Resolve an item with evidence instead of deleting it. If the problem returns, reopen the same item and preserve the prior paydown.

Edit item files in `editorial/debt/items/`, then run `npm run manuscripts:debt:update`. The generated index is never the source of truth. Run `npm run manuscripts:debt` to validate the complete register.

## Voice cards

Create one voice card per volume before production editing. Record its argument, register, cadence, protected language, recurring images, known risks, and author decisions. Use the template in `.agents/skills/coherence-editorial-review/references/voice-card-template.md`.

A voice card guides judgment. It is not a bag of preferred synonyms and must not flatten another volume into its style.

## Review records

Each production batch includes three related forms of evidence:

- `sentence-ledger.jsonl` accounts for every baseline sentence in scope, including sentences kept unchanged.
- `structure-ledger.jsonl` accounts for every heading and standalone display unit in the source file.
- `review.md` records authorial context, material choices, independent reviews, unresolved questions, route decisions, validation, and approval.

Follow the schemas bundled with the editorial review skill. Record the actual validation method available on the branch. Never cite an imagined command to make a review look more complete than it is.

## Editorial tooling

The deterministic audit finds prohibited punctuation and recurring patterns that deserve attention. Its default corpus run is advisory:

```bash
npm run manuscripts:editorial
```

Narrow the audit to a volume or source path while editing:

```bash
npm run manuscripts:editorial -- --volume <volume-id>
npm run manuscripts:editorial -- sources/manuscripts/<volume>.md
```

The strict corpus audit fails on prohibited punctuation. It remains an explicit command while the unrevised source still contains known violations:

```bash
npm run manuscripts:editorial:strict
```

Do not add the strict corpus audit to `npm run validate` until the nine-volume revision pull request lands and the complete source corpus passes it. Warning rules remain editorial prompts, even after the punctuation gate is active.

After importing an edited source, initialize pending sentence and structure ledgers from an immutable baseline:

```bash
npm run manuscripts:editorial-ledgers:init -- \
  --base <base-sha> \
  --current WORKTREE \
  --source sources/manuscripts/<volume>.md \
  --output editorial/reviews/<volume-id>/<batch-id>
```

The initializer aligns exact and changed text. It does not make an editorial judgment. Review every inferred disposition, result location, claim, and route outcome before approval.

Validate the resulting ledgers against the baseline and current source:

```bash
npm run manuscripts:editorial-ledger -- \
  --base <base-sha> \
  --current WORKTREE \
  --source sources/manuscripts/<volume>.md \
  --require-approved \
  editorial/reviews/<volume-id>/<batch-id>/sentence-ledger.jsonl

npm run manuscripts:structure-ledger -- \
  --base <base-sha> \
  --current WORKTREE \
  --source sources/manuscripts/<volume>.md \
  --require-approved \
  editorial/reviews/<volume-id>/<batch-id>/structure-ledger.jsonl
```

Adjudication can fill repeatable internal evidence after the semantic, literary, and complete slop reviews exist. Run it without `--write` first:

```bash
npm run manuscripts:editorial-ledgers:adjudicate -- \
  --base <base-sha> \
  --current WORKTREE \
  --source sources/manuscripts/<volume>.md \
  --review editorial/reviews/<volume-id>/<batch-id>

npm run manuscripts:editorial-ledgers:adjudicate -- \
  --base <base-sha> \
  --current WORKTREE \
  --source sources/manuscripts/<volume>.md \
  --review editorial/reviews/<volume-id>/<batch-id> \
  --write
```

Before adjudication, complete the tooling evidence fields in `review.md` with the source hash, both initialized ledger hashes, and the hashes of the semantic, literary, and slop reviews. The helper rejects stale hashes, any review without an explicit PASS verdict, incomplete slop coverage, and ledgers that cannot reconstruct their immutable baseline and current source.

Adjudication preserves the baseline text, dispositions, result locations, merge groups, citation attachments, and route impact. It keeps changed claims and public structure below approved status until the necessary authority and link decisions exist.

These tools create and validate internal evidence only. They do not generate or post pull request comments. Editorial comments remain selective correspondence about the actual argument, image, cadence, structure, or author question.

## Pull request comments

The ledgers are exhaustive. Pull request comments are selective.

Write inline comments when the author needs to evaluate a judgment, tradeoff, query, or representative pattern. Explain what the passage is doing and what the revision changes in that context. Group related edits. Leave ordinary punctuation and copy repairs silent unless they reveal a wider issue.

Do not paste disposition labels, reason codes, hashes, or detector categories into comments. A comment should sound like an attentive editor speaking to an author, not a database requesting affection.

## Source first boundary

Review records explain the edit but never replace the source. Generated reader sections, catalogs, search data, breadcrumbs, and PDF indexes are ignored local materializations. Recreate them through `npm run manuscripts:prepare`.

After a structural manuscript change, review aliases and explicitly record the accepted route set with `npm run manuscripts:record-routes`. Commit only canonical source, durable editorial evidence, and reviewed route metadata.
