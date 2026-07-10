# Manuscript Editorial Plan

## Purpose

The Coherence Thesis contains nearly 200,000 words across nine published volumes. Its ideas deserve prose that feels considered, exact, and alive. The editorial program will review every sentence in the source manuscripts, remove synthetic habits that weaken trust, clarify the arguments, protect the poetry, and preserve the work's distinct voice.

This is not a bulk cleanup. It is a controlled literary and philosophical edit with explicit safeguards against semantic drift and stylistic homogenization.

## Definition of done

The program is complete when:

1. Every source sentence has received a recorded editorial disposition: keep, tighten, recast, split, merge, move, query, or remove. This includes title matter, dedications, editorial introductions, and prose omitted from generated reader sections.
2. Every Markdown heading and standalone display unit has received a recorded disposition and an exact current result location.
3. Every volume has an approved authorial profile that identifies its claims, register, cadence, images, protected terms, and protected passages.
4. Every changed batch has passed semantic, literary, and AI slop review against its original text.
5. Every slop review records a judgment for all 24 catalog categories.
6. No source manuscript uses an em dash, en dash, or two consecutive hyphens as prose punctuation.
7. Canned transitions, false antitheses, generic uplift, abstract noun clusters, repetitive scaffolds, redundant conclusions, inflated claims, vague referents, and mechanical cadence have been removed where they are defects.
8. Philosophical claims retain their scope, modality, logical relationships, and evidentiary status.
9. Poetic ambiguity, image, rhythm, and deliberate repetition remain intact unless the author approves a change.
10. Quotations, citations, names, numbers, headings, Markdown, section identities, aliases, and generated reader data are correct.
11. Every historical section, chapter, part, and volume route still resolves to related lineage after headings, identities, membership, or structure evolve. Volume root paths remain fixed unless reviewed redirect support is added separately, but their contents may change freely.
12. Audiobook invalidation has been identified and resolved for each published batch.
13. The author has approved the pilot voice and every production pull request before merge.
14. The global strict editorial audit is part of `npm run validate` only after all nine volumes reach zero prohibited punctuation.
15. Every discovered durable editorial obligation has a stable item in `editorial/debt/items/`, every paid obligation remains as resolved history, and the generated debt index passes validation.

## Scope

### Included

- All source Markdown in `sources/manuscripts/`
- The master ledger where its prose functions as reader-facing editorial matter
- Sentence, paragraph, section, and chapter-level edits
- Philosophical clarity and argument visibility
- Poetic, narrative, prophetic, intimate, and liturgical register
- Terminology and cross-volume consistency
- Fact, quotation, and citation review when authorized for the batch
- Headings, section identities, and structure whenever editorial quality requires them to change
- Conservative automatic continuity for established lineage or unique unchanged content, plus explicitly adjudicated aliases for every other superseded public route
- Generated manuscript and reader artifacts produced by the canonical publishing pipeline

### Excluded unless separately approved

- New philosophical claims or new doctrine
- Reordering whole volumes
- Silent reconciliation of contradictions
- Citation invention or source substitution
- Automatic replacement of domain vocabulary
- Site redesign or unrelated reader features
- Merging an editorial batch without author approval

## Editorial doctrine

The complete standard lives in `.agents/skills/coherence-editorial-review/references/editorial-standards.md`. Five principles govern the whole program.

### Meaning before polish

Preserve truth, argument, scope, modality, chronology, image, and voice before pursuing brevity or elegance. A fluent semantic error is still an error, only better dressed.

### Review every sentence, rewrite only when useful

Sentence-by-sentence review does not mean compulsory paraphrase. Good sentences should survive. Keeping them is an editorial decision, not an omission.

### Clarity without disenchantment

Make difficult thought legible without reducing it to slogans. Preserve mystery that is intentional and productive. Remove obscurity that comes from vague syntax, stacked abstraction, or incomplete reasoning.

### Voice before uniformity

Each volume may have its own register. Analytical passages should not acquire prophetic incense. Blessings should not be forced into white-paper prose. The shared standard is attentive intelligence, not identical diction.

### Detection before judgment

Automated checks will identify suspicious punctuation and recurring constructions. They will not decide what is beautiful, true, intentional, or worth keeping. Every finding requires contextual judgment.

## Model and reviewer configuration

### Lead editor

Run the lead pass with the strongest reasoning model available in the active environment. If model choice and reasoning level are exposed, select the strongest model and highest reasoning setting. Record the actual model only when the runtime exposes it. Do not invent a model label for the sake of ceremony.

The lead editor owns the authorial profile, sentence dispositions, integrated revision, author queries, and final adjudication.

### Independent semantic reviewer

Give a fresh reviewer the original and revised passage without the lead editor's rationale. Ask it to identify changed propositions, scope, modality, causality, referents, chronology, evidence, citations, and unresolved contradictions.

### Independent literary reviewer

Give another fresh reviewer the same passages. Ask it to identify flattened voice, dead cadence, overcompression, overexplained metaphor, normalized strangeness, lost humor, weakened image, and needless rewriting.

### Independent slop reviewer

Give a third fresh reviewer the complete AI slop catalog in `.agents/skills/coherence-editorial-review/references/editorial-standards.md`. Require a recorded result for every category from 4.1 through 4.24. Each result must identify a defect, an intentional exception, a query, or no finding. Automation may support reliable categories, but it cannot substitute for this complete judgment record.

Reviewers advise. The lead editor reconciles findings against the source, the authorial profile, and author decisions. Majority vote is not an editorial philosophy.

## Repository tooling

The repository skill lives at `.agents/skills/coherence-editorial-review/`. It contains:

- The complete sentence-level workflow in `SKILL.md`
- The editorial standard and AI slop catalog in `references/editorial-standards.md`
- A reusable review record in `references/review-record-template.md`
- The sentence ledger contract in `references/sentence-ledger-schema.md`
- The structure ledger contract in `references/structure-ledger-schema.md`
- A reusable volume voice card in `references/voice-card-template.md`

The deterministic detector is repository tooling at `scripts/manuscripts/editorial-lint.ts`. Its unit tests live beside it, and the skill invokes it through the package script.

The sentence ledger validator is `scripts/manuscripts/editorial-ledger.ts`. It validates the durable JSONL record for every pilot and production batch, including stable addresses, dispositions, splits, merges, removals, and approval status.

The structure ledger validator is `scripts/manuscripts/editorial-structure-ledger.ts`. It proves that every baseline heading and display unit received a disposition and that the proposed structure exactly reconstructs the current source.

The ledger initializer is `scripts/manuscripts/editorial-ledger-init.ts`. It aligns the immutable baseline with the current imported source and creates exhaustive pending sentence and structure records. Its inferred dispositions are a review queue, not approval. The editor and independent reviewers must complete and adjudicate every changed record.

The editorial debt validator is `scripts/manuscripts/editorial-debt.ts`. It enforces stable contiguous IDs, required evidence and paydown criteria, source references, dated history, resolution evidence, and a fresh generated index. Run `npm run manuscripts:debt:update` whenever an item is opened or paid down. Resolved items remain in the library.

The link-preservation planner is `scripts/manuscripts/preserve-links.ts`. It separates public section identity from technical continuity. Established lineage and unique unchanged content may carry forward automatically. Prose similarity supplies candidates but never authorizes a mapping. All changed-content renames, splits, merges, removals, and ambiguous structural moves require explicit review. The planner writes section lineage, section aliases, and structural aliases. The append-only route ledger records target continuity and makes route loss or unrelated route reuse a validation failure. Part, chapter, and volume membership may evolve. A historical structural route needs related continuity, not permanent ownership of every section it once contained. The complete history audit covers 4,387 distinct links from 42 first-parent catalog revisions, including 3,936 generated static paths and 451 fragment links, and must remain at zero broken links.

Run the detector on one batch before and after revision:

```bash
npm run manuscripts:editorial -- sources/manuscripts/<file>.md
npm run manuscripts:editorial -- sources/manuscripts/<file>.md --strict
```

Use JSON output for comparison or aggregation:

```bash
npm run manuscripts:editorial -- sources/manuscripts --format json
```

The detector must never become an automatic synonym cannon. It catches signals. The editor determines whether each signal is a defect, a deliberate device, a domain requirement, or a false positive.

### Current baseline

The expanded audit against `origin/main` commit `5388e58c85940d264a557f184d5bfe1bae715fc0` found 7,306 deterministic signals across the nine published source volumes and the master ledger:

- 2,893 em dashes
- 25 en dashes
- 10 listed AI filler terms
- 65 duplicate sentence occurrences
- 682 formulaic contrast signals
- 722 portentous intensifier signals
- 1,008 triad candidates
- 348 references to `this chapter`, `this section`, `this book`, or `this volume`
- 505 abstract noun cluster signals
- 197 sentences of at least 55 words
- 555 short isolated paragraph signals
- 97 excessive emphasis signals
- 78 repeated sentence opening signals
- 12 unresolved verification markers
- 12 malformed emphasis signals
- 1 repeated-word signal
- 57 inflated significance signals
- 13 repeated negation signals
- 11 throat-clearing signals
- 6 generic meta-framing signals
- 5 vague grandeur signals
- 3 repeated heading signals
- 1 stock transition signal

The punctuation counts are objective. The warning counts are an editorial queue, not a verdict. Refresh this baseline whenever the corpus base commit changes.

### Initial volume risk map

| Volume | Priority | Primary editorial risk |
| --- | --- | --- |
| IV | Critical | Structural duplication, bureaucratic abstraction, long catalogs, repeated recaps of Volume III |
| III | Critical | Largest punctuation burden, long sentences, scientific certainty, superlative escalation |
| VII | High | Mystical abstraction, recurring formulaic summaries, malformed emphasis, liturgical flattening risk |
| V | High | Rhetorical question chains, false contrasts, repeated purpose aphorisms, copy defects |
| VIII | High | Polemical inflation, volatile factual claims, mixed academic and apocalyptic registers |
| VI | High and genre-sensitive | Lyrical compression, ornamental repetition, highest punctuation density |
| IX | High and brief | Compressed recap, cross-volume duplication, numerological register |
| II | Medium to high | Definitional scaffolds, short declarative chains, recurring disclaimers |
| I | Medium to high | Qualification before argument, throat clearing, heavy punctuation cadence |

Run the structural diagnosis of Volumes III and IV first because they contain the largest absolute burden and many patterns repeated later. Use Volume VII early to prove that the method can improve clarity without bleaching spiritual language. Preserve production dependencies by integrating approved edits in canonical volume order and rerunning cross-volume review after every wave.

## Program phases

### Phase 0: Baseline and editorial constitution

1. Run the detector across the complete source corpus.
2. Record counts by file, rule, and severity.
3. Sample findings manually to estimate false-positive rates.
4. Identify corpus-wide habits and volume-specific habits.
5. Approve the editorial standard, intervention levels, and review record.
6. Confirm whether factual and citation verification belongs in every batch or in a separate research pass.
7. Confirm that `npm run manuscripts:versions` records a commit containing each new body version. Repair the provenance workflow before the first production edit if it does not.
8. Confirm the link-preservation planner produces zero changes and zero ambiguity on an unchanged catalog.

Deliverables:

- Approved repository skill
- Corpus audit baseline
- Approved editorial standard
- Approved pilot selections
- Decision on fact-check scope
- Verified version-provenance workflow
- Verified route lineage, alias, and route-ledger workflow

### Phase 1: Authorial profiles

Create one profile for each volume before editing it. Each profile should cover:

- Central thesis and major supporting claims
- Intended reader and relationship to the reader
- Dominant register and permitted register changes
- Characteristic sentence rhythm and paragraph movement
- Signature metaphors, images, humor, and emotional temperature
- Terms that must remain stable across the series
- Terms that may change meaning by volume
- Passages that define the voice and should be treated as controls
- Known factual, logical, tonal, or structural concerns
- Acceptable intervention level

The profiles prevent one successful pilot from becoming a universal mold.

### Phase 2: Developmental map

Complete a corpus-wide structural diagnosis before polishing sentences. The first audit found several patterns that line editing alone cannot repair:

- Volume IV contains 28 `Coda: In Plain Terms` sections and 28 `Toward the coherent substrate` recaps.
- Volume IV refers to Volume III 93 times.
- Volume VII contains 10 formulaic `Within the Coherence Thesis` summaries.
- Several exact substantive sentences recur across volumes.
- Long catalog sentences often alternate with tiny dramatic verdicts.

For each volume, build an argument map that marks definitions, premises, mechanisms, examples, counterarguments, transitions, codas, refrains, and conclusions. Classify repetition as cumulative, independently necessary, or redundant. Propose section merges, splits, removals, reordering, heading revisions, and identity changes before line editing the affected material.

Do not preserve an inferior section or heading to retain its identity. The route history will preserve access. The manuscript should preserve quality.

### Phase 3: Three-part pilot

Select three sections that stress different editorial abilities:

1. A Volume I section with plain conceptual reasoning
2. A Volume VI or VII section with lyrical, ceremonial, or liturgical prose
3. A Volume VIII section with evidence-heavy polemic

For each pilot:

1. Preserve the untouched original for comparison.
2. Create the authorial profile.
3. Run the detector and close reading.
4. Produce the sentence-level edit.
5. Complete all three independent reviews.
6. Present representative before and after passages with rationale.
7. Ask the author to mark the intervention as too light, correct, or too strong.
8. Revise the skill and standard if the pilot exposes a systematic weakness.

Present all three pilots at one approval checkpoint. Normally, production editing waits for that approval. The author may explicitly authorize a named draft wave before pilot approval. Such authorization permits drafting and review pull requests only for those volumes. The pull request becomes the tone checkpoint, and no volume may merge without explicit prose approval.

### Phase 4: Production editing

Edit in microbatches of one to three sections, normally about 1,500 to 2,500 source words. A microbatch should remain inside one volume and follow a meaningful section boundary. This size allows the lead editor to retain local context while giving independent reviewers a tractable comparison.

The current corpus will likely require about 80 to 135 microbatches. Treat microbatches as internal editing and review units, not separate author interruptions. Assemble them into one focused pull request per volume, followed by one cross-volume harmonization pull request. Adjust the batch count after the pilot measures actual section sizes and revision density.

After pilot approval, or under explicit authorization for a named draft wave, run volume editing in parallel workstreams. Each workstream may prepare a later volume while the lead integrator reviews an earlier one. Integrate and validate the volume pull requests in canonical order from I through IX so definitions and cross-volume promises flow forward. Present approval checkpoints in three waves, Volumes I through III, IV through VI, and VII through IX. A wave may be approved together, but no volume merges without explicit author approval.

For every batch:

1. Refresh the branch from current `origin/main` and create an isolated `edit/<slug>` worktree.
2. Run the current compile and validation baseline.
3. Read the target, its neighbors, and the volume-level control passages.
4. Resolve developmental cuts, merges, splits, moves, heading revisions, and identity changes before line editing.
5. Run the detector and create the review record.
6. Complete meaning, clarity, compression, cadence, voice, and punctuation passes.
7. Import the revised source so the current reader sections and source hashes match the edit.
8. Run the ledger initializer to create exhaustive pending sentence and structure records from the immutable baseline and current source.
9. Review `sentence-ledger.jsonl` and assign every baseline sentence a final disposition, including source prose absent from the generated reader.
10. Review `structure-ledger.jsonl` and assign every heading and standalone display unit a final disposition and route outcome.
11. Run semantic, literary, and complete 24-category slop reviews with fresh context.
12. Reconcile every material finding in the source and ledgers.
13. Open durable editorial debt for every obligation the batch cannot safely finish. Resolve existing debt with evidence when the batch pays it down.
14. Run `npm run manuscripts:debt:update` and `npm run manuscripts:debt`.
15. Run the detector again and require zero prohibited punctuation in changed prose.
16. Validate the complete source sentence ledger with `--base <base-sha> --current WORKTREE --source <source.md> --require-approved`.
17. Validate the complete structure ledger with the same baseline, current worktree, source, and approval requirements.
18. Read the batch aloud.
19. Run the link-preservation planner and review every confirmed lineage and alias.
20. Supply explicit section mappings, continuity mappings, and route mappings for changed-content renames, ambiguous splits, merges, removals, or deep rewrites.
21. Compile, validate, and inspect generated changes only after every historical route has a destination.
22. Open a focused pull request with representative comparisons, editorial debt changes, and unresolved queries.
23. Wait for explicit author approval before merge.

Draft in parallel after the pilot, then integrate in volume order from I through IX. Later volumes depend on definitions and promises established earlier. Treat the master ledger as the continuity authority and edit it only after manuscript claims have stabilized.

### Phase 5: Cross-volume harmonization

After all volumes receive their first full pass:

1. Audit recurring definitions and project terms across the series.
2. Identify accidental contradictions, scope changes, duplicated anecdotes, repeated crescendos, and repeated chapter conclusions.
3. Verify cross-volume references and promises.
4. Compare how Providence, coherence, intelligence, purpose, stewardship, architecture, and related terms develop over time.
5. Preserve intentional evolution. Flag unintentional drift.
6. Review volume openings and closings as a continuous sequence.
7. Run a corpus-wide cadence and lexical repetition review.

Treat conceptual changes discovered here as author decisions, not routine copy edits.

### Phase 6: Final proof and publication

1. Run the detector across all source manuscripts and inspect every remaining finding.
2. Require zero prohibited punctuation across the corpus.
3. Verify quotations, citations, names, dates, numbers, headings, links, section identities, routes, aliases, and route history.
4. Read all high-register passages aloud and spot-check every volume in speech playback.
5. Run the full manuscript import, compile, validation, README update, and repository validation gates.
6. Review audiobook invalidation across the completed corpus and publish new immutable audio versions when required.
7. Inspect the rendered reader at desktop and mobile widths for Markdown or structural regressions.
8. Produce a final editorial report with corpus changes, unresolved questions, and known interpretive decisions.
9. Run `npm run manuscripts:editorial:strict` across the complete corpus.
10. Add the global strict editorial command to `npm run validate` and prove that a prohibited mark now fails the repository gate.

## Per-batch sentence workflow

| Pass | Question | Required result |
| --- | --- | --- |
| Meaning | What exactly does the sentence claim or enact? | Proposition, image, or movement is identified |
| Logic | How does it relate to nearby sentences? | Premise, inference, contrast, example, or consequence is visible |
| Clarity | Can an attentive reader parse it once? | Actor, action, referent, and scope are legible |
| Compression | What can leave without loss? | Redundancy and ceremony are removed |
| Cadence | Does its breath fit its thought? | Length, syntax, and emphasis serve meaning |
| Voice | Could this sentence belong only here? | Distinctive diction and register remain |
| Slop | Does it use a synthetic habit? | Canned patterns are removed or intentionally retained |
| Fidelity | What changed besides wording? | Any semantic change is reverted or approved |

## Intervention levels

### Level 1: Proof and clean

Correct grammar, punctuation, typos, broken references, obvious redundancy, and prohibited marks. Preserve nearly all syntax and diction.

### Level 2: Line edit

Recast sentences for clarity, compression, cadence, and exactness. Preserve paragraph structure and all substantive claims.

### Level 3: Deep edit

Rebuild paragraphs, move sentences, remove repeated argument, strengthen transitions, and query weak reasoning. Preserve the section's thesis and approved voice.

### Level 4: Developmental revision

Reorder sections, rewrite openings or conclusions, reconcile arguments, add missing premises, or replace major metaphors. Require explicit author approval before implementation and again before merge.

Default production work to Level 2. Escalate individual passages, not whole volumes, when the evidence requires it.

## Quality gates

### Language gate

- Zero em dashes, en dashes, or two-hyphen prose punctuation in changed source
- No unresolved high-confidence detector findings
- No new canned transitions or generic uplift introduced by revision
- Read-aloud pass completed

### Meaning gate

- Every changed claim compared with its original
- No unapproved shift in scope, modality, causality, chronology, or evidentiary status
- All unresolved ambiguities raised as author queries
- Independent semantic review reconciled

### Literary gate

- Authorial profile remains recognizable
- Protected images, lines, and motifs remain intact or explicitly approved
- Intentional repetition distinguished from redundancy
- Independent literary review reconciled

### Structural gate

- Markdown remains valid
- Headings, identities, and section boundaries are the strongest editorial choices, regardless of their historical wording
- Every superseded section, chapter, and part route is protected with an alias
- Every ambiguous section successor has an explicit reviewed mapping
- Every structural successor that is not uniquely determined has an explicit reviewed route mapping
- Technical continuity ownership is unique, and reading history survives public ID changes
- Legacy section and paragraph fragments land on the related current passage or fall back safely to its section
- The append-only route ledger is current
- Import report shows no accidental collapse, fragmentation, reordering, or renaming

### Publication gate

- `npm run manuscripts:debt`
- `npm run manuscripts:import`
- `npm run manuscripts:preserve-links -- --base HEAD --write`
- `npm run manuscripts:compile`
- `npm run manuscripts:audit-history -- --summary`
- `npm run manuscripts:versions`
- `npm run manuscripts:validate`
- `npm run readme:update`
- `npm run validate`
- `npm run test:e2e`
- Audio impact checked and documented
- Pull request approved by the author before merge

## Metrics that matter

Track:

- Source words reviewed
- Sentences reviewed by disposition
- Sentence ledger completion and review status
- Structure ledger completion and review status
- Exact reconstruction of the declared current sentence and structure scope
- Slop review completion across all 24 catalog categories
- Detector findings before and after, by rule
- Prohibited punctuation before and after
- Author queries opened and resolved
- Editorial debt opened, carried, and resolved
- Semantic review findings and corrections
- Literary review findings and corrections
- Factual claims verified, corrected, or left unresolved
- Headings, routes, aliases, and section IDs changed
- Audio sections invalidated and republished
- Revision density by volume

Do not optimize for the greatest number of changed sentences, the lowest possible reading grade, or zero uses of every flagged pattern. Those targets reward vandalism with excellent dashboards.

## Risks and controls

| Risk | Control |
| --- | --- |
| Semantic drift hidden by fluent prose | Original-to-revision comparison plus independent semantic review |
| Voice flattened across volumes | Volume profiles, control passages, literary review, author approval |
| Poetry clarified into lifelessness | Protected images, read-aloud proof, explicit ambiguity queries |
| Detector used as a mechanical editor | Findings remain nonbinding except prohibited punctuation |
| Domain terms purged as repetition | Contextual review and protected terminology register |
| Strong claims weakened into mush | Preserve exact modality and distinguish uncertainty from evasion |
| Weak claims polished instead of repaired | Logic pass and author query before recasting |
| Structure or links broken | Source-only edits, import inspection, aliases, manuscript validation |
| Old identities constrain better headings or sections | Let identities evolve and preserve access through route history |
| A similarity match maps an old section to the wrong successor | Similarity never writes lineage, and changed-content successors require explicit review |
| Chapter or part links disappear while section links survive | Append-only route ledger covers section, chapter, and part lineage |
| Audio silently becomes stale | Track `audioVersionId` changes and republish immutable versions |
| Review fatigue lowers standards | Small batches, fresh reviewers, one coherent pull request at a time |
| Cross-volume obligations disappear into review prose | Append-only editorial debt items, generated index, source evidence, and paydown history |
| Version history points at the wrong text | Verify provenance behavior before production and stop on false commit attribution |

## First execution decision

The author has explicitly authorized the first production draft wave for Volumes I, II, and III before pilot approval. Complete their developmental maps, voice cards, sentence and structure ledgers, revisions, independent reviews, publishing workflow, and review pull requests in one continuous program. Use the Volume III pull request as the primary tone and strategy checkpoint. Do not merge any volume until the author explicitly approves its prose. Continue later waves only after that checkpoint. Complete each volume's strict audit before marking it editorially finished. Activate the global hard failure only after all nine volumes and the master ledger pass together.
