---
id: CTD-0110
title: Rule on the open author questions the wave-one pass resolved by deleting their evidence
status: query
kind: canon
severity: high
scopes: ["volume-2", "corpus"]
sources: ["editorial/sources/volumes/volume-02/manuscript.md", "editorial/evidence/reviews/volumes/volume-02/2026-07-09-wave-one/baseline.md", "editorial/evidence/calibration/volume-02/v02-the-readers-part.json", "editorial/evidence/calibration/volume-02/v02-a-proposal-for-the-threshold-ahead.json", "editorial/evidence/calibration/volume-02/v02-if-you-are-already-doing-the-work.json", "editorial/evidence/calibration/volume-02/v02-if-you-are-not-sure.json"]
discovered: 2026-07-30
updated: 2026-07-30
resolved:
discoveredIn: volume-2/2026-07-30-baseline-re-render
---

## Debt

The wave-one editorial pass changed passages that an open author query had explicitly reserved for the author, and it changed them in the direction that made the query appear resolved.

`R-LEDGER-WINS` governs the case where a recorded decision exists and an older baseline contradicts it. This is the inverse case. No decision existed, the ledger had recorded that no decision existed, and the pass made one anyway by rewriting the text the decision was about. This is not a prose defect and no catalog category names it. It is a finding about the pass, and it needs an author ruling rather than an editorial repair.

## Evidence

CTD-0038 asks the author to choose an autonomous, conscripting, or deliberately intermediate reader relationship for Volume II. Its own evidence states that the baseline was consistently more conscripting and that the revised posture is a substantive philosophical change rather than neutral copyediting. The item's status is `query`.

The pass nevertheless changed all three passages the question turns on:

- `v02-the-readers-part`. Four passive sentences claiming the reader already perceived the destabilization, the fragmentation, the work, and the threshold were replaced with `Readers must decide what, if anything, the account clarifies`. Two full paragraphs were rewritten rather than compressed.
- `v02-a-proposal-for-the-threshold-ahead`. The sentence `some part of you recognizes the work being asked of you in what you can see` was deleted, along with `Most readers do not finish books like this`. Nothing was put in their place.
- `v02-if-you-are-already-doing-the-work`. `you are not as alone as the conditions make you feel` was hedged to `you may be less alone than the surrounding conditions suggest`.

CTD-0038 records the resulting state as its blocking finding: the two closings came to use incompatible theories of reader consent. That incompatibility was produced by the pass changing one closing and not, at the time the item was written, the other.

Counter-evidence was looked for and found. In `v02-if-you-are-not-sure` the baseline is the more permissive text and the pass made it directive, replacing `What helps, in such cases, is to begin` with the imperatives `begin` and `trust`. This cuts against reading the changes as a single doctrine. Separating the two axes:

- On claims about the reader's inner state the pass moved consistently toward autonomy, in three sections.
- On directive mood it moved the other way, in one section.

These are different axes, so the counter-example neither confirms nor refutes a doctrine. It shows the pass was applying a repeated local judgment rather than a stated position. That is the more accurate description and the more difficult one, because a doctrine can be argued with and a repeated local judgment presents nothing to argue against.

## Paydown criteria

- C1. Rule on CTD-0038 directly: choose the autonomous, conscripting, or intermediate reader relationship, and record the ruling with its scope.
- C2. Apply the ruling across the full direct-address sequence as one unit. The 2026-07-30 re-render restored all four sections to their baseline forms, which are mutually consistent and consistently conscripting, so the author is choosing between one coherent position and a documented alternative rather than between two halves of two positions. The pass's versions remain available in the wave-one shipped text.
- C3. Decide whether the heading `The Reader's Part` or the baseline `What This Asks of the Reader` matches the ruling. The two headings encode the two positions and the change is a continuity decision.
- C4. State whether a future editorial pass may change text that an open ledger query has reserved. If not, name the check that prevents it, since no current validation gate detects this and the shipped prose was internally coherent and read as an improvement.

## History

- 2026-07-30: Recorded during the Volume II baseline re-render, after four closing sections were calibrated against the baseline and the same pattern appeared in three of them. Raised as an item rather than as a rule in `editorial/method/standard.md`, because the finding concerns the conduct of one pass rather than a general obligation about prose, and because the ruling belongs to the author.
