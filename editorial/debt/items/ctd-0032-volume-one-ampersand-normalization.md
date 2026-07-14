---
id: CTD-0032
title: Restore intentional and citation ampersands
status: resolved
kind: literary
severity: medium
scopes: ["volume-1", "volume-3", "corpus"]
sources: ["editorial/sources/volumes/volume-01/manuscript.md", "editorial/sources/volumes/volume-03/manuscript.md", "editorial/standards/editorial.md"]
discovered: 2026-07-09
updated: 2026-07-14
resolved: 2026-07-14
discoveredIn: author-preview-review
---

## Debt

The first editorial pass expanded the heading `Seed, Sprout, Stem & Soil` to `Seed, Sprout, Stem, and Soil` as a blanket display normalization. It also expanded citation-style final-author ampersands in the Volume III bibliography. The changes weakened the heading's pace and altered bibliographic convention without cause.

## Evidence

The Volume I baseline used the ampersand in the compact heading. During preview review, the author identified the expanded form as less smooth and questioned the practice behind the substitution. A later bibliography audit found twelve Volume III author lists where APA-style ampersands had been changed to prose `and`.

## Paydown criteria

- C1. Restore `Seed, Sprout, Stem & Soil` in the Volume I manuscript.
- C2. Restore the twelve final author ampersands in the cited Volume III bibliography entries.
- C3. Preserve the heading decision and bibliography convention in durable editorial evidence.
- C4. Add a corpus standard that forbids automatic expansion in citations, proper names, quotations, headings, and intentional display matter.

## History

- 2026-07-09: Author identified the normalization as a loss of cadence during the live Volume I preview.
- 2026-07-09: Restored the heading and added the governing editorial rule and voice-card decision.
- 2026-07-09: Restored twelve Volume III bibliographic ampersands and made citation style an explicit protected case.
- 2026-07-13: Reverified the current source and durable review evidence at commit `1165332b82d979383b02d279323f22e9d60db2d8`. The contextual ampersand rule from commit `41337b21cbf43d3f070750a579ba17a148e9bff3` did not survive consolidation into the current canonical standard, so the ticket was reopened. This candidate restores the rule, but closure requires merged verification on current `main`.
- 2026-07-14: Pull request 137 squash merged as `e7fdf9abc23e8a6f021be24c1f69e65989750003`. Reverified all four criteria on that exact `main` revision and confirmed closure.

## Partial paydown

C1 through C3 were already proven when pull request 137 was open. That candidate restored the previously approved contextual ampersand rule in `editorial/standards/editorial.md`, while C4 remained pending until merge. Pull request 137 has since merged, and the confirmed result is recorded below.

## Prior paydown

### Outcome

The ticket was marked resolved on 2026-07-09 after the manuscript repairs and contextual rule were recorded in the editorial review skill reference. Volume I still uses `Seed, Sprout, Stem & Soil`, and Volume III still uses ampersands before final authors in the twelve bibliography cases identified by the review. The rule did not reach the canonical corpus standard during later consolidation, so the earlier closure is incomplete on current `main`.

### Criterion results

- C1: met. The exact heading appears in the current Volume I manuscript.
- C2: met. The current Volume III bibliography contains the twelve restored final author ampersands across eleven cited entries.
- C3: met. The Volume I voice card and review record preserve the author decision, and the Volume III sentence ledger preserves the approved bibliography convention.
- C4: incomplete on current `main`. This candidate restores the corpus rule, but it is not confirmed paydown until merged verification.

### Evidence

- `editorial/sources/volumes/volume-01/manuscript.md` contains the exact heading.
- `editorial/sources/volumes/volume-01/voice-card.md` protects its display punctuation and records the author decision.
- `editorial/reviews/volumes/volume-01/2026-07-09-wave-one/review.md` records the retained heading and approval rationale.
- `editorial/sources/volumes/volume-03/manuscript.md` contains the twelve final author ampersands in the reviewed bibliography passage.
- `editorial/reviews/volumes/volume-03/2026-07-09-wave-one/sentence-ledger.jsonl` records all twelve restored cases under the approved bibliography convention.
- Commit `41337b21cbf43d3f070750a579ba17a148e9bff3` preserved the approved contextual ampersand rule in the editorial review skill reference. The rule is absent from the canonical standard on current `main` and restored by this candidate.

### Validation

Current source inspection found the exact Volume I heading and twelve final author ampersands in the relevant Volume III entries. Repository history proves the contextual rule existed before consolidation, and the candidate restores it to the canonical standard. `npm run editorial:debt` validates the reopened record and register.

### Approval

The Volume I voice card and review record date the author's heading approval to 2026-07-09. The Volume III review evidence marks the bibliography convention approved while keeping unrelated citation research visible.

### Residual risk

The manuscript punctuation restoration remains complete. The missing canonical corpus rule keeps this ticket open until the candidate is merged and reverified. Unverified factual and citation details in the same Volume III bibliography remain active under CTD-0009 and are tracked separately.

### Related debt

- CTD-0009 remains active for Volume III evidence and citation verification.

## Resolution

### Outcome

Resolved on current `main` at `e7fdf9abc23e8a6f021be24c1f69e65989750003`. The intentional Volume I heading, twelve Volume III bibliography ampersands, durable evidence of the specific heading decision and punctuation convention, and canonical contextual rule are all present together.

### Criterion results

- C1: met. `editorial/sources/volumes/volume-01/manuscript.md` contains the exact heading `Seed, Sprout, Stem & Soil`.
- C2: met. The reviewed Volume III bibliography passage contains all twelve final-author ampersands, and the sentence ledger records twelve matching convention-specific reason codes. Each record remains a query for separate factual and citation verification.
- C3: met. The Volume I voice card, review record, and structure ledger preserve the author's heading decision. The Volume III sentence ledger preserves the bibliography convention for all twelve cases.
- C4: met. `editorial/standards/editorial.md` now forbids reflexive ampersand expansion and protects proper names, quotations, citation style, headings, titles, labels, and intentional display matter.

### Evidence

- Pull request 137 merged as `e7fdf9abc23e8a6f021be24c1f69e65989750003` on 2026-07-14.
- `editorial/sources/volumes/volume-01/manuscript.md` contains one exact matching heading.
- `editorial/sources/volumes/volume-03/manuscript.md` contains twelve final-author ampersands in the reviewed bibliography passage.
- `editorial/sources/volumes/volume-01/voice-card.md`, `editorial/reviews/volumes/volume-01/2026-07-09-wave-one/review.md`, and `editorial/reviews/volumes/volume-01/2026-07-09-wave-one/structure-ledger.jsonl` preserve the specific display decision while overall voice-card and review-batch approval remains pending.
- `editorial/reviews/volumes/volume-03/2026-07-09-wave-one/sentence-ledger.jsonl` contains twelve `bibliographic-ampersand-convention-approved` reason codes inside records that remain queries for unrelated evidence work.
- `editorial/standards/editorial.md` contains the contextual corpus rule beginning `Do not expand ampersands by reflex.`

### Validation

Exact-source checks on `e7fdf9abc23e8a6f021be24c1f69e65989750003` found one matching Volume I heading, twelve matching Volume III manuscript cases, twelve matching sentence-ledger reason codes, the specific decision evidence, and the canonical contextual rule. `npm run editorial:debt`, debt and debt queue tests, editorial validation, Updates generation, and full repository validation passed on the closure branch.

### Approval

The author approved the specific Volume I heading restoration on 2026-07-09. The voice card and review record preserve that narrow decision. The Volume III review evidence protects the bibliography ampersand convention while leaving unrelated factual verification visible. Overall voice-card and review-batch approval remains pending and continues to gate pull request 112.

### Residual risk

No unresolved ampersand-normalization obligation remains within this ticket. The Volume III bibliography still contains separate factual and citation questions. Those questions remain active under CTD-0009 and do not weaken the punctuation proof recorded here.

### Related debt

- CTD-0009 remains active for Volume III evidence and citation verification.
