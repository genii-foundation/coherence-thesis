# Publication Approval Schema

A publication approval records the author's authorization to publish one exact
manuscript candidate. It is created only after the wording is settled, the
candidate source is committed, and the author explicitly authorizes
publication.

Store each record at:

```text
editorial/evidence/publication-approvals/<editorial-id>/<approval-id>.json
```

## Shape

```json
{
  "schemaVersion": 1,
  "approvalId": "volume-01/published-2026-08-01",
  "editorialId": "volume-01",
  "checkpointId": "volume-01/published-2026-08-01",
  "parentCheckpointId": "volume-01/original",
  "sourcePath": "editorial/sources/volumes/volume-01/manuscript.md",
  "sha256": "lowercase-sha-256",
  "approvedBy": "author",
  "approvedAt": "2026-08-01",
  "evidencePaths": [
    "editorial/evidence/calibration/volume-01/v01-orientation.json"
  ]
}
```

## Rules

- `approvedBy` is always `author`. An agent may prepare the record but cannot
  supply the authority it claims.
- `checkpointId` is the intended published checkpoint identity.
- `parentCheckpointId` is the latest published checkpoint at approval time.
- `sourcePath` and `sha256` identify the exact approved manuscript.
- `approvedAt` uses `YYYY-MM-DD`.
- `evidencePaths` contains the settled calibration records, approved review
  batch, or other durable editorial evidence supporting the decision.
- Every evidence path stays under `editorial/evidence/` and must exist.
- Changing the candidate bytes invalidates the approval. Create a new approval
  record after the author reviews the changed manuscript.
- Publication approval does not claim deployment succeeded. The checkpoint
  enters the published chain only after production verification.
