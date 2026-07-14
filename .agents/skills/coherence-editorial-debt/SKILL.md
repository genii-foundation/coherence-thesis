---
name: coherence-editorial-debt
description: Audit, add, update, reconcile, resolve, and reopen durable Coherence Thesis editorial debt records without losing history. Use for unresolved claims, citations, canon conflicts, literary weaknesses, continuity obligations, audio obligations, implementation promises, cross-volume audits, debt index maintenance, and proof of paydown under editorial/debt/ and editorial/audits/.
---

# Editorial Debt

Keep durable editorial obligations visible until evidence proves they are paid.

## Load the contract

1. Read editorial/AGENTS.md.
2. Read editorial/debt/README.md.
3. Read editorial/templates/debt-item.md before creating a record.
4. Read the cited source, voice card, review evidence, and publishing state before changing status.

## Classify the work

- Audit: inspect a volume, corpus, or obligation class and write findings under editorial/audits/.
- Add: create one record for a genuinely new obligation.
- Update: add evidence or refine scope without changing lifecycle incorrectly.
- Resolve: record observable paydown and preserve history.
- Reopen: restore an active state when an earlier paydown proved incomplete.
- Reconcile: connect an audit or historical review finding to the durable register.

## Preserve lifecycle

- Use the next contiguous CTD identifier only for a new obligation.
- Reuse an existing record when the same problem recurs.
- Preserve prior history, partial paydown, dates, and evidence.
- Never delete a published debt item.
- Do not mark an item resolved because a proposal exists on an unmerged branch.
- Distinguish source evidence, generated evidence, review judgment, and external verification.
- Resolve historical source paths through the relevant volume.json. Do not rewrite cited baseline paths.

## Audit safely

1. Treat audits as read-only discovery.
2. Store durable audit reports under editorial/audits/.
3. Reconcile every actionable finding into an existing or new debt item.
4. Do not let a report replace the register.
5. Do not generate a spray of duplicate records from pattern matches.

## Write durable changes

Edit item files under editorial/debt/items/. Refresh the tracked index only through the explicit debt update command:

    npm run editorial:debt:update

Validate the register and index:

    npm run editorial:debt

Run related editorial, manuscript, continuity, or audio validation when the claimed resolution depends on those systems. Run the full repository gate before commit.

## Review the result

- Confirm the status, dates, history, evidence paths, and resolution text agree.
- Confirm every evidence path resolves or is explicitly historical.
- Confirm the index changed only as expected.
- Keep unrelated generated output untracked.
- Use a focused documentation or edit commit according to the underlying obligation.
- Explain why the evidence proves paydown, or why the item remains open.
