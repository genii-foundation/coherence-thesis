---
name: coherence-editorial-calibration
description: Guide an intent-first revision of a specific Coherence Thesis section from the editor's request through a transient working page, generated variants, iterative comparison, explicit approval, manuscript implementation, durable calibration evidence, and any justified editorial guidance. Use when a passage should change, prose feels truncated, flattened, unclear, or off in register, the editor selects reader text and chooses Revise this section, competing revisions need comparison, or an approved section decision should teach later editorial passes.
---

# Editorial Calibration

The editor defines the problem. The machine proposes language only after it understands what the editor wants changed.

## Load canonical guidance

- `editorial/method/schemas/working-revision-session.md` before creating or changing transient session state.
- `editorial/method/schemas/calibration-record.md` before creating durable evidence after approval.
- `editorial/method/standard.md` before proposing a variant and again before recording any general rule.
- The volume's `voice-card.md`, neighboring sections, relevant master-ledger material, and relevant debt items before proposing prose.

## Open the working page first

Resolve the section and selected paragraph. Before diagnosis, drafting, or durable writes, run:

```bash
npm run editorial:revision -- start --section <section-id> --anchor <paragraph-anchor>
```

The command creates ignored state under `generated/revision-sessions/` and prints `/admin/revisions/<section-id>/`. Share the full local preview link immediately.

Then ask one direct question: what do you want changed about this passage?

Wait for the answer. Do not offer a rewrite, infer the editor's goal from the selection, or create a calibration record while waiting.

## Preserve the editor's direction

Write the editor's answer to a temporary text file under `generated/`, then run:

```bash
npm run editorial:revision -- direction --section <section-id> --request-file <path>
```

Use the editor's words. Do not improve, broaden, or translate the request into a different editorial objective.

If the request changes canon, doctrine, evidence, claim scope, or another fact the agent cannot authorize, name that consequence before drafting. The editor may authorize the change or narrow the request.

## Diagnose only after intent exists

The current canonical passage is the text being revised. The immutable baseline is evidence and a guard against accidental loss. It is not the default replacement text.

1. Read the selected passage in its full section and neighboring context.
2. Read the immutable baseline, voice card, standard, relevant ledgers, and known debt.
3. Identify the smallest set of changes that could satisfy the editor's request.
4. Preserve claims, evidence, image, cadence, and continuity that the request does not authorize changing.
5. State any conflict between the request and binding editorial authority instead of resolving it silently.

## Publish real alternatives

Offer at least two distinct approaches. Variants must differ in editorial strategy, not in decorative synonym changes.

For each variant provide:

- a short title;
- the full proposed passage;
- specific reasoning about what it changes;
- the cost or risk the editor should weigh;
- a lineage parent when it refines an earlier branch.

Write the complete variant array to a temporary JSON file under `generated/`, then run:

```bash
npm run editorial:revision -- variants --section <section-id> --file <path>
```

Share the working-page link again as soon as the variants appear. Present a concise comparison in chat, then ask what the editor wants to keep, reject, combine, or change.

Do not select a winner.

## Iterate in working state

Each new editor response is another `direction` entry. Publish the next complete variant set after applying it.

Keep rejected branches when they explain the boundary the editor discovered. Use positional lineage labels such as `A`, `B`, `A1`, and `A11`.

Continue until the editor explicitly says that one finished version is approved. Agreement with an approach, a favorite direction, or a request for one more tweak is not final approval.

## Mark approval before durable work

After explicit approval, run:

```bash
npm run editorial:revision -- approve --section <section-id> --variant <label>
```

The working page must show the approved checkmark before any manuscript or evidence write.

Approval authorizes implementation of that text. It does not automatically turn every preference expressed during the session into a volume or corpus rule.

## Implement and record

Only now:

1. Apply the approved text to the canonical manuscript.
2. Create or supersede the calibration record.
3. Preserve the editor's directions, explored variants, rejected branches, approved branch, and stated reasoning accurately.
4. Record author rulings with deliberate `section`, `volume`, or `corpus` scope.
5. Update the volume voice card only when the approved decision establishes volume authority.
6. Add a named obligation to the standard only when the author made a corpus-scoped ruling that generalizes beyond this passage.
7. Update debt, continuity, review evidence, and audio impact where the approved change requires it.

Run the applicable editorial checks and the full repository gate. Then mark the working session recorded:

```bash
npm run editorial:revision -- recorded --section <section-id> --record-path <path>
```

Share the finished page and summarize the manuscript change, durable evidence, guidance changes, and validation result.

## Authority boundary

Generated working state is disposable and nonbinding. It may preserve editor instructions and candidate prose so the session can continue, but it may not be cited as a ruling.

Never write an `editorial-agent` ruling to move this workflow past missing approval. The correct state is waiting.
