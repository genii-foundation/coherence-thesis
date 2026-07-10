---
name: manuscript-editorial-review
description: Sentence-by-sentence editorial pass over Coherence Thesis manuscripts in sources/manuscripts/. Use when asked to edit, review, de-slop, polish, or elevate manuscript prose, when preparing a volume for publication, or when reviewing a manuscript diff for style. Catches AI-generated prose patterns (em dashes, negation-contrast scaffolds, intensifier inflation, template repetition) while protecting the series voice, canon terms, and deep-link anchors.
---

# Manuscript Editorial Review

This skill turns a manuscript with strong ideas and machine-flavored prose into a manuscript that reads as though a person wrote every sentence. The problem in this corpus is structural, not lexical: the classic AI word list ("delve", "tapestry") scores near zero here, while em-dash saturation, negation-contrast scaffolds, and intensifier varnish score in the thousands. Edit accordingly.

## Required reading, in order

1. [references/slop-patterns.md](references/slop-patterns.md). The pattern catalog: what to catch, real examples from this corpus, and the fix for each.
2. [references/voice-and-canon.md](references/voice-and-canon.md). What must survive editing: canon terms, structural devices, the target register, and calibration rewrites.
3. [references/volume-notes.md](references/volume-notes.md). Per-volume risks, priorities, and known bugs to flag rather than fix.
4. `sources/manuscripts/coherence-thesis-master-ledger.md`. The canon register. Every capitalized term you touch is checked against it.

Do not start editing before reading all four. The cost of a canon error or a broken deep link is higher than the cost of the reading.

## Hard rules

- No em dashes, no en dashes, no double-hyphen constructions in prose. Every removal is a recast (split the sentence, use a colon for definitions, delete decorative asides). Never a mechanical swap for a comma, and never a find-and-replace.
- Never edit `content/manuscripts/` or `public/data/`. Edit `sources/manuscripts/`, then run `npm run manuscripts:compile`.
- Never rename, renumber, or restructure a heading. Heading text anchors stable section IDs for deep links, progress, and audio. If a heading must change, that is a separate link-preservation decision with aliases in `content/series/aliases.json`, not part of a prose pass.
- Never alter canon terms, poems, external quotations, dictionary-style definitions, creeds, refrains, separator glyphs, numbers, or named factual claims. The protect list is in voice-and-canon.md.
- Preserve meaning exactly. This is line editing, not revision. If a sentence's claim would change, leave it and flag it.
- Fix delivery, not honesty. The books' admissions of weakness, failure modes, and self-criticism are their credibility. Cut the framing that congratulates the text for being honest; never cut the honest content.

## The pass, step by step

Work one volume per branch. Branch prefix `edit/`, for example `edit/vol1-editorial-pass`.

**1. Baseline.** Run `npm run manuscripts:lint-prose -- sources/manuscripts/<volume>.md` and record the numbers. They go in the PR body.

**2. Structural sweep before line edits.** Handle whole-block problems first so sentence work is not wasted on text that should not exist: duplicated passages, recap paragraphs, trailer handoffs ("The next chapter turns to..."), syllabus openers ("This chapter examines..."), template clones (coda synonym rotation, repeated disclaimers), and production scaffolding. Body text only. Consult volume-notes.md for the volume's known structural issues.

**3. Sentence pass.** Read the volume in order, section by section, in chunks small enough to hold every sentence in attention (2,000 to 4,000 words). For each sentence ask, in order:
   - Protected? (canon, poem, quote, refrain, exemplar) Leave it byte-identical.
   - Banned pattern? Recast it.
   - Budgeted pattern? Apply the deletion test and the strawman test from slop-patterns.md. Spend budget only on earned instances.
   - Flat or inflated? Push it toward the target register: one abstraction anchored to one concrete image, a named actor with a verb, short declaratives. Do not invent new content to do this; concreteness comes from what the sentence already means.

   Use the highest-capability model and effort available for this pass. Never batch-apply a regex to prose.

**4. Self-review the diff.** Re-read your whole diff against voice-and-canon.md. Check: every protected item byte-identical, no meaning drift, no new slop introduced (rewrites tend to grow triads), rhythm varies across consecutive paragraphs.

**5. Verify.**
```bash
npm run manuscripts:lint-prose -- sources/manuscripts/<volume>.md   # counts must drop; banned should approach 0
npm run manuscripts:import
npm run manuscripts:compile
npm run manuscripts:validate
npm run validate   # before the PR
```
Reject your own import if the parser collapsed, fragmented, reordered, or renamed sections. That means a heading was disturbed; restore it.

**6. PR.** One volume, one PR, `edit:` commit prefix. PR body starts with `(AI Generated).` and includes the before and after lint-prose numbers, the list of flagged-not-fixed items with line references, and confirmation that headings and canon are untouched.

## Flag, don't fix

Some findings need the author, not an editor. Put them in the PR body as a checklist; do not resolve them silently. The standing list is in volume-notes.md and includes continuity contradictions, citation-name errors, rename artifacts, attribution questions, and any edit to canonical dialogue or cross-volume canonical sentences.

## Scoring a review

When asked to review rather than edit, produce: the lint-prose numbers, the ten worst passages with proposed rewrites (before and after), any canon or deep-link risks in the diff under review, and a verdict on whether the text meets the bar in slop-patterns.md. Quote evidence verbatim so it can be grepped.
