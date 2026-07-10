# Manuscript Editorial Plan: De-Slopping The Coherence Thesis

*Prepared July 2026 from a full audit of all nine volumes plus the master ledger (13 parallel analyses, roughly 208,000 words reviewed, every finding quoted verbatim and grep-verified).*

## Purpose

The nine volumes hold strong ideas and passages of real beauty. They also carry the fingerprints of machine drafting at a density that undermines them: em-dash saturation, negation-contrast scaffolds, intensifier varnish, template repetition, and books that narrate their own outlines. This plan rewrites the series sentence by sentence for clarity, legibility, and elegance while protecting the canon, the voice, and every published deep link.

Two findings shape everything below:

1. **The slop is structural, not lexical.** The stock AI word list scores near zero here ("delve" 0, "tapestry" 0, "furthermore" 0). What scores in the thousands is rhetorical scaffolding: 2,893 em dashes, 258 "is not a" constructions, 158 "genuinely", 201 "it is the", 300+ triads, cloned section templates. A banned-word filter would find almost nothing; a sentence-level editorial pass finds everything.
2. **The voice is worth protecting.** The corpus at its best ("The dams know the river's volume in cubic meters per second. They do not know what the river is.") is the target register. The fix for inflation is specificity, not deflation. De-slopping must make the books sound more like their author, not like a style guide.

## Tooling (in place)

- **Skill:** `.claude/skills/manuscript-editorial-review/` defines the editorial process, the full slop-pattern catalog with real examples and fixes, the protected canon and voice inventory, and per-volume notes. Every editorial session starts there.
- **Linter:** `npm run manuscripts:lint-prose` counts banned and budgeted patterns per source file, prose lines only (headings, separators, tables, blockquotes, and epigraph attributions are tracked separately because they are governed by canon and pending global decisions). `--strict` exits nonzero when banned patterns remain, for volumes already cleaned. `--json` for tooling.

The linter enforces the mechanical floor. The skill's judgment rules (deletion test, strawman test, earned test, per-chapter budgets) do the real editorial work; they cannot be regex-checked and are applied by the model during the pass.

## Baseline (July 2026)

Banned counts are prose instances of: em dash, en dash, double hyphen, "it is worth [gerund]", "not merely/simply", stock filler. Re-run the linter for current numbers.

| Volume | Words | Banned | Em dashes (prose) | Headline judgment work |
|---|---|---|---|---|
| I · Humanity's Most Viable Future | 11,574 | 205 | 193 | 68 punchline paragraphs, 6 refusal litanies |
| II · Wielding Intelligence | 35,084 | 272 | 245 | 9 chapter trailers, 6 cloned Is/Is-Not sections, duplicated money passages |
| III · The Providence Imperative | 47,638 | 743 | 706 | "genuinely" 183, 95 italic punchlines, 7x repeated refrain, 12 [verify] markers |
| IV · Architecting Providence | 48,641 | 693 | 675 | 67 negation-contrasts, 36 syllabus openers, 28 cloned codas, continuity bug |
| V · Purposeful | 23,443 | 266 | 255 | 14 of 20 template chapter openers, daisy-chain recaps |
| VI · The Smallest Nest | 7,591 | 129 | 128 | mega-sentences; lightest hand, poetic register |
| VII · Presencing Genius | 10,714 | 177 | 171 | zero markdown headings, duplicated Saturn exposition |
| VIII · A Misanthropic Artifice | 15,383 | 244 | 237 | 22 stage-direction imperatives, italic inflation |
| IX · The Cardinal Scale | 4,980 | 94 | 91 | creed restated 3x, 47 single-word italics |
| Master Ledger | 3,278 | 37 | 34 | canon register; publication decision pending |
| **Total** | **208,326** | **2,860** | | |

## Campaign phases

### Phase 0: Enablement (this PR)

Skill, references, linter, tests, this plan. Done when merged.

### Phase 1: Author decisions (blocks nothing except the items themselves)

Six global decisions and a flag list need the author, not an editor. They are detailed in the skill's volume-notes.md:

1. Epigraph attribution dash convention (one decision series-wide).
2. Heading punctuation for "§N — Title" volumes (a link-preservation event if changed).
3. Heading normalization series-wide, including creating real headings for Vol VII (currently structurally unaddressable for deep links) and converting Vol V/VI ALL-CAPS label paragraphs. Import-pipeline work with section-ledger entries and aliases.
4. Master ledger: exclude from reader compilation, or edit to publishable form.
5. Vol I draft blockquotes: delete, move, or keep (owner sign-off; one records deliberately hidden canon).
6. Vol III [verify] markers: resolve, keep as honesty device, or restyle.

Flag list requiring canon rulings: Vol IV Chapter 24 continuity contradiction (offer declined in body, accepted in coda), Vol IV citation names (Mazzucato, Cornforth), Vol IV rename artifacts, Vol V Donna dialogue dash, Vol VII Gibran attribution and "one can only presume", Vol II dedication "testament to", Vol VI lowercase "icons" and the three variant "untapped resource" superlatives.

Editorial passes can start before these are decided; editors flag rather than fix, and the affected sentences are excluded from the pass.

### Phase 2: Calibration on Volume I

Vol I is the entry volume, the smallest full volume, and the punchline-density worst case. Edit it first under the skill, produce the PR with before/after metrics, and get author sign-off on the register of the diff. This calibrates every later pass; disagreements about tone cost one small volume instead of nine.

Machine time: about one conversation. One PR on an `edit/` branch.

### Phase 3: The heavy volumes (III, then IV)

Vols III and IV hold half the corpus's banned instances (1,436 of 2,860) and the majority of every high-severity marker. Each is roughly 48,000 words and needs chunked passes: structural sweep first (recaps, refrains, clones, duplicates), then the sentence pass in 2,000 to 4,000 word chunks, then a whole-volume diff self-review.

These two volumes justify a multi-agent workflow: fan out chapters to parallel editor agents that each apply the skill, then a verify stage that re-reads every chunk's diff against the protected inventory and re-lints. Chunk boundaries at section headings only, so no agent ever edits across a heading.

Machine time: two to three conversations per volume. One PR per volume.

### Phase 4: The middle volumes (II, then V)

Vol II is mostly structural surgery (trailers, silhouettes, cloned sections, duplicated passages need ownership decisions) followed by a moderate line pass. Vol V is line work plus template-opener variation, with the Donna material handled at maximum care.

Machine time: one to two conversations per volume. One PR per volume.

### Phase 5: The contemplative and compact volumes (VI, VII, VIII, IX)

Lighter passes with volume-specific registers: VI edits with the lightest hand (poetic register, separator exemptions), VII waits on the heading decision but its prose pass (dash removal, Saturn dedup, "For" drone) can proceed, VIII focuses on stage directions and italic inflation while protecting the lived-memory prologue, IX thins creed repetition and italics in its 5,000 words.

Machine time: about one conversation per volume. One PR per volume.

### Phase 6: Reconciliation and close-out

1. Cross-volume epigraph re-sync: volumes quote one another; after a source volume's line changes, update the quoting sites in one focused pass.
2. Master ledger update: quoted text refreshed from the edited volumes, the "~20x vs 37x" inconsistency reconciled, prose cells de-slopped per the ledger's own rules, and the Phase 1 publication decision applied.
3. Full-series lint: banned at zero for all prose (minus explicitly exempted author decisions), budgeted items under their caps, spot-check by fresh review agents that have not seen the edits.
4. Adopt `manuscripts:lint-prose --strict` for cleaned volumes so regressions fail fast (candidate for `npm run validate` once all volumes are clean).

## Execution rules for every pass

- Run under the `manuscript-editorial-review` skill, with its four required readings, on the strongest available model at high reasoning effort. Sentence-by-sentence means every sentence is read and judged; no regex is ever batch-applied to prose.
- One volume per `edit/` branch per PR. PR bodies start with `(AI Generated).` and carry before/after linter numbers plus the flagged-not-fixed list.
- Headings are byte-frozen during prose passes. All structural edits happen in body text.
- Meaning is preserved exactly; this is line editing. Anything that would change a claim is flagged.
- Full pipeline before every PR: `manuscripts:import`, `manuscripts:compile`, `manuscripts:validate`, then `npm run validate`. An import that collapses, fragments, reorders, or renames sections is rejected and the cause fixed.
- Browser e2e is not required for prose-only edits, per repo policy that text changes cannot affect browser behavior; the compile and validate gates already cover reader data, breadcrumbs, and the search index.

## Quality gates

| Gate | Tool | Bar |
|---|---|---|
| Mechanical floor | `manuscripts:lint-prose` | Banned = 0 in prose for edited volumes; budgeted under caps |
| Canon integrity | Skill protected inventory + master ledger | Every protected item byte-identical in the diff |
| Link integrity | `manuscripts:validate` section ledger | Every published route still resolves; zero heading renames |
| Meaning integrity | Whole-diff self-review + fresh-eyes verify agent | No claim changed; flagged items listed in PR |
| Voice integrity | voice-and-canon.md calibration | Rewrites move toward the target register; author sign-off on Vol I sets the bar |
| Regression | `npm run validate` | Green before every PR |

## Risks and mitigations

- **Canon drift.** A rewrite alters a term or doctrinal sentence. Mitigation: protected inventory is read before every session; diff self-review checks protected items byte-for-byte; the ledger is the arbiter.
- **Voice flattening.** De-slopping converges on generic plain style. Mitigation: calibration rewrites and exemplars in the skill; the rule that concreteness beats deflation; Vol I sign-off before scaling.
- **New slop.** Rewrites grow their own triads and dashes. Mitigation: re-lint the edited file; the self-review step checks for introduced patterns.
- **Deep-link breakage.** A heading edit slips into a prose pass. Mitigation: headings byte-frozen; `manuscripts:validate` fails the build when a published route stops resolving.
- **Meaning drift at scale.** 200,000 words of edits accumulate small shifts. Mitigation: chunked passes small enough to hold every sentence; one volume per PR keeps diffs reviewable; flagged-not-fixed discipline for anything ambiguous.
- **Repetition across volumes goes unseen.** Per-volume passes miss cross-volume echoes. Mitigation: Phase 6 reconciliation pass plus the audit's cross-volume findings already recorded in the skill.

## Definition of done

A volume is done when its PR shows banned patterns at zero (or an explicit author-decided exemption), budgeted patterns within caps, all protected material byte-identical, `npm run validate` green, and the author has approved the diff. The series is done when all ten files pass, the reconciliation pass has landed, and `--strict` linting guards the result.

## Machine-time summary

About twelve to sixteen focused conversations across the campaign: one for calibration (Vol I), four to six for the heavy volumes (III, IV), two to four for the middle volumes (II, V), four for the compact volumes (VI to IX), and one for reconciliation. Author time is limited to the Phase 1 decisions and per-PR diff approvals.
