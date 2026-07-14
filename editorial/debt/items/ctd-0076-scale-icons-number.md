---
id: CTD-0076
title: Enforce the Scale and ICONS singular and plural distinction
status: open
kind: terminology
severity: medium
scopes: ["volume-4", "volume-6", "volume-8", "volume-9", "master-ledger", "corpus"]
sources: ["editorial/sources/volumes/volume-04/manuscript.md", "editorial/sources/volumes/volume-06/manuscript.md", "editorial/sources/volumes/volume-08/manuscript.md", "editorial/sources/volumes/volume-09/manuscript.md", "editorial/sources/corpus/master-ledger.md", "editorial/audits/2026-07-09-initial-corpus.md"]
discovered: 2026-07-09
updated: 2026-07-10
resolved:
discoveredIn: corpus-audit/2026-07-09
---

## Debt

The corpus defines a single community as a Scale and reserves ICONS for the plural network, but later volumes still use ICON or ICONS for one community and sometimes lowercase the proper term.

## Evidence

Volume IV line 1605 says each ICON remains itself and line 1631 says the first ICON proves the pattern. Volume VI line 489 lowercases icons and uses it for communities. Volume VIII line 242 calls the Cardinal Scale the first ICONS. Volume IX lines 47 and 67 say ICONS is plural by design and one community is a Scale. The master ledger lines 164 to 165 call for this repair, while lines 198 to 202 claim the prior pass completed it.

## Paydown criteria

Replace every singular ICON or ICONS with Scale unless an exact quotation requires otherwise. Preserve uppercase ICONS for the plural proper term. Update the master ledger only after a corpus search proves zero ambiguous singular uses.

## History

- 2026-07-09: Recorded by the initial independent corpus audit after surviving uses disproved the earlier completion claim.
- 2026-07-10: Recorded source-side correction across Volumes IV through IX, while retaining the debt because the master ledger still contains singular `ICONS community` language.
- 2026-07-10: Confirmed that the revised source wording survives final ledger reconstruction and the validated 534-file manuscript import; retained the item for the master-ledger repair and final corpus terminology search.

## Partial paydown

The current production sources consistently use `Scale` for one community and `ICONS` for the plural network. The independent semantic records at `editorial/reviews/volumes/volume-04/2026-07-09-production-pass/semantic-review.md`, `editorial/reviews/volumes/volume-05/2026-07-09-production-pass/semantic-review.md`, and `editorial/reviews/volumes/volume-06/2026-07-09-production-pass/semantic-review.md` explicitly confirm the repair, and Volumes VIII and IX state the distinction directly. The revised wording is covered by the final ledger set, which passes baseline coverage and exact current reconstruction with zero pending records, and by manuscript validation across 534 generated files and 36 overview references. The route planner also reports 551 predecessor matches with zero unresolved routes, and the historical audit reports 5,833 hrefs with zero broken links.

The item remains open because `editorial/sources/corpus/master-ledger.md` still contains `A single ICONS community` and `one ICONS community` language. A final corpus terminology search and the master-ledger correction are still required.
