---
id: CTD-0000
title: Replace with a concise obligation
status: open
kind: literary
severity: medium
scopes: ["volume-1"]
sources: ["editorial/sources/volumes/volume-01/manuscript.md#section"]
discovered: 2026-07-09
updated: 2026-07-09
resolved:
discoveredIn: volume-1/example-batch
---

## Debt

State what remains wrong, absent, inconsistent, or unproven.

## Evidence

Name the exact passages, artifacts, or validation results that establish the debt.

## Paydown criteria

- C1. State one observable condition required for confirmed closure.
- C2. Add each further condition as the next contiguous criterion.

## History

- 2026-07-09: Recorded.

> Use `open` when work can begin, `query` when a named decision is required, and `deferred` when a specific external condition blocks the work. Use `resolved` only after every criterion has proof on current `main`.
>
> A branch or open pull request is a resolution candidate. Keep the item active and record it under `## Partial paydown`. Confirm closure only after merge, current evidence, required approval, and relevant validation.
>
> On confirmed closure, add a dated history entry and a `## Resolution` section. Under it, add level 3 sections named `Outcome`, `Criterion results`, `Evidence`, `Validation`, `Approval`, `Residual risk`, and `Related debt`. Record each result as `- C1: met. Proof...` or `- C1: not applicable. Reason...`. Cover every criterion exactly once and in order. A resolved item cannot contain an unmet result.
>
> When reopening, clear the resolved date, add a dated history entry, and retain the earlier result under `## Prior paydown`.
