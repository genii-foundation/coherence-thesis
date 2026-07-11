---
name: coherence-editorial-review
description: Review and revise Coherence Thesis source manuscripts sentence by sentence for clarity, precision, legibility, elegance, and human cadence while preserving philosophical meaning, poetic voice, citations, structure, and public links. Use for prose audits, AI slop removal, line editing, developmental editing, style harmonization, poetry review, manuscript rewrite batches, pull request commentary, and final editorial quality control in sources/manuscripts.
---

# Coherence Editorial Review

Treat editorial quality as a joint test of language, reasoning, voice, and fidelity. Improve the work without sanding every volume into the same anonymous polish.

## Load the standards

Read [references/editorial-standards.md](references/editorial-standards.md) completely before evaluating or changing manuscript prose. Read [references/review-record-template.md](references/review-record-template.md) before preparing a review record. Read [references/sentence-ledger-schema.md](references/sentence-ledger-schema.md) before creating a sentence ledger. Read [references/structure-ledger-schema.md](references/structure-ledger-schema.md) before reviewing headings or display matter. Use [references/voice-card-template.md](references/voice-card-template.md) to create or update the current volume's voice card. For a corpus scale program, also read `docs/manuscript-editorial-plan.md`.

## Observe the nonnegotiable rules

1. Edit only canonical source Markdown in `sources/manuscripts/`. Never hand edit ignored materializations in `content/manuscripts/`, `src/generated/manuscripts/`, or `public/data/`.
2. Review every sentence in scope, but do not rewrite a good sentence merely to prove that editing occurred. Assign each sentence one disposition: keep, tighten, recast, split, merge, move, query, or remove.
3. Preserve the exact force of claims. Do not turn possibility into certainty, correlation into causation, analogy into evidence, aspiration into fact, or a bounded claim into a universal one.
4. Preserve deliberate ambiguity, image, rhythm, repetition, humor, and strangeness when they carry meaning. Do not make poetry behave like documentation.
5. Use no em dash, en dash, or two consecutive hyphens as prose punctuation. Rewrite the sentence with ordinary syntax and punctuation. Keep ordinary hyphens where grammar requires them.
6. Treat automated findings as prompts for judgment, not proof of bad writing. Domain terms such as coherence, architecture, intelligence, relation, and civilization are not defects merely because they recur.
7. Prefer a precise query over an invented repair when the intended claim, referent, source, or metaphor is uncertain.
8. Allow headings, section boundaries, and section identities to improve. Never retain inferior wording merely to keep an old slug.
9. Preserve access, not obsolete wording. Review aliases and the durable section ledger whenever public structure changes.
10. Read the relevant portions of `sources/manuscripts/coherence-thesis-master-ledger.md` before each batch. Treat the ledger as the continuity authority, not as routine copy editing scope.

## Select the operating mode

### Audit only

Inspect the requested source files and produce findings without changing them. Read the prose closely enough to reject false positives and find problems that pattern matching cannot see. If editorial detector tooling is present on the branch, use it as supporting evidence only.

### Pilot edit

Edit a small, representative sample before a corpus wide rewrite. Select contrasting material, such as analytical argument, intimate narrative, and poetic or liturgical prose. Obtain explicit approval of the voice and intervention level before scaling unless the author has explicitly authorized a named draft wave.

### Production edit

Work in microbatches of one to three sections, usually about 1,500 to 2,500 source words. Keep each microbatch within one volume and a defensible structural boundary. Assemble adjacent batches only when their editorial rationale is the same.

### Verification

Review an existing editorial diff without rewriting it. Compare every changed sentence with its baseline and report semantic drift, literary loss, unresolved slop signals, and publishing impact.

## Execute the workflow

### 1. Establish scope and authority

1. Confirm the source file, sections, intervention level, and whether fact checking is included.
2. Read the complete target section, its neighbors, the volume opening, and the volume closing. Read more when a concept or motif depends on distant context.
3. Read the relevant master ledger sections and the current volume voice card.
4. Write a short authorial profile for the batch: central claims, register, point of view, rhythm, images, protected terms, protected lines, and known uncertainties.
5. Use the strongest editorial reasoning model available. Record the model only when the runtime exposes it.

### 2. Prepare the work safely

1. Check repository status and preserve unrelated work.
2. Fetch `origin/main` and create an isolated `edit/<slug>` worktree unless the user explicitly requests direct work on `main`.
3. Run the source first baseline:

```bash
npm run manuscripts:prepare
npm run manuscripts:validate
```

4. Capture the base commit, source hash, target file, headings, section IDs, routes, aliases, overview references, links, citations, numbers, proper names, word count, and baseline validation in the review record.
5. Mark quotations, epigraphs, verse, definitions, canonical terminology, refrains, headings, and display matter as protected or reviewable language.

### 3. Diagnose before rewriting

1. Read every paragraph and mark reasoning defects, prose defects, voice risks, factual questions, and structural questions.
2. Separate high confidence repairs from author questions. Do not conceal uncertainty beneath fluent replacement prose.
3. Identify repeated habits across the batch before editing individual instances. Repair the habit while allowing intentional recurrence.
4. Complete developmental triage before line editing. Classify repeated sections, codas, summaries, and refrains as cumulative, independently necessary, or redundant.

### 4. Edit sentence by sentence

Apply these passes in order:

1. **Meaning:** Preserve propositions, logical relationships, qualifications, chronology, referents, and evidentiary status.
2. **Clarity:** Make the actor, action, object, and consequence legible.
3. **Compression:** Remove throat clearing, duplicated conclusions, generic transitions, inflated modifiers, and explanations already carried by the image or argument.
4. **Cadence:** Vary sentence length and syntax according to thought. Restore breath, emphasis, and movement without manufacturing quirks.
5. **Voice:** Compare the revision with the authorial profile. Restore distinctive diction or asymmetry lost to generic polish.
6. **Punctuation:** Remove every prohibited mark by repairing the syntax around it.

### 5. Keep durable review evidence

Store each batch under `editorial/reviews/<volume-id>/<batch-id>/`.

1. Use `sentence-ledger.jsonl` to account for every baseline sentence in scope, including sentences kept unchanged.
2. Use `structure-ledger.jsonl` to account for headings and standalone display matter.
3. Use `review.md` for authorial profile, material decisions, independent reviews, queries, routes, validation, and approval.
4. Make ledgers exhaustive. Make human commentary selective.
5. Do not describe a generated alignment as editorial judgment. Every changed claim, metaphor, heading, structural choice, and query requires human review.

### 6. Perform independent review

Use fresh reviewers for every pilot and production batch. Give each reviewer the original and revised passage without the lead editor's rationale.

1. Ask a semantic reviewer to find changed claims, lost qualifications, broken logic, factual overreach, citation problems, and changed referents.
2. Ask a literary reviewer to find flattened voice, dead rhythm, overcompression, prettified vagueness, damaged imagery, and needless rewrites.
3. Give a slop reviewer the complete catalog in `references/editorial-standards.md`. Record a result for every category from 4.1 through 4.24.
4. Reconcile disagreements against the source, authorial profile, and editorial standards. Do not decide by majority vote.

### 7. Write comments like an editor

Pull request comments are correspondence with the author. They are not a dump of ledger rows.

1. Comment only when the author benefits from seeing a judgment, tradeoff, question, or representative choice.
2. Begin with what the passage is doing, then explain what the revision gains or risks in that context.
3. Discuss the actual claim, image, cadence, or structural movement. Do not lead with disposition labels, reason codes, sentence hashes, or detector categories.
4. Group related changes into one useful note. Do not leave one formulaic comment per sentence.
5. Vary the shape and length of comments according to the editorial issue. Repeated templates make close reading look counterfeit.
6. Ask natural questions when intent is uncertain. State the competing readings and why the choice matters.
7. Identify strong original lines selectively when their survival explains the edit's restraint.
8. Leave clean mechanical repairs uncommented unless they reveal a wider pattern worth discussing.

### 8. Prove and publish the batch

1. Compare original and revised prose sentence by sentence for semantic drift.
2. Read the revision aloud or use speech playback.
3. Confirm Markdown, quotations, citations, headings, order, and public route intent.
4. If structure changed, add deliberate aliases before recording the reviewed route set.
5. Run the current source first workflow:

```bash
npm run manuscripts:import
npm run manuscripts:record-routes
npm run manuscripts:prepare -- --force
npm run manuscripts:validate
npm run readme:update
npm run updates:generate
npm run validate
npm run test:e2e
```

6. Inspect the ignored reader materialization and import report for collapse, fragmentation, reordering, or accidental renaming. Do not commit disposable generated fragments or browser payloads.
7. Check changed audio version identities and document whether hosted audio must be regenerated.
8. Open a focused pull request whose body begins with `(AI Generated).` Include representative comparisons, semantic and literary review, route impact, audio impact, open queries, and residual risk.
9. Wait for explicit prose approval before merge.

## Stop conditions

Stop and request direction when:

- The intended claim cannot be inferred safely.
- A poetic ambiguity may be either deliberate or accidental.
- A factual repair requires research outside the authorized scope.
- A renamed, split, merged, moved, or removed section has no confirmed destination for its historical route.
- A revision would reconcile a contradiction by inventing a position.
- Independent review finds unresolved semantic drift.
- The pilot voice has not been approved and the author has not authorized the named draft wave.

The governing principle is simple: a sentence should leave the process more exact, more alive, or both. If it becomes merely smoother, the editor may have improved the upholstery while misplacing the house.
