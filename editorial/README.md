# Editorial Records

This directory stores durable evidence for Coherence Thesis pilot and production edits. It does not contain canonical manuscript prose. Authors edit `sources/manuscripts/`.

Use this layout:

```text
editorial/
  voice-cards/<volume-id>.md
  reviews/<volume-id>/<batch-id>/review.md
  reviews/<volume-id>/<batch-id>/sentence-ledger.jsonl
  reviews/<volume-id>/<batch-id>/structure-ledger.jsonl
```

Keep temporary detector output, scratch comparisons, rendered previews, and generated reader fragments outside this directory. They are working material, not literary history.

## Voice cards

Create one voice card per volume before production editing. Record its argument, register, cadence, protected language, recurring images, known risks, and author decisions. Use the template in `.agents/skills/coherence-editorial-review/references/voice-card-template.md`.

A voice card guides judgment. It is not a bag of preferred synonyms and must not flatten another volume into its style.

## Review records

Each production batch includes three related forms of evidence:

- `sentence-ledger.jsonl` accounts for every baseline sentence in scope, including sentences kept unchanged.
- `structure-ledger.jsonl` accounts for every heading and standalone display unit in the source file.
- `review.md` records authorial context, material choices, independent reviews, unresolved questions, route decisions, validation, and approval.

Follow the schemas bundled with the editorial review skill. Record the actual validation method available on the branch. Never cite an imagined command to make a review look more complete than it is.

## Pull request comments

The ledgers are exhaustive. Pull request comments are selective.

Write inline comments when the author needs to evaluate a judgment, tradeoff, query, or representative pattern. Explain what the passage is doing and what the revision changes in that context. Group related edits. Leave ordinary punctuation and copy repairs silent unless they reveal a wider issue.

Do not paste disposition labels, reason codes, hashes, or detector categories into comments. A comment should sound like an attentive editor speaking to an author, not a database requesting affection.

## Source first boundary

Review records explain the edit but never replace the source. Generated reader sections, catalogs, search data, breadcrumbs, and PDF indexes are ignored local materializations. Recreate them through `npm run manuscripts:prepare`.

After a structural manuscript change, review aliases and explicitly record the accepted route set with `npm run manuscripts:record-routes`. Commit only canonical source, durable editorial evidence, and reviewed route metadata.
