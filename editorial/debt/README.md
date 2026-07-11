# Editorial Debt

This folder is the durable obligation register for The Coherence Thesis. It keeps inconsistencies, unfulfilled promises, unresolved research, canon conflicts, literary weaknesses, link obligations, audio work, and technical constraints visible across human and machine editorial passes.

- Read [index.md](index.md) for the current active and resolved inventory.
- Store dated cross-volume audit reports under `audits/`. An audit is evidence, not the register. Reconcile every finding into an existing or new item before closing the audit pass.
- Add one file per discovery under `items/`.
- Copy `templates/item.md` when starting a record.
- Never delete a published debt item. Resolve it and preserve its history.
- If a resolved problem recurs elsewhere, reopen the same item, preserve the partial paydown, and append the new evidence. Do not create a duplicate that hides the failed corpus-wide resolution.
- Edit item files, not `index.md`. Run `npm run manuscripts:debt:update` after every item change.
- Run `npm run manuscripts:debt` to verify the records and index.

## Lifecycle

Use the next contiguous `CTD-` identifier when the obligation is genuinely new. Begin with `status: open`, `query`, or `deferred`, and leave `resolved:` empty.

To resolve an item, set `status: resolved`, add the resolution date, update the item date, append a matching history entry, and add a `## Resolution` section with observable evidence.

To reopen an item, restore an active status, clear the resolution date, update the item date, and append a history entry that explains why the earlier paydown was incomplete. Preserve the old result under `## Prior paydown` so the register records both progress and recurrence.

The field contract is enforced by `scripts/manuscripts/editorial-debt.ts`. Start from [the item template](templates/item.md).

## Imported history

Several active items retain partial-paydown notes from the unmerged editorial revision worktree that became PR 100. Those notes preserve proposed edits and review evidence. They do not claim that the standards branch or main contains the change. Reconcile each note against the focused manuscript, continuity, or review-evidence pull request before resolving the item.
