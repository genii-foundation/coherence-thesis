# Nine Volume Production Integration Audit

Audit completed: 2026-07-10

Status: Historical audit of the unmerged editorial revision worktree that became PR 100. Its counts and completion claims do not describe the editorial standards branch or main.

## Scope

This audit recorded the machine integration phase of the first production editorial pass across the nine published source manuscripts in that worktree. It covers source compression, independent review artifacts, sentence and structure ledgers, generated reader data, overview references, section lineage, public aliases, historical routes, and editorial debt. The worktree was later split into focused pull requests, so none of these results alone establishes current repository paydown.

## Result

- Source corpus: 205,048 words before editing and 106,614 words after editing.
- Reduction: 98,434 words, or 48.0 percent.
- Strict editorial audit: all nine sources pass with zero prohibited-punctuation errors.
- Independent review: Volumes IV through IX pass for editorial integration, not publication. Volumes I through III retain their documented semantic and publication-level failures and queries.
- Sentence ledgers: 10,778 records, zero pending, complete baseline coverage, exact current-source reconstruction.
- Structure ledgers: 1,401 records, zero pending, complete baseline coverage, exact current-source reconstruction.
- Current manuscript validation: 534 source and generated manuscript files plus 36 overview references pass.
- Link planner: 551 confirmed predecessor-to-current matches and zero unresolved items.
- Historical audit: 5,833 links checked, including 485 fragments, with zero broken destinations.
- Focused validation: 110 tests pass. Type checking, lint, and 277 unit tests pass.
- Production build: Webpack generates 6,025 static pages. The restricted session denies the port binding required by the default Turbopack build and local browser preview, so rendered proof remains open.

## Link-preservation correction

The first post-write rerun exposed a planner defect. Saved historical identities were written into `content/series/section-lineage.json`, but the next planner invocation looked up only unchanged current IDs. It therefore asked for the same reviewed decisions again.

The planner now resolves previous section IDs, continuity IDs, and historical IDs through the saved lineage owner. It also permits several retired predecessors to share one established successor, which is required for the integrated Volume IV codas. Focused regression tests cover both a deeply rewritten rename and a many-to-one retirement. A clean planner rerun now recognizes all 551 saved matches without receiving any explicit mapping arguments.

The repository gate then exposed a related recorder defect. A historical catalog can name a section by a later public ID even when an earlier identity remains its technical continuity owner. The ledger recorder had stored that later ID as a new owner, creating an entry the current resolver correctly rejected as unrelated. The recorder now selects the saved continuity owner and normalizes its own uncommitted invalid duplicates. The focused regression test covers this case. The resulting append-only ledger contains 12,666 structural records, and manuscript validation accepts every one.

## Debt reconciliation

In the audited worktree, CTD-0074, CTD-0075, and CTD-0095 were marked resolved. The donor outcome was coherent, false Volume III structural references were gone, and all twenty-eight Volume IV codas were reviewed and integrated or retired.

On 2026-07-11, those items were reopened in the focused debt register because the manuscript revisions were not present in the editorial standards branch or main. The earlier work remains recorded as a proposed paydown, not a merged result.

CTD-0076 through CTD-0094 record partial paydown where prose and structure improved but author, evidence, specialist, rendered, program-status, or master-ledger work remains. The debt index preserves those obligations rather than allowing fluent revision to impersonate completion.

## Remaining publication authority

No manuscript is approved for publication by this audit. Author approval remains required for all nine volumes. The deepest compressions require special attention. Open query records identify factual, scientific, medical, trauma, historical, cultural, legal, financial, security, quotation, safeguarding, population, implementation, and doctrinal authority that an editorial model cannot supply.

Audio republication remains deferred until prose and section identities are approved for publication.
