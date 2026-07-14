# Editorial Instructions

This file governs editorial sources, standards, schemas, templates, audits, debt, and review evidence. Repository-wide Git, pull request, validation, and external posting policy remains in the root AGENTS.md.

## Source packages

- Each volume is one package at editorial/sources/volumes/volume-01 through volume-09.
- Each package contains manuscript.md, voice-card.md, and volume.json.
- manuscript.md is the canonical prose.
- voice-card.md is the editorial authority for the volume's register, cadence, protected language, motifs, risks, and author decisions.
- volume.json is the machine-readable identity and path manifest. Keep editorialId stable and keep every prior manuscript path in historicalSourcePaths.
- The corpus master ledger lives at editorial/sources/corpus/master-ledger.md.
- Reviewed semantic cross-reference concepts and occurrences live at editorial/sources/corpus/semantic-links.json.
- The curated overview lives at editorial/sources/overview/coherence-thesis.json.

Never edit a generated reader section, catalog, browser payload, PDF, or report as a substitute for editing its source. Generated outputs are disposable and untracked.

## Editorial work

- Read the relevant manuscript, its voice card, neighboring sections, and the applicable master ledger material before changing prose.
- Use the coherence-editorial-review skill for substantive prose review, developmental editing, production editing, or verification.
- Use the coherence-editorial-debt-guide skill when a human editor wants to select, triage, investigate, or fully resolve one debt ticket.
- Use the coherence-editorial-debt skill for durable debt audits and register mutations after scope, authority, and evidence are established.
- Preserve claim scope, evidentiary status, citations, deliberate ambiguity, image, cadence, and volume-specific voice.
- Update a voice card only when the source or an explicit author decision changes the volume's editorial authority. Do not alter it merely to justify an edit already made.
- Treat automated findings as prompts for judgment. They do not approve an edit.
- Require explicit author approval before merging substantive manuscript revisions.

## Review evidence

- Store volume review batches at editorial/reviews/volumes/volume-01/<batch-id>/.
- Store corpus-wide summaries and reconciliation records at editorial/reviews/corpus/.
- Every durable batch must contain review.json. It lists the source baseline, reviewed source identity, canonical source path, evidence files, and approval state.
- review.json must enumerate durable evidence by path relative to its batch directory. Do not infer the record from whatever files happen to be present.
- A review record, sentence ledger, structure ledger, semantic review, literary review, slop review, or compression record counts as durable evidence only when review.json lists it.
- Preserve the original baseline source path and source hash in historical review evidence. Resolve current and historical locations through volume.json. Never rewrite a baseline path to make a validator pass.
- When a baseline commit is unreachable from remote history, add a byte exact baseline snapshot to the batch, declare it in review.json, and keep the original commit, path, and hash unchanged.
- Keep ledgers exhaustive and human comments selective. Mechanical records do not replace editorial judgment.
- Preserve superseded and historical reviews with an explicit manifest status. Do not delete them to make the current review surface appear cleaner.

## Durable editorial state

- Treat editorial sources, reviews, audits, debt, standards, schemas, and templates as durable tracked material.
- No build, preview, test, import, or preparation command may rewrite durable editorial state automatically.
- A tool may propose a change in an untracked report. Writing durable state requires an explicit command, human review of the diff, and an intentional commit.
- Semantic link audits are advisory. Record links or exclusions only through the explicit review workflow, and target continuity identities instead of literal routes.
- Resolve debt items with evidence. Do not delete published debt history.

## Validation routing

- For prose changes, run the manuscript import, preparation, and manuscript validation workflow, then run the full repository validation.
- For heading or structural changes, run link preservation before recording routes. Review every lineage and alias decision.
- For review evidence changes, run the sentence ledger, structure ledger, debt, and editorial validation commands that apply to the touched records.
- For changes that affect section text or structure, verify audio version impact and record the result.
- Inspect generated materializations and reports for collapse, fragmentation, reordering, or accidental renaming. Do not commit them.

## Licensing

Editorial prose, voice cards, review records, debt, standards, schemas, templates, overview material, and corpus records are creative work under the content license identified in LICENSE-content and NOTICE. Editorial tooling belongs under scripts and follows the software license.
