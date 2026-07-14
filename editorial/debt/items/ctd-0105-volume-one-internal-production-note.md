---
id: CTD-0105
title: Remove the internal Volume I production note from published prose
status: open
kind: literary
severity: high
scopes: ["volume-1", "site"]
sources: ["editorial/sources/volumes/volume-01/manuscript.md", "editorial/reviews/volumes/volume-01/2026-07-09-wave-one/review.md", "editorial/debt/items/ctd-0050-volume-one-promised-back-matter.md"]
discovered: 2026-07-13
updated: 2026-07-13
resolved:
discoveredIn: semantic-cross-reference-audit/volume-01
---

## Debt

Volume I currently publishes an internal final-pass production note after the stated end of the book. The note describes drafting instructions, alignment status, preserved constraints, later carryover work, and approval tasks. It is production metadata, not reader-facing manuscript prose.

## Evidence

The canonical manuscript ends at line 838. A blockquote labeled as the Volume I final pass draft begins at line 842. The Volume I wave-one review classifies these notes as production metadata and records their removal in the proposed revision, but that revision is not yet merged into `main`. CTD-0050 separately preserves the unresolved promises named by the note, so removing the note must not erase those obligations.

## Paydown criteria

Remove the production note from canonical reader-facing prose through the approved Volume I manuscript revision. Reimport and inspect the final section, confirm no internal drafting instruction renders after the volume ending, preserve each unresolved deliverable in CTD-0050, and retain author approval as the merge gate for the manuscript revision.

## History

- 2026-07-13: Recorded when the semantic cross-reference audit surfaced four high-confidence concept labels inside the published production note.
