# Manuscript Checkpoint Schema

The current canonical manuscript on the confirmed repository revision is the
original for each volume. No earlier repository text outranks it. Every later
published revision becomes another immutable checkpoint with an explicit
parent.

Editorial work may branch from the original or any published checkpoint.
Approved but unpublished prose never replaces the published base.

The lineage manifest lives at:

```text
publishing/continuity/manuscript-checkpoints.json
```

## Manifest

The manifest uses `schemaVersion: 2` and contains exactly one volume record for
each editorial volume. A volume record contains:

- `editorialId`: the stable volume package identity.
- `originalCheckpointId`: the permanent repository original.
- `checkpoints`: the ordered chain of original and published checkpoints.
- `approvedCandidate`: one approved but unpublished candidate, or `null`.

Each checkpoint contains:

- `checkpointId`: a stable identity beginning with the editorial ID.
- `kind`: `original` or `published`.
- `parentCheckpointId`: `null` for the original, otherwise the immediately
  preceding published checkpoint.
- `commit`: the full Git commit containing that manuscript.
- `sourcePath`: the canonical source path at that commit.
- `snapshotPath`: a repository relative byte exact snapshot.
- `sha256`: the lowercase SHA-256 digest of the snapshot.
- `approvalRecordPath`: author publication approval for a published revision,
  or `null` for the original.
- `approvedAt`: the approval date for a published revision, or `null` for the
  original.
- `publishedAt`: the production publication date, or `null` for the original.

An approved candidate contains the same source identity, snapshot, approval
record, and approval date. It has no publication date because it is not yet a
published checkpoint.

## Invariants

- There is exactly one original checkpoint per volume.
- The original has no parent and no invented historical predecessor.
- Published checkpoints form one linear chain from the original.
- Checkpoint IDs are globally unique and never reused.
- Snapshots are required even when the Git commit remains reachable.
- Existing original and published checkpoints are append only.
- Working revisions are not checkpoints or approved candidates.
- An approved candidate never becomes the default editorial base.
- Only explicit author publication approval may stage a candidate.
- Only a verified production commit containing the approved bytes may promote
  that candidate into the published chain.

## Approved publication lifecycle

1. Begin editorial work from the original or latest published checkpoint.
2. Keep directions and variants in ignored working state.
3. After the editor approves finished wording, update the canonical manuscript
   and record the editorial session.
4. Validate the complete source, continuity, semantic links, routes, audio
   impact, and generated reader output.
5. Commit the exact candidate source.
6. After the author authorizes publication, create the publication approval
   record defined in `publication-approval.md`.
7. Stage the approved candidate. This preserves its bytes without changing the
   published base.
8. Merge, deploy, and verify the exact approved bytes in production.
9. Promote the staged candidate using the verified production commit.
10. Commit the updated manifest. Future editorial work now starts from the new
    published checkpoint.

Approval of wording and approval to publish are separate decisions. Neither
approval alone proves that production changed.

## Commands

Validate the complete lineage without writing:

```bash
npm run editorial:checkpoints
```

The one time adoption command records the confirmed repository originals from
an immutable commit. It refuses to run after any revision checkpoint exists:

```bash
npm run editorial:checkpoints -- adopt-originals \
  --commit <full-commit-sha>
```

Stage an author approved candidate:

```bash
npm run editorial:checkpoints -- stage \
  --editorial-id volume-01 \
  --checkpoint-id volume-01/published-YYYY-MM-DD \
  --parent volume-01/original \
  --commit <candidate-commit-sha> \
  --approval-record editorial/evidence/publication-approvals/volume-01/<approval-id>.json
```

Promote it after production verification:

```bash
npm run editorial:checkpoints -- publish \
  --editorial-id volume-01 \
  --checkpoint-id volume-01/published-YYYY-MM-DD \
  --publication-commit <production-commit-sha> \
  --published-at YYYY-MM-DD
```

The publish command fails unless the production commit contains the exact
approved manuscript bytes.
