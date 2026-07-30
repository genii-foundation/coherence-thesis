---
name: coherence-editorial-calibration
description: Calibrate the editorial standard against a specific Coherence Thesis section by generating variants, comparing them to the immutable baseline in a rendered bench, capturing the author's rulings, and promoting corpus-scoped rulings into named obligations. Use when a passage reads worse after an editorial pass, when prose feels truncated, flattened, or off in register, when deciding between competing revisions of a section, when recording what an editorial conversation concluded so a later pass inherits it, and when adding or revising rules in editorial/method/standard.md.
---

# Editorial Calibration

Fix the rule, not just the sentence. A better paragraph helps one passage. A better obligation helps every passage no one has read yet.

## Load canonical guidance

- `editorial/method/schemas/calibration-record.md` before creating or changing a record.
- `editorial/method/standard.md` before proposing any variant, and again before promoting a ruling into a rule.
- The volume's `voice-card.md` before reading the passage. It is binding under `R-VOICE-BIND`.

## Start or resume a session

Resolve the section identity first, then render the bench.

```bash
npm run editorial:compare -- --section <section-id>
```

Output lands at `generated/calibration/<section-id>.html`, which is disposable and never committed. Open it in the browser pane. If a record does not exist yet, create one from the schema before rendering.

To view it over the dev server rather than the file system, copy it under `public/data/` and serve with `npm run preview:dev`. Both locations are ignored.

## Diagnose before proposing

Never open with a rewrite. Establish what the prior pass did and which rule permitted it.

1. Extract the baseline text from the batch's immutable `baseline.md` and the current text from `manuscript.md`. Never treat the current manuscript as the baseline.
2. Compare sentence counts and the sequence of sentence lengths, not only word counts. Register damage hides inside an unchanged word count.
3. Check every voice card assertion against the current text. Record which hold and which break.
4. For each loss, find the rule, catalog category, or reason code that authorized it. Record it in `authorizedBy`. A finding without that field is a complaint.
5. State in `diagnosis` why the rule fired when it should not have, or why the rule itself was wrong.

## Propose variants

Offer three at first, differing in how hard they compress, not in surface wording. The spread is the instrument: it locates the boundary the author cannot state in advance.

Include at least one variant that is deliberately too aggressive. A rejected variant is evidence about where a limit lies, and it belongs in the record.

Label by positional descent. Roots take letters. A child of `A` is `A1`, its child `A11`, a sibling branch `A2`. Label and grid position then carry the same information.

For every variant record `reasoning` entries keyed `applied`, `kept`, `cut`, `error`, `cost`, or `remaining`. Record your own errors. A record that shows only successes flatters the method and teaches nothing.

## Capture rulings

Write the author's decision in the author's terms, not as a paraphrase that smooths it.

Set `scope` deliberately, because it governs reuse:

- `section` settles this passage only.
- `volume` constrains the volume and belongs in its voice card.
- `corpus` constrains every future pass and must produce a named obligation.

Mark `by` as `author` or `editorial-agent`. Craft decisions may be taken under delegated authority. Canon, doctrine, and claim content are always author decisions, and are never resolved to make a sentence land.

## Promote a ruling into a rule

A corpus-scoped ruling is not finished until it is stated as an obligation that generalizes.

1. Write it without quoting the passage that produced it. If it cannot be stated that way, no rule has been found, only a preference about that passage.
2. Give it a stable identifier and add it to the rule index in section 12 of the standard.
3. Place the obligation in the section an editor would consult, not in an appendix.
4. Record the identifier in the record's `rulesDerived`.

Never illustrate a rule with corpus text. An editor who has read an approved passage reproduces its cadence and vocabulary in volumes that need neither.

## Prove the rule is sufficient

Before settling a record, re-derive the approved variant from the baseline using only the standard and the voice card, without reading the stored text. Compare.

If the rules do not reproduce it, they are incomplete and the gap is the next rule. Record the outcome in `regenerationTest`. This is the only check that distinguishes a codified method from a memorized answer.

## Settle and commit

Set `status` to `settled` once every finding has a rule and `openQuestions` is empty. A settled record is never edited to match a later opinion. A changed judgment supersedes it and the superseded record remains as history.

Commit the record, the standard change, and any voice card change together, so the obligation and the evidence that produced it arrive in one revision.

Run `npm run editorial:validate` before committing, and `npm run validate` before opening a pull request.

## Carry work forward

The next section inherits the rules, not the prose. Open its record, render its bench, and diagnose from its own baseline. Findings that recur across sections are the strongest candidates for promotion, because a rule that fires twice in unrelated passages is describing the method rather than the passage.
