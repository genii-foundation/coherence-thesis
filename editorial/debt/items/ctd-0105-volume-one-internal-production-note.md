---
id: CTD-0105
title: Remove internal production notes from published prose
status: open
kind: literary
severity: high
scopes: ["volume-1", "volume-8", "site"]
sources: ["editorial/sources/volumes/volume-01/manuscript.md", "editorial/sources/volumes/volume-08/manuscript.md", "editorial/reviews/volumes/volume-01/2026-07-09-wave-one/review.md", "editorial/debt/items/ctd-0050-volume-one-promised-back-matter.md", "editorial/debt/items/ctd-0106-volume-eight-appendix-b-carryover.md"]
discovered: 2026-07-13
updated: 2026-07-25
resolved:
discoveredIn: semantic-cross-reference-audit/volume-01
---

## Debt

The corpus publishes internal production notes inside reader-facing prose. These describe drafting instructions, alignment status, preserved constraints, later carryover work, and approval tasks. They are production metadata, not manuscript prose.

Volume I carries one after the stated end of the book. Volume VIII carried one at the end of Appendix B until 2026-07-25. Treat this as a corpus-wide obligation rather than a single-volume defect, and check every volume before closing it.

## Evidence

The canonical Volume I manuscript ends at line 838. A blockquote labeled as the Volume I final pass draft begins at line 842. The Volume I wave-one review classifies these notes as production metadata and records their removal in the proposed revision, but that revision is not yet merged into `main`. CTD-0050 separately preserves the unresolved promises named by the note, so removing the note must not erase those obligations.

Volume VIII Appendix B published an equivalent bracketed note. The single narrator audiobook pass surfaced it independently: the speech provider narrates the appendix and then stops at the bracket, leaving a 40 word unanchored tail against a 12 word alignment ceiling. A production note is therefore not only a reading defect, it silently breaks audio word timing. CTD-0106 preserves the obligations that note carried.

## Paydown criteria

Remove every internal production note from canonical reader-facing prose through approved manuscript revisions. Reimport and inspect the affected sections, confirm no internal drafting instruction renders in the reader, preserve each unresolved deliverable in the tracking item for that volume, and retain author approval as the merge gate for each manuscript revision. Audit the remaining volumes for the same pattern before closing.

## Partial paydown

The Volume VIII Appendix B note was removed from canonical prose on `main` on 2026-07-25 with author approval, during the single narrator audiobook pass. Its obligations moved to CTD-0106.

That removal does not carry into the condensed edition. The nine volume revision reworks the same appendix and ends it with a restated note, no longer bracketed, beginning "Figures in 'The Present Tense' are time stamped to mid 2026". Merging the revision therefore reintroduces a production note to Volume VIII under the section id `v08-the-state-of-2026`. Both Volume I and Volume VIII remain outstanding once that edition lands.

## History

- 2026-07-13: Recorded when the semantic cross-reference audit surfaced four high-confidence concept labels inside the published production note.
- 2026-07-25: Widened to a corpus obligation after the audiobook pass found the same pattern in Volume VIII Appendix B. That note was removed and its content obligations recorded as CTD-0106. Volume I is still outstanding.
- 2026-07-25: Reconciled while merging `main` into the nine volume revision. The condensed edition restates the Volume VIII note in unbracketed prose, so the removal recorded above applies to `main` only. An unbracketed note narrates, so it does not break word alignment the way the bracketed one did, but it is still production metadata in reader-facing prose.
