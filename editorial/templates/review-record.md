# Editorial Review Record Template

Use this structure for each pilot or production batch. Commit it at `editorial/reviews/volumes/<editorial-id>/<batch-id>/review.md`. Commit the companion sentence and structure ledgers beside it as `sentence-ledger.jsonl` and `structure-ledger.jsonl`.

## Scope

- Source file:
- Sections:
- Approximate source words:
- Intervention level:
- Fact checking included:
- Lead model, if exposed by the runtime:
- Review date:

## Authorial profile

- Central claims:
- Register and point of view:
- Characteristic cadence:
- Recurring images and motifs:
- Protected terms:
- Protected lines or passages:
- Known uncertainties:

## Baseline

- Source commit:
- Source file hash:
- Generated catalog hash:
- Section IDs and routes:
- Headings and heading levels:
- Alias and overview references:
- Links, citations, names, and numbers:
- Audit command:
- Finding counts by rule:
- Existing validation result:

## Machine-readable sentence ledger

Record one JSON object per source sentence. Use the source file hash, section ID, and sentence ordinal as the stable address. Follow [sentence-ledger-schema.md](../schemas/sentence-ledger.md), including its rules for splits, merges, moves, and removals.

Required fields:

- `sourceFile`
- `sourceHash`
- `sectionId`
- `sentenceOrdinal`
- `originalHash`
- `originalText`
- `disposition`
- `proposedText`
- `resultLocations`
- `reasonCodes`
- `claimTypes`
- `claimInvariants`
- `citationAttachments`
- `risk`
- `reviewStatus`

- Ledger path:
- Validation method:
- Record count:
- Coverage check against pre-edit source:
- Exact reconstruction check against current source:

## Machine-readable structure ledger

Record one JSON object per baseline Markdown heading or standalone display unit. Follow [structure-ledger-schema.md](../schemas/structure-ledger.md). Account for unchanged headings as deliberately as changed ones.

Required fields:

- `sourceFile`
- `sourceHash`
- `unitType`
- `unitOrdinal`
- `originalHash`
- `originalText`
- `disposition`
- `proposedText`
- `resultLocations`
- `routeImpact`
- `routeOutcome`
- `reviewStatus`

- Ledger path:
- Validation method:
- Record count:
- Coverage check against pre-edit source:
- Exact reconstruction check against current source:

## Editorial decisions

- Repeated habits addressed:
- Representative sentences kept unchanged:
- Representative tightening or recasting:
- Sentences moved or removed:
- Metaphors changed:
- Claims changed with author approval:
- Headings or structure changed:

## Structure and link preservation

| Previous ID | Current ID | Change | Confidence | Editorial decision |
| --- | --- | --- | --- | --- |
| | | | | |

- Route review base commit:
- Route review method:
- Aliases added:
- Alias targets updated:
- Historical section routes verified:
- Historical chapter routes verified:
- Historical part routes verified:
- Explicit mappings supplied:
- Unresolved routes:

## Pull request commentary

Comments are selective correspondence, not a duplicate ledger. List the material judgments that deserve an inline or file-level note.

| Location | Editorial question or tradeoff | Why the author should see it | Comment posted |
| --- | --- | --- | --- |
| | | | |

- Representative pattern explained once:
- Strong original language whose preservation merits notice:
- Related changes grouped into one comment:
- Mechanical edits intentionally left uncommented:
- File-level editorial letter or summary:

## Author queries

1. Question:
   - Location:
   - Why intent cannot be inferred safely:
   - Available options:

## Fact and citation record

| Location | Original claim | Result | Source | Change |
| --- | --- | --- | --- | --- |
| | | | | |

## Independent review

### Tooling evidence

Complete these fields only after the initialized ledgers and all three independent review files are final. The adjudication helper verifies each hash before it changes any ledger status.

- Source file:
- Source hash:
- Initialized sentence ledger hash:
- Initialized structure ledger hash:
- Semantic review hash:
- Literary review hash:
- Slop review hash:

### Semantic review

- Drift found:
- Corrections made:
- Unresolved concerns:

### Literary review

- Voice or rhythm loss found:
- Corrections made:
- Unresolved concerns:

### Slop review

Give the reviewer the complete catalog in [editorial-standards.md](../standards/editorial.md). Record a result for every category. Use `none found`, `corrected`, `intentional`, or `query` in the Result column. Cite locations or explain the judgment in Evidence and action.

| Catalog category | Result | Evidence and action |
| --- | --- | --- |
| 4.1 Throat clearing | | |
| 4.2 Generic transitions | | |
| 4.3 False antithesis | | |
| 4.4 Synthetic symmetry | | |
| 4.5 Abstract noun clusters | | |
| 4.6 Inflated significance | | |
| 4.7 Vague grandeur | | |
| 4.8 Redundant restatement | | |
| 4.9 Repetitive scaffolds | | |
| 4.10 Vague reference | | |
| 4.11 Conceptual laundering | | |
| 4.12 Causal overreach | | |
| 4.13 Faux precision | | |
| 4.14 Sterile hedging | | |
| 4.15 Generic uplift | | |
| 4.16 Performed intimacy | | |
| 4.17 Dramatic fragments | | |
| 4.18 Overexplained metaphor | | |
| 4.19 Mechanical cadence | | |
| 4.20 Lexical monoculture | | |
| 4.21 Empty intensifiers | | |
| 4.22 Exhaustive pairings | | |
| 4.23 Meta claims about the text | | |
| 4.24 Gloss without substance | | |

- Corrections reconciled:
- Intentional exceptions retained:
- Unresolved queries:

## Final proof

- Post-edit audit method and result:
- Prohibited punctuation count:
- Read-aloud result:
- Markdown and heading result:
- Sentence ledger completeness:
- Structure ledger completeness:
- Current source reconstruction:
- Import report result:
- Route and alias result:
- Generated artifact result:
- Audio impact:
- Repository validation:

## Representative comparison

### Before

> Original passage

### After

> Revised passage

### Why

Explain the gain in meaning, clarity, cadence, or voice. Name any tradeoff.

## Residual risk and approval

- Open questions:
- Residual risks:
- User approval status:
