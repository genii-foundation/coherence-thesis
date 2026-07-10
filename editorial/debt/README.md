# Editorial Debt

This folder is the durable obligation register for The Coherence Thesis. It keeps inconsistencies, unfulfilled promises, unresolved research, canon conflicts, literary weaknesses, link obligations, audio work, and technical constraints visible across human and machine editorial passes.

- Read [index.md](index.md) for the current active and resolved inventory.
- Store dated cross-volume audit reports under `audits/`. An audit is evidence, not the register. Reconcile every finding into an existing or new item before closing the audit pass.
- Add one file per discovery under `items/`.
- Copy `templates/item.md` when starting a record.
- Never delete a published debt item. Resolve it and preserve its history.
- If a resolved problem recurs elsewhere, reopen the same item, preserve the partial paydown, and append the new evidence. Do not create a duplicate that hides the failed corpus-wide resolution.
- Run `npm run manuscripts:debt:update` after every item change.
- Run `npm run manuscripts:debt` to verify the records and index.

The complete field contract lives in `.agents/skills/coherence-editorial-review/references/editorial-debt-schema.md`.
