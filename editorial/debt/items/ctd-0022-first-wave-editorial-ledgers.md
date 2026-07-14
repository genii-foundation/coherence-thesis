---
id: CTD-0022
title: Complete first-wave sentence and structure ledgers
status: open
kind: technical
severity: high
scopes: ["volume-1", "volume-2", "volume-3"]
sources: ["editorial/README.md", "docs/manuscript-editorial-plan.md"]
discovered: 2026-07-09
updated: 2026-07-11
resolved:
discoveredIn: first-editorial-wave
---

## Debt

The isolated prose passes intentionally deferred their machine-readable sentence and structure ledgers until all three sources could be imported together against one stable baseline.

## Evidence

All six ledgers now exist and validate against immutable base `29c0ffdc7023e8cda6d7232d915b392b6c8eb163` and the complete current sources.

- Volume I sentence ledger: 784 records, comprising 309 approved, 424 reviewed, and 51 query records.
- Volume I structure ledger: 81 records, comprising 66 approved, 8 reviewed, and 7 query records.
- Volume II sentence ledger: 2,062 records, comprising 246 approved, 752 reviewed, and 1,064 query records.
- Volume II structure ledger: 191 records, comprising 89 approved, 73 reviewed, and 29 query records.
- Volume III sentence ledger: 2,299 records, comprising 35 approved, 1,383 reviewed, and 881 query records.
- Volume III structure ledger: 281 records, comprising 156 approved, 47 reviewed, and 78 query records.

Every baseline sentence and structural unit is accounted for, and every ledger reconstructs its complete current source exactly. Records requiring author, semantic, evidentiary, or structural judgment remain marked `query`.

## Paydown criteria

Initialize both ledgers for each volume, account for every baseline sentence and structural unit, reconcile all semantic and literary reviews, validate exact current-source reconstruction, and record any author queries without falsely marking them approved.

## Validation

The following six commands passed:

```bash
npm run manuscripts:editorial-ledger -- --base 29c0ffdc7023e8cda6d7232d915b392b6c8eb163 --current WORKTREE --source editorial/sources/volumes/volume-01/manuscript.md editorial/reviews/volumes/volume-01/2026-07-09-wave-one/sentence-ledger.jsonl
npm run manuscripts:structure-ledger -- --base 29c0ffdc7023e8cda6d7232d915b392b6c8eb163 --current WORKTREE --source editorial/sources/volumes/volume-01/manuscript.md editorial/reviews/volumes/volume-01/2026-07-09-wave-one/structure-ledger.jsonl
npm run manuscripts:editorial-ledger -- --base 29c0ffdc7023e8cda6d7232d915b392b6c8eb163 --current WORKTREE --source editorial/sources/volumes/volume-02/manuscript.md editorial/reviews/volumes/volume-02/2026-07-09-wave-one/sentence-ledger.jsonl
npm run manuscripts:structure-ledger -- --base 29c0ffdc7023e8cda6d7232d915b392b6c8eb163 --current WORKTREE --source editorial/sources/volumes/volume-02/manuscript.md editorial/reviews/volumes/volume-02/2026-07-09-wave-one/structure-ledger.jsonl
npm run manuscripts:editorial-ledger -- --base 29c0ffdc7023e8cda6d7232d915b392b6c8eb163 --current WORKTREE --source editorial/sources/volumes/volume-03/manuscript.md editorial/reviews/volumes/volume-03/2026-07-09-wave-one/sentence-ledger.jsonl
npm run manuscripts:structure-ledger -- --base 29c0ffdc7023e8cda6d7232d915b392b6c8eb163 --current WORKTREE --source editorial/sources/volumes/volume-03/manuscript.md editorial/reviews/volumes/volume-03/2026-07-09-wave-one/structure-ledger.jsonl
```

The completion checks intentionally preserve `reviewed` and `query` records. They prove exhaustive coverage and exact reconstruction without pretending that unresolved editorial judgments have author approval.

## History

- 2026-07-09: Recorded when the isolated volume passes deferred ledger creation to the integrated publishing pass.
- 2026-07-09: Completed all three sentence ledgers and all three structure ledgers against immutable base `29c0ffdc7023e8cda6d7232d915b392b6c8eb163`.
- 2026-07-09: Validated exhaustive baseline coverage and exact current-source reconstruction for 5,145 sentence records and 553 structural records.
- 2026-07-09: Preserved 1,996 sentence queries and 114 structure queries for author, semantic, evidentiary, and structural judgment.
- 2026-07-09: Resolved the technical ledger debt. Publication approval remains blocked by the separate semantic, slop, evidence, author approval, and audio gates.
- 2026-07-11: Reopened during the pull request split because the ledger artifacts and their validation tooling are not present in this branch or main.

## Prior paydown

The unmerged editorial revision produced complete ledgers and reconstruction evidence. That work may be imported through a focused review-evidence pull request. Until then, this branch retains the evidence as prior work without claiming repository paydown.
