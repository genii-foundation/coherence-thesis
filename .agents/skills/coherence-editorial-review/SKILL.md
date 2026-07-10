---
name: coherence-editorial-review
description: Review and revise Coherence Thesis source manuscripts sentence by sentence for clarity, precision, legibility, elegance, and human cadence while preserving philosophical meaning, poetic voice, citations, structure, and stable public links. Use for prose audits, AI slop removal, line editing, developmental editing, style harmonization, poetry review, manuscript rewrite batches, and final editorial quality control in sources/manuscripts.
---

# Coherence Editorial Review

Treat editorial quality as a joint test of language, reasoning, voice, and fidelity. Improve the work without sanding every volume into the same anonymous polish.

## Load the standards

Read [references/editorial-standards.md](references/editorial-standards.md) completely before evaluating or changing manuscript prose. Read [references/review-record-template.md](references/review-record-template.md) before preparing a review record. Read [references/sentence-ledger-schema.md](references/sentence-ledger-schema.md) before creating the required sentence ledger. Read [references/structure-ledger-schema.md](references/structure-ledger-schema.md) before reviewing headings or display matter. Read [references/editorial-debt-schema.md](references/editorial-debt-schema.md) before recording or resolving a durable obligation. Use [references/voice-card-template.md](references/voice-card-template.md) to create or update the current volume's voice card. For a corpus-scale program, also read `docs/manuscript-editorial-plan.md` and `editorial/debt/index.md`.

## Observe the nonnegotiable rules

1. Edit only canonical source Markdown in `sources/manuscripts/`. Never hand edit generated files in `content/manuscripts/`, `src/generated/manuscripts/`, or `public/data/`.
2. Review every sentence in scope, but do not rewrite a good sentence merely to prove that editing occurred. Assign each sentence one disposition: keep, tighten, recast, split, merge, move, query, or remove.
3. Preserve the exact force of claims. Do not quietly turn possibility into certainty, correlation into causation, analogy into evidence, aspiration into fact, or a bounded claim into a universal one.
4. Preserve deliberate ambiguity, image, rhythm, repetition, humor, and strangeness when they carry meaning. Do not make poetry behave like documentation.
5. Use no em dash, en dash, or two consecutive hyphens as prose punctuation. Rewrite the sentence with a period, comma, colon, semicolon, parentheses, or a different syntax. Keep ordinary hyphens where grammar requires them.
6. Treat automated findings as prompts for judgment, not proof of bad writing. Domain terms such as coherence, architecture, intelligence, relation, and civilization are not defects merely because they recur.
7. Prefer a precise query over an invented repair when the intended claim, referent, source, or metaphor is uncertain.
8. Allow headings, section boundaries, and section identities to improve when the manuscript needs them to improve. Treat each change as an editorial and link-preservation decision. Never retain inferior wording merely to keep an old slug.
9. Preserve access, not obsolete identity. Every previously published section, chapter, part, and volume route must still resolve through the append-only route ledger and explicit aliases after headings or IDs change. Structural membership may evolve when related lineage remains. Volume root paths remain fixed unless a separate site change adds reviewed volume redirects.
10. Read the relevant portions of `sources/manuscripts/coherence-thesis-master-ledger.md` before each batch. Treat the ledger as the continuity authority, not as routine copy-editing scope.
11. Record every discovered inconsistency, unfulfilled promise, unresolved claim, citation gap, canon conflict, literary weakness, link obligation, audio obligation, or tooling limitation in `editorial/debt/items/`. Debt IDs and files are append-only. Pay debt down by resolving the item with evidence, never by deleting its history. Reopen the same item when later evidence proves that a supposed corpus-wide resolution was only partial.

## Select the operating mode

### Audit only

Inspect the requested source files and produce findings without changing them. Run the bundled detector, then read the prose closely enough to reject false positives and add problems that pattern matching cannot see.

```bash
npm run manuscripts:editorial -- sources/manuscripts/<file>.md
```

Use `--format json` when another tool will consume the report. The default exit status is informational. Use `--strict` only when prohibited punctuation must block a completed edit.

### Pilot edit

Edit a small, representative sample before any corpus-wide rewrite. Select contrasting material, such as analytical argument, intimate narrative, and poetic or liturgical prose. Obtain explicit approval of the voice and intervention level before scaling.

The author may explicitly authorize a named production wave before pilot approval. That authorization permits drafting and opening review pull requests for only the named volumes. It does not approve the prose, authorize a merge, or weaken any sentence, structure, semantic, literary, slop, route, or publication gate. Treat the resulting pull request as the tone checkpoint and wait for explicit approval before merge.

### Production edit

Work in editorial microbatches of one to three sections, usually about 1,500 to 2,500 source words. Keep every microbatch within a single volume and a defensible structural boundary. Assemble adjacent approved microbatches into a reviewable pull request tranche of about 5,000 to 10,000 words only when their editorial rationale is the same.

### Verification

Review an existing editorial diff without rewriting it. Reconstruct the source baseline, compare every changed sentence, run structural and prose audits, and report semantic drift, literary loss, unresolved slop signals, and publishing impact.

## Execute the workflow

### 1. Establish scope and authority

1. Confirm the exact source file, sections, desired intervention level, and whether fact checking is included.
2. Read the complete target section, its preceding and following sections, the volume opening, and the volume closing. Read more when a concept or motif depends on distant context.
3. Read the relevant master ledger sections and the approved volume voice card.
4. Read `editorial/debt/index.md` and every active item that touches the volume, concept, route, or publication surface.
5. Write a brief authorial profile for the batch: central claims, register, point of view, characteristic rhythm, recurring images, protected terms, protected lines, and known uncertainties.
6. Run the strongest editorial reasoning model available in the active environment. If model choice and reasoning level are exposed, select the strongest model and highest reasoning level. Record the actual model only when the runtime exposes it.

### 2. Prepare the work safely

1. Check repository status and preserve unrelated work.
2. Fetch `origin/main` and create an isolated `edit/<slug>` worktree from the current remote base unless the user explicitly requests a direct main edit.
3. Run the current manuscript compile and validation gates before editing.
4. Capture the base commit, source hash, generated catalog hash, target file, section headings, section IDs, route paths, aliases, overview references, links, citations, numbers, proper names, word count, and audit baseline in the review record.
5. Mark epigraphs, dedications, verse, quotations, definitions, canonical terminology, citations, intentional refrains, headings, and title-page display matter as protected or reviewable language.

### 3. Diagnose before rewriting

1. Run `npm run manuscripts:editorial` on the exact source scope.
2. Read every paragraph and mark reasoning defects, prose defects, voice risks, factual questions, and structural questions.
3. Separate high-confidence repairs from author questions. Do not conceal uncertainty beneath fluent replacement prose.
4. Identify repeated habits across the batch before editing individual instances. Repair the underlying habit while allowing intentional recurrence.
5. Complete developmental triage before line editing. Classify repeated sections, codas, summaries, and refrains as cumulative, independently necessary, or redundant. Do not spend exquisite sentences on an argument that should appear once.
6. Open or update editorial debt items as soon as an obligation becomes larger than the current safe edit. Cite the debt ID in the batch review record. Do not bury durable debt only in prose notes or pull request discussion.
7. For a cross-volume pass, store the dated independent scan under `editorial/debt/audits/`. Complete the source scan before deduplicating against the active index. Reconcile every finding into an existing or new debt item before closing the pass. The audit report is evidence, not a substitute for the item library.

### 4. Edit sentence by sentence

Apply the following passes in order:

1. **Meaning pass:** Preserve propositions, logical relationships, qualifications, chronology, referents, and evidentiary status.
2. **Clarity pass:** Make the actor, action, object, and consequence legible. Replace vague abstraction with concrete language where the text supports it.
3. **Compression pass:** Remove throat clearing, duplicated conclusions, generic transitions, inflated modifiers, and explanations already carried by the image or argument.
4. **Cadence pass:** Vary sentence length and syntax according to thought. Restore breath, emphasis, and movement without manufacturing quirks.
5. **Voice pass:** Compare the revision with the authorial profile. Restore distinctive diction or asymmetry lost to generic polish.
6. **Punctuation pass:** Remove every em dash, en dash, and two-hyphen prose substitute. Check nearby punctuation rather than swapping symbols mechanically.

Keep the required machine-readable sentence ledger at `editorial/reviews/<volume-id>/<batch-id>/sentence-ledger.jsonl`. Follow the bundled schema. Use stable source hashes and sentence ordinals rather than line numbers alone. Record the original sentence, disposition, proposed text, exact current result locations, reason codes, claim invariants, citation attachments, risk, and review status. Whole-source scope includes source prose that the reader import omits, including title matter, dedications, editorial introductions, and the master ledger.

Keep the companion structure ledger at `editorial/reviews/<volume-id>/<batch-id>/structure-ledger.jsonl`. Give every baseline Markdown heading and standalone display unit a disposition, proposed text, exact current result location, route impact, route outcome, and review status. Every changed claim, removed sentence, altered metaphor, renamed heading, structural change, and unresolved query must also appear in the human review record.

After the current source has been imported, initialize both exhaustive ledgers from the immutable baseline and current worktree:

```bash
npm run manuscripts:editorial-ledgers:init -- \
  --base <base-sha> \
  --current WORKTREE \
  --source sources/manuscripts/<volume>.md \
  --output editorial/reviews/<volume-id>/<batch-id>
```

The initializer may align exact text and propose mechanical split, merge, recast, or removal records. It leaves every record pending. Treat each inferred change as a review queue, never as an editorial judgment. Complete claim types, invariants, reasons, route outcomes, and risks before approval.

### 5. Perform adversarial review

Use fresh reviewers for every pilot and production batch. Run them sequentially if concurrent capacity is unavailable. Give each reviewer the original and revised passage without the lead editor's rationale. Stop the batch if independent review cannot be completed.

1. Ask a semantic reviewer to find changed claims, lost qualifications, broken logic, factual overreach, citation problems, and changed referents.
2. Ask a literary reviewer to find flattened voice, dead rhythm, overcompression, prettified vagueness, damaged imagery, and needless rewrites.
3. Give the slop reviewer the complete catalog in `references/editorial-standards.md`. Require one recorded result for every category from 4.1 through 4.24, including a finding, an intentional exception, or a clear result of none found. Do not replace the catalog with a short prompt or a detector summary. Automation may support only categories it can identify reliably.
4. Reconcile disagreements against the source, authorial profile, and editorial standards. Do not decide by majority vote.

### 6. Prove the batch

1. Run the prose audit again on every changed source file.
2. Require zero prohibited-punctuation findings in changed prose.
3. Compare original and revised passages sentence by sentence for semantic drift.
4. Read the revised prose aloud or use speech playback for cadence. Inspect any sentence that is difficult to breathe, parse, or emphasize.
5. Confirm that headings, Markdown, quotations, citations, section order, and public route intent remain correct.
6. If headings, IDs, parts, chapters, or section boundaries changed, review the proposed section lineage and every new alias. Resolve ambiguous successors explicitly.
7. Complete the review record from the bundled template.
8. Reconcile the editorial debt register. Open every newly discovered durable item, resolve items paid down by the batch with evidence, then run `npm run manuscripts:debt:update` and `npm run manuscripts:debt`.
9. Validate a complete source sentence ledger against both immutable baseline and current worktree:

```bash
npm run manuscripts:editorial-ledger -- \
  --base <base-sha> \
  --current WORKTREE \
  --source sources/manuscripts/<volume>.md \
  --require-approved \
  <sentence-ledger-path>
```

10. Validate the companion structure ledger against the same baseline and current source:

```bash
npm run manuscripts:structure-ledger -- \
  --base <base-sha> \
  --current WORKTREE \
  --source sources/manuscripts/<volume>.md \
  --require-approved \
  <structure-ledger-path>
```

For a sentence microbatch, declare every baseline section with `--section` and every current section with `--current-section`. The sentence validator must prove complete declared baseline coverage, exact proposed text at every current result location, and complete reconstruction of the declared current scope. The structure validator intentionally remains whole-source. Run it with `--source` even when the prose batch covers only selected sections, because headings and display matter outside generated reader sections still require an inventory.

### 7. Publish through the manuscript pipeline

Run the canonical workflow after source edits:

```bash
npm run manuscripts:debt:update
npm run manuscripts:debt
npm run manuscripts:import
npm run manuscripts:preserve-links -- --base HEAD --write
npm run manuscripts:compile
npm run manuscripts:audit-history -- --summary
npm run manuscripts:versions
npm run manuscripts:validate
npm run readme:update
npm run validate
npm run test:e2e
```

Inspect the import report and generated diff. Heading, identity, and structural changes are permitted when editorially justified. The link-preservation planner compares the previous and revised catalogs, carries old section, chapter, part, and inherited alias routes forward, and updates alias chains. When it cannot identify a successor safely, provide an explicit reviewed mapping:

```bash
npm run manuscripts:preserve-links -- --base HEAD --map old-section-id=new-section-id --write
```

Use `--route-map old-route=new-route` when a split, merge, or reorganization leaves no unique chapter or part successor. Similar prose may appear as a suggestion, but it never authorizes a lineage or redirect.

Do not compile or publish while any prior route lacks a confirmed destination. Check changed `audioVersionId` values and validate or regenerate hosted audio when the publishing scope requires complete audio coverage.

The current provenance tool derives first-version commits from Git history. Before the first production manuscript batch, confirm that the version workflow records a commit containing the new text. If it does not, stop and fix the provenance workflow rather than publishing a false history.

### 8. Hand off for approval

1. Commit with an `edit:` Conventional Commit title.
2. Open or update a focused pull request whose body begins with `(AI Generated).`
3. Include the original problem, authorial profile, intervention level, representative before and after examples, semantic review, audit results, validation, generated impact, route impact, audio impact, open queries, and residual risk.
4. Include every editorial debt item opened, carried, or resolved by the batch.
5. Do not merge a pilot or production edit until the user explicitly approves the prose.

## Stop conditions

Stop and request direction when any of the following is true:

- The intended claim cannot be inferred safely.
- A poetic ambiguity may be either deliberate or accidental.
- A factual repair would require new research outside the authorized scope.
- A renamed, split, merged, moved, or removed section has no confirmed current destination for its historical routes.
- The link-preservation planner reports an ambiguous lineage that editorial judgment has not resolved.
- A revision would reconcile a contradiction by inventing a position.
- Independent review finds unresolved semantic drift.
- Critical editorial debt would make the proposed publication misleading, unsafe, internally contradictory, or impossible to validate.
- The pilot voice has not been approved and the author has not explicitly authorized the named draft wave before pilot approval.

## Activate the final corpus gate

Keep the corpus audit advisory while unrevised volumes still contain baseline violations. Use `npm run manuscripts:editorial:strict -- --volume <volume-id>` to hard fail each completed volume. After all nine volumes reach zero prohibited punctuation, add `npm run manuscripts:editorial:strict` to the repository `validate` chain so regressions fail globally.

The governing principle is simple: a sentence should leave the process more exact, more alive, or both. If it becomes merely smoother, the editor may have improved the upholstery while misplacing the house.
