# Manuscript Checkpoint Schema

The original manuscript for each volume is immutable. Every published revision
is another immutable checkpoint with an explicit parent. Editorial work may
branch from any checkpoint without replacing or relabeling the text that came
before it.

The lineage manifest lives at:

```text
publishing/continuity/manuscript-checkpoints.json
```

## Manifest

The manifest uses `schemaVersion: 1` and contains exactly one volume record for
each editorial volume. A volume record contains:

- `editorialId`: the stable volume package identity.
- `originalCheckpointId`: the checkpoint designated as the repository original.
- `checkpoints`: ordered checkpoint records from the original forward.

Each checkpoint contains:

- `checkpointId`: a stable identity beginning with the editorial ID.
- `kind`: `original` or `published`.
- `parentCheckpointId`: `null` only for the original, otherwise an earlier
  checkpoint in the same volume.
- `commit`: the full immutable Git commit containing the source identity.
- `sourcePath`: the source path at that commit.
- `snapshotPath`: a repository-relative byte-exact snapshot.
- `sha256`: the lowercase SHA-256 digest of the snapshot.

## Invariants

- There is exactly one original checkpoint per volume.
- The original has no parent.
- Every published checkpoint has one earlier parent in the same volume.
- Checkpoint IDs are globally unique and never reused.
- Snapshots are required even when the commit remains reachable. Git history is
  useful provenance; the checked snapshot is the permanent manuscript record.
- Existing checkpoints are append-only. A correction creates a child checkpoint.
- Working revisions are not checkpoints.
- Author approval alone does not create a published checkpoint. Record one only
  after the approved manuscript exists at an immutable commit and publication is
  authorized.

## Workflow

Validate the complete lineage without writing:

```bash
npm run editorial:checkpoints
```

Record a published checkpoint from an immutable commit:

```bash
npm run editorial:checkpoints -- record \
  --editorial-id volume-01 \
  --checkpoint-id volume-01/published-YYYY-MM-DD \
  --parent volume-01/original \
  --commit <full-commit-sha>
```

The record command reads the canonical source from that commit, writes a
byte-exact snapshot under `editorial/evidence/checkpoints/`, and appends the
lineage entry. Review and commit both changes intentionally. The command refuses
working-tree prose and refuses a checkpoint that already exists.
