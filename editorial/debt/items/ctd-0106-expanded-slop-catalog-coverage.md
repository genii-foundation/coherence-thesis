---
id: CTD-0106
title: Review the corpus against catalog categories 4.25 through 4.29
status: open
kind: literary
severity: medium
scopes: ["volume-1", "volume-2", "volume-3", "volume-4", "volume-5", "volume-6", "volume-7", "volume-8", "volume-9", "master-ledger", "corpus"]
sources: ["editorial/standards/editorial.md", "editorial/guides/manuscript-editorial-plan.md", "scripts/editorial/lint.ts"]
discovered: 2026-07-24
updated: 2026-07-24
resolved:
discoveredIn: editorial-standards/catalog-expansion
---

## Debt

The AI slop pattern catalog gained five categories: participial commentary (4.25), colon reveal (4.26), weasel attribution (4.27), inanimate agency (4.28), and formatting decoration (4.29). Every completed slop review covered categories 4.1 through 4.24 only. No volume has a recorded judgment for the five new categories.

The published reviews remain accurate about what they examined. The corpus now carries a coverage gap rather than a completed pass.

## Evidence

Nine volume slop reviews record a verdict against 24 categories, including `editorial/reviews/volumes/volume-08/2026-07-09-production-pass/slop-review.md` and the corresponding records for volumes 7 and 9. Each states the reviewed range in its status line.

The detector covers four of the five additions. A first sweep of current `main` reports zero findings for `rhetoric.participial-commentary` and `citation.weasel-attribution`, five for `syntax.inanimate-agency` in volumes 1 and 2, and ten for `format.decorative-heading` in the master ledger decision headings. Category 4.26 has no detector because a colon-reveal pattern cannot be separated from legitimate specifying colons, lists, and epigraph attributions without unacceptable noise. It requires reading.

The ten heading findings sit in the same register that CTD-0033 tracks as stale.

## Paydown criteria

- C1. Record a judgment for categories 4.25 through 4.29 for each of the nine volumes and the master ledger, in the existing slop review record or a dated supplement that references it.
- C2. Read every volume for 4.26, which no detector covers, and note the passages examined.
- C3. Resolve or license each `syntax.inanimate-agency` finding against the volume's voice card, since personification may be deliberate in this corpus.
- C4. Resolve the master ledger heading findings, or fold them into CTD-0033 with an explicit note.
- C5. Confirm that each affected review record states the catalog range it covered.

## History

- 2026-07-24: Recorded when the catalog expanded from 24 to 29 categories.
