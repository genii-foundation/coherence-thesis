---
name: coherence-editorial-debt-guide
description: Guide human editors through one Coherence Thesis editorial debt ticket at a time, from queue selection and evidence briefing through quick triage, investigation, approved repair, pull request, merged verification, resolution, or reopening. Use when an editor asks what debt to handle next, names a CTD ticket, wants quick wins or author queries, revisits a deferred blocker, or wants to fully pay down and close editorial debt.
---

# Editorial Debt Guide

Help a human editor make one clear, evidence backed decision at a time. Keep the register honest while making the work easy to enter.

## Load the contract

1. Read `editorial/AGENTS.md`.
2. Read `editorial/debt/README.md`.
3. Read `editorial/templates/debt-item.md`.
4. Use `scripts/editorial/debt-queue.ts` to select or inspect one ticket.
5. Read the selected ticket, every cited source, the relevant voice card, review evidence, and applicable publishing state.
6. For audio work, also read `publishing/AGENTS.md` and `publishing/README.md`.

## Select one ticket

Run the read only queue:

    npm run editorial:debt:queue -- --id CTD-0038
    npm run editorial:debt:queue -- --preset actionable
    npm run editorial:debt:queue -- --preset quick-win
    npm run editorial:debt:queue -- --preset author-query
    npm run editorial:debt:queue -- --preset deferred

Use a named ticket when the editor supplies one. Otherwise offer one ticket from the requested queue. Do not combine several obligations into a single editorial session.

Treat quick win ranking as a boundedness hint. Verify the source, dependencies, and authority before recommending work.

## Brief the editor

Present a compact card before proposing changes:

- The obligation in plain language and why it matters.
- Status, kind, severity, scope, updated date, and exact source paths.
- The current evidence and each atomic paydown criterion.
- Any blocker, dependency, stale assumption, or required decision.
- The person or role with authority to decide.
- The recommended specialist workflow.
- Risks to canon, meaning, cadence, citations, links, audio, or reader behavior.
- A machine time estimate for each practical lane.

Treat queue routing as an initial default. A named decision authority in the ticket or cited evidence takes precedence over kind based routing.

Never invent evidence or imply that an unmerged branch is current repository truth.

## Offer three lanes

Ask the editor to choose one:

1. Quick triage. Keep open, convert to query, defer with a named condition, correct metadata, record partial paydown, reconcile a duplicate, verify current `main`, or skip for now. Quick triage cannot resolve a ticket.
2. Investigate. Perform read only source and evidence review, then return two or three concrete resolution options with tradeoffs, authority, dependencies, and proof requirements.
3. Full resolution. Proceed through decision, specialist work, validation, pull request, merged verification, and confirmed closure. Pause for every author, voice, canon, publication, or external authority decision.

Require explicit approval before changing durable ticket state or editorial source.

## Route specialist work

- Route literary, structural, and terminology work to `coherence-editorial-review`.
- Treat canon, logical, and promise debt as an author or project decision before routing approved prose work to `coherence-editorial-review`.
- Establish factual and citation claims from primary or authoritative evidence before editing prose.
- Route link and continuity work to `coherence-manuscript-publish`.
- Route technical and reader behavior work to `coherence-build-feature`.
- Follow the publishing instructions for audio. Never upload audio or write a durable manifest without explicit publication authorization.
- Use `coherence-editorial-debt` for every durable register mutation.

Do not let the guide perform specialist work by improvisation when a repository skill owns the workflow.

## Resolve in two checkpoints

Checkpoint one is a resolution candidate:

1. Verify the ticket against current source and rewrite the criteria into atomic checks if needed.
2. Obtain every required human decision.
3. Implement the approved repair through the owning specialist workflow.
4. Validate the affected system and obtain an independent review when the claim warrants one.
5. Open a focused pull request for the repair.
6. Keep the ticket active and record partial paydown. Name the candidate pull request and every remaining criterion.

Checkpoint two is confirmed closure:

1. Confirm the repair is merged into current `main`.
2. Recheck every criterion against that exact revision and current external evidence.
3. Record structured resolution proof through `coherence-editorial-debt`.
4. Refresh and validate the debt index.
5. Open a focused follow up pull request for the confirmed closure.

Resolution proof must state the outcome, result for every criterion, exact files and revision, validation, approval, residual risk, and related active debt. If any criterion is unmet or evidence has gone stale, keep the ticket active.

## Handle resolved and deferred tickets

- For a resolved ticket, offer verification or reopening only.
- Reopen the existing ticket when the same problem recurs. Preserve prior paydown.
- For a deferred ticket, verify the named condition before proposing a status change.
- A missing blocker is not proof of paydown. The criteria still require direct verification.

## Close the session

State the selected lane, decisions made, evidence inspected, changes performed, validations run, ticket status, and exact next gate. Stop when the next step needs authority the editor has not supplied.
