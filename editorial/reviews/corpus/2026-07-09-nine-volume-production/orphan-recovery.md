# Editorial Orphan Recovery

Recovery completed: 2026-07-13

## Purpose

This record explains which recent editorial artifacts were recovered into pull request 112, where they came from, and which claims still require reconciliation. It prevents historical evidence from being mistaken for fresh approval.

## Recovered material

Closed pull request 100, branch `edit/volumes-one-through-three`, contained the only complete durable record of the nine volume production pass. Pull request 112 contained the revised manuscripts and human editorial letters, but none of the following evidence:

- Nine volume voice cards.
- The wave one review records and exhaustive sentence and structure ledgers for Volumes I through III.
- The production pass review records and exhaustive sentence and structure ledgers for Volumes IV through IX.
- The wave one summary and nine volume production summary.

All of that material is recovered here from commit `9db82a15e2af6f1594720511276afb2674c06815`. The ledgers retain their original baseline commit, hashes, dispositions, review states, result locations, and open queries. The recovery does not convert any query into approval.

## Related closed work

Closed pull request 98 supplied the editorial review system, standards, schemas, link continuity tools, and plan. Those durable parts already reached the repository through the later focused pull request stack. Its remaining branch diff is superseded implementation history, not missing review evidence.

Closed pull request 101 contained an earlier assistant specific skill, generated manuscript fragments, two source revisions, changelogs, and an older plan. Its useful manuscript work and editorial analysis were superseded by pull requests 105, 112, and 113. Its generated fragments conflict with the source first publishing model. No files from that branch are recovered here.

No other remote branch contains unique recent editorial evidence that belongs in pull request 112.

## Reconciliation against pull request 112

The recovered review snapshot was exact for commit `9db82a15e2af6f1594720511276afb2674c06815`. Pull request 112 later changed six sources and reduced the corpus from 106,614 to 106,613 words. It also renamed Volume VI from *The Smallest Nest* to *The Nest*.

The sentence ledger for Volume I still reconstructs the current source. The current structure validator reports baseline coverage differences in the recovered ledgers, and the Volume II sentence ledger reports a changed citation attachment. Volume VI also requires source path reconciliation because its baseline file used the former name. These are explicit open technical gates. The recovered summaries and ledgers must not be described as exact for the current pull request head until every sentence and structure validator passes against it.

## Approval state

All nine voice cards remain pending author approval. The review records retain their factual, scientific, medical, trauma, historical, cultural, legal, financial, security, quotation, safeguarding, implementation, and program status queries. Recovery preserves judgment already performed. It does not manufacture consent, evidence, or truth through the sacrament of moving files between branches.
