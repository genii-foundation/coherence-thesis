# Review Manifest Schema

Every durable volume review batch contains `review.json`. The file is the complete inventory for that batch.

## Shape

```json
{
  "schemaVersion": 1,
  "batchId": "2026-07-09-wave-one",
  "editorialId": "volume-01",
  "approvalState": "pending",
  "standing": "current",
  "scope": {
    "coverage": "complete-volume",
    "sentenceRecords": 784,
    "structureRecords": 81
  },
  "validationState": "validated",
  "openQueryCount": 58,
  "residualRisk": "high",
  "publicationState": "unpublished",
  "baseline": {
    "commit": "full-commit-hash",
    "path": "historical/source/path.md",
    "sha256": "source-hash",
    "snapshotPath": "baseline.md"
  },
  "reviewed": {
    "commit": null,
    "path": "source/path-at-review.md",
    "sha256": "reviewed-source-hash"
  },
  "canonicalSourcePath": "editorial/sources/volumes/volume-01/manuscript.md",
  "evidence": [
    {
      "path": "review.md",
      "sha256": "evidence-hash"
    }
  ]
}
```

## Rules

- `batchId` matches the batch directory name.
- `editorialId` matches the stable volume package directory.
- `approvalState` records author approval of the reviewed manuscript. It is `pending` or `approved`. An approved batch may retain `reviewed` ledger records for wording whose external factual, medical, legal, historical, quotation, or implementation authority remains durable editorial debt. It must not relabel those unverified authorities as approved.
- `standing` is `current`, `historical`, or `superseded`.
- `scope.coverage` is `complete-volume`. Its sentence and structure counts must exactly match the two ledgers.
- `validationState` is `pending` or `validated`. Approval requires validated evidence.
- `openQueryCount` equals all ledger records whose review status is `query`. Approval requires zero open queries and no pending records. Every finalized record is either `reviewed` or `approved`.
- `residualRisk` is `low`, `medium`, `high`, or `unassessed`. The detailed risks remain in the evidence ledgers and review record.
- `publicationState` is `unpublished` or `published`. Published evidence requires author approval.
- `baseline.commit` is a full immutable commit hash. Its path and hash identify the source at that revision.
- `baseline.snapshotPath` is optional for an orphaned baseline commit. It points to a byte exact source snapshot inside the batch and must also appear in `evidence`.
- When Git history contains the baseline commit, validation cross checks the snapshot against that revision. When the commit is unreachable, the hashed snapshot keeps the review reproducible.
- `reviewed.commit` is a full immutable commit hash when the reviewed source was committed. It may be `null` for recovered worktree evidence that remains pending.
- Historical paths remain historical. Do not rewrite them to the current layout.
- `canonicalSourcePath` matches the adjacent volume manifest.
- `evidence` lists every other regular file in the batch. Paths are relative to the batch directory.
- Every evidence hash is the lowercase SHA-256 digest of the file bytes.
- `review.json` never lists itself.
- An approved batch must resolve and reconstruct its reviewed source. A pending recovered batch may retain an unavailable worktree snapshot identity until reconciliation.

Run `npm run editorial:validate` after changing a review manifest or its evidence.
