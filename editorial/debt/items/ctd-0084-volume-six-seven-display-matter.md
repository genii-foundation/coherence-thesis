---
id: CTD-0084
title: Repair malformed display matter in Volumes VI and VII
status: open
kind: structural
severity: medium
scopes: ["volume-6", "volume-7"]
sources: ["sources/manuscripts/coherence-thesis-vol6-the-smallest-nest.md", "sources/manuscripts/coherence-thesis-vol7-presencing-genius.md", "editorial/debt/audits/2026-07-09-initial-corpus-audit.md"]
discovered: 2026-07-09
updated: 2026-07-09
resolved:
discoveredIn: corpus-audit/2026-07-09
---

## Debt

Volumes VI and VII contain malformed emphasis boundaries in body display matter. The defects are reader-visible and may render differently across Markdown parsers.

## Evidence

Volume VI lines 181, 201, 221, 241, 263, 315, 343, and 379 contain broken emphasis around quoted section names. Volume VII lines 43 to 63 have awkward bold boundaries in the contents. Lines 89, 111, 155, 189, 233, 313, 337, 371, 391, and 415 use a malformed recurring emphasis pattern. Line 226 contains broken emphasis around the ampersand.

## Paydown criteria

Repair every malformed emphasis unit. Add focused parser or rendered snapshot coverage for the affected display patterns. Require zero malformed-emphasis detector findings and visually inspect the generated reader.

## History

- 2026-07-09: Recorded by the initial independent corpus audit.
