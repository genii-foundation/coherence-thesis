# Calibration Record Schema

A calibration record is the durable memory of one editorial conversation about one section. It exists so that a judgment reached once is never relitigated, and so that every rule in the standard can be traced to the passage that exposed the need for it.

Commit one record per calibrated section at:

```text
editorial/evidence/calibration/<editorial-id>/<section-id>.json
```

Records are durable tracked editorial state. No build, preview, test, import, or preparation command may write them. They change only through an explicit command and an intentional commit.

## Why the record exists

The first nine volume pass produced 12,179 ledger records and no memory. Its decisions live in reason codes that name operations rather than reasons, so a later pass cannot tell an intentional exception from an oversight and will remove the same construction again.

A calibration record fixes that by storing three things a ledger cannot: what a specific loss cost, what the author ruled about it, and which general obligation the ruling produced.

## Required fields

- `schemaVersion`: integer, currently `1`
- `sectionId`: the canonical section identity, such as `v01-orientation`
- `editorialId`: `volume-01` through `volume-09`, or `corpus`
- `baseline`: `{ batchId, path, sha256 }` identifying the immutable source the variants were derived from
- `status`: `open`, `settled`, or `superseded`
- `findings`: what the prior pass lost or damaged, one entry per defect
- `generations`: the variants explored, in lineage order
- `rulings`: the author's decisions, each one binding on future passes
- `rulesDerived`: identifiers this calibration contributed to the standard's rule index
- `openQuestions`: judgments the author has not yet made
- `debtImpact`: debt items the section touches, with effect and note; an empty array records that the section touches none
- `debtAudit`: a dated audit identifier, durable record path, and result when a later ledger audit amends the record

## `findings`

Each entry records one defect in the prior pass.

- `id`: stable within the record, such as `F1`
- `summary`: what was lost, in the work's own terms
- `evidence`: quoted baseline text and the text that replaced it
- `authorizedBy`: the rule, catalog category, or reason code that permitted the loss
- `diagnosis`: why that rule fired when it should not have, or why the rule itself was wrong

The `authorizedBy` field is what makes a finding actionable. A complaint about a sentence produces a better sentence. A finding that traces the sentence to the rule that authorized it produces a better standard.

## `generations`

Each entry is one explored variant. Full variant text is recorded here deliberately. The record is evidence of how a judgment was reached, and a later reader cannot evaluate a ruling without seeing what was ruled on.

- `label`: `A`, `B`, `A1`, `A11`, and so on
- `derivedFrom`: the parent label, absent for a root
- `status`: `rejected`, `basis`, `candidate`, or `approved`
- `text`: the full variant prose
- `reasoning`: `[{ kind, note }]` where `kind` is `applied`, `kept`, `cut`, `error`, `cost`, or `remaining`
- `metrics`: `{ words, sentences, deltaPercent, cadence }`

Label descent is positional. A root takes a letter. Its child appends `1`, its grandchild appends `1` again, so `A`, `A1`, `A11` is a single line and `A2` is a sibling branch from `A`. Position and label carry the same information, which lets an interface render ancestry without a separate field.

## `rulings`

A recorded decision or working note. It is binding only when `by` is `author`.

- `id`: stable within the record
- `question`: what was decided
- `decision`: the decision in the author's terms
- `rationale`: why, when the author gave one
- `scope`: `section`, `volume`, or `corpus`
- `by`: `author` or `editorial-agent`

`scope` governs reuse after authority is established. A section-scoped author ruling settles this passage. A corpus-scoped author ruling constrains every future pass and should produce an entry in `rulesDerived`. An editorial-agent entry records reasoning, not author authority, and may not promote itself into a binding corpus rule.

## The example problem

A calibration record stores full variant text. The editorial standard must not.

The distinction matters more than it appears. A record is consulted when working on the section it describes, where the surrounding prose is present and the text is context. The standard is consulted everywhere, where a quoted example becomes a template to imitate. An editor who has read an approved passage will reproduce its cadence, its vocabulary, and its shape in volumes that need none of them.

So a ruling enters the standard as an obligation stated in general terms, verifiable against prose no one has read yet. If a rule cannot be stated without quoting the passage that produced it, the rule has not been found. What has been found is a preference about that passage, and it belongs only in the record.

## Lifecycle

1. A section is opened for calibration. The record is created with `status: open` and its `baseline` fixed to an immutable source.
2. Findings are recorded against the prior pass, each traced to the rule that authorized the loss.
3. Generations are explored and recorded with their reasoning, including rejected ones. A rejected variant is evidence about where a boundary lies.
4. The author rules. Rulings are recorded with scope.
5. Corpus-scoped rulings are generalized into obligations and added to the standard's rule index. Their identifiers are recorded in `rulesDerived`.
6. The record moves to `status: settled`. A settled record is never edited to match a later opinion. A changed judgment supersedes it, and the superseded record remains as history.
7. A later ledger audit may append `debtImpact` or `debtAudit` evidence without rewriting the original findings, variants, rulings, or conclusion.

## Rendering

`npm run editorial:compare -- --section <section-id>` reads the record, resolves the baseline and current text, and writes a comparison view to `generated/calibration/`. The output is disposable and never committed.
