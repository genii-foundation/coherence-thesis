# Editorial Debt

This folder is the durable obligation register for The Coherence Thesis. It keeps inconsistencies, unfulfilled promises, unresolved research, canon conflicts, literary weaknesses, link obligations, audio work, and technical constraints visible across human and machine editorial passes.

- Read [index.md](index.md) for the current active and resolved inventory.
- Store dated cross-volume audit reports under `editorial/audits/`. An audit is evidence, not the register. Reconcile every finding into an existing or new item before closing the audit pass.
- Add one file per discovery under `items/`.
- Copy `editorial/templates/debt-item.md` when starting a record.
- Never delete a published debt item. Resolve it and preserve its history.
- If a resolved problem recurs elsewhere, reopen the same item, preserve the partial paydown, and append the new evidence. Do not create a duplicate that hides the failed corpus-wide resolution.
- Edit item files, not `index.md`. Run `npm run editorial:debt:update` after every item change.
- Run `npm run editorial:debt` to verify the records and index.

## Lifecycle

Use the next contiguous `CTD-` identifier when the obligation is genuinely new. Every status has one meaning:

- `open` means the obligation is understood and work can begin.
- `query` means a named author, editor, researcher, or specialist decision is required before safe paydown.
- `deferred` means a specific external condition blocks the work. State the condition and how an editor can tell when it has changed.
- `resolved` means every paydown criterion has observable proof on current `main`, or has a documented `not applicable` result.

Begin an active item with `status: open`, `query`, or `deferred`, and leave `resolved:` empty. New paydown criteria use contiguous labels starting with `C1`, one criterion per line. Active legacy items may retain prose criteria until an editor services them.

An implemented change on a branch or open pull request is a resolution candidate. Keep the ticket active and record the work under `## Partial paydown`. A candidate becomes confirmed closure only after the change is on current `main`, each criterion has been checked, required approval is recorded, and relevant validation passes.

To confirm closure, set `status: resolved`, preserve the original resolution date when migrating an older closure, update the item date, append a matching history entry, and add a structured `## Resolution`. It must contain these level 3 sections:

1. `Outcome`
2. `Criterion results`
3. `Evidence`
4. `Validation`
5. `Approval`
6. `Residual risk`
7. `Related debt`

Criterion results must cover every criterion exactly once and in order. Use `- C1: met. Proof...` or `- C1: not applicable. Reason...`. A `not applicable` result needs evidence that the criterion no longer belongs to this obligation. A resolved item cannot contain an unmet result.

To reopen an item, restore the appropriate active status, clear the resolution date, update the item date, and append a history entry that explains why the earlier paydown was incomplete. Preserve the old result under `## Prior paydown` so the register records both progress and recurrence.

The field contract is enforced by `scripts/editorial/debt.ts`. Start from [the item template](../templates/debt-item.md).

## Imported history

Several active items retain partial-paydown notes from editorial work that first appeared in PR 100 and is now tracked by PR 112. Those notes preserve proposed edits and review evidence. They do not claim that `main` contains the revised prose. Reconcile each note against the focused manuscript, continuity, or review evidence pull request before resolving the item.
