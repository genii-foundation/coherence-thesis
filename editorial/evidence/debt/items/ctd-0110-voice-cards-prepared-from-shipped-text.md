---
id: CTD-0110
title: Re-prepare the nine voice cards from their baselines
status: open
kind: technical
severity: high
scopes: ["volume-1", "volume-2", "volume-3", "volume-4", "volume-5", "volume-6", "volume-7", "volume-8", "volume-9", "corpus"]
sources: ["editorial/sources/volumes/volume-01/voice-card.md", "editorial/sources/volumes/volume-02/voice-card.md", "editorial/sources/volumes/volume-03/voice-card.md", "editorial/sources/volumes/volume-04/voice-card.md", "editorial/sources/volumes/volume-05/voice-card.md", "editorial/sources/volumes/volume-06/voice-card.md", "editorial/sources/volumes/volume-07/voice-card.md", "editorial/sources/volumes/volume-08/voice-card.md", "editorial/sources/volumes/volume-09/voice-card.md", "editorial/method/standard.md"]
discovered: 2026-07-30
updated: 2026-07-30
resolved:
discoveredIn: volume-6/2026-07-30-baseline-re-render
---

## Debt

The nine volume voice cards quote protected lines and exemplar openings that were transcribed from the compressed production pass rather than from the immutable baselines the cards name as their source.

Eighty of the one hundred and fourteen quoted strings across the nine cards have no verbatim ancestor in the baseline. Every one of those eighty appears verbatim in the shipped manuscript. The direction is uniform: no quoted string exists in a baseline and is absent from the shipped text. That rules out drift, transcription error, and selective quotation, and leaves one mechanism. The cards were read off the output.

Three consequences follow, in increasing order of severity.

The protected-lines gate does not do the work it is believed to do. `R-VOICE-BIND` makes the card binding and the standard's acceptance checklist asks whether a revision satisfies every assertion in it. For twenty-nine of the forty-three declared protected lines, satisfying the card means reproducing a sentence the pass wrote. The gate compares the compressed pass against itself and passes.

A re-render that restores a baseline verbatim will fail the gate on the lines the pass authored, and the failure will look like a fidelity defect in the re-render rather than a provenance defect in the card. This has already happened twice, in `v05-at-the-threshold-of-contribution` and `v05-the-cardinal-scale`, where restoring the baseline would have deleted a declared protected line.

Where the card's wording differs from a real baseline ancestor, the difference sometimes changes the claim, and the card's version is the one the gate enforces.

## Evidence

Method: every quoted string was extracted from the `Protected lines or passages` and `Exemplar opening anchors` fields of each card, normalised for case, curly quotation marks, emphasis markup, prohibited marks, and whitespace, then searched against the volume's baseline under `editorial/evidence/reviews/volumes/volume-0X/<batch>/baseline.md` and against the shipped manuscript at `HEAD`. Near-miss candidates were confirmed by keyword co-occurrence rather than by edit distance, because short strings produce unreliable similarity scores.

| Volume | Quoted | Baseline ancestor | Pass authored | No baseline ancestor |
| --- | --- | --- | --- | --- |
| volume-1 | 12 | 10 | 2 | 17 percent |
| volume-2 | 6 | 6 | 0 | 0 percent |
| volume-3 | 16 | 4 | 12 | 75 percent |
| volume-4 | 15 | 1 | 14 | 93 percent |
| volume-5 | 14 | 6 | 8 | 57 percent |
| volume-6 | 12 | 3 | 9 | 75 percent |
| volume-7 | 13 | 2 | 11 | 85 percent |
| volume-8 | 14 | 1 | 13 | 93 percent |
| volume-9 | 12 | 1 | 11 | 92 percent |
| corpus | 114 | 34 | 80 | 70 percent |

Of the 43 declared protected lines, 29 have no verbatim baseline ancestor. Of the 71 exemplar openings, 51 have none.

### Protected lines the pass authored

Volume III, five of six. `The body contributes evidence. It does not deliver an oracle.` `A successful nest is not preserved behind glass.` `A person is not their record.` `A map is not a building. A vision is not evidence.` `The question is not yet history. It remains a choice.`

Volume IV, five of five. `The nest must eventually bear weight, but it should not be declared load-bearing before anyone has stood in it.` `The long clock matters only if people can live inside it.` `The meeting is awkward because Elan is still learning and both of them know it.` `The two parties remain in good faith and do not find compatible terms.` `The metaphor does not excuse the accounting.`

Volume V, one of six. `A seed is not a forest.`

Volume VI, three of five. `This book is the smallest container built to hold the idea.` `A human life can hold more capacity than it finds occasion to spend.` `The dragon is not elsewhere, waiting. It is the name this book gives awareness when it becomes answerable to the life around it.`

Volume VII, five of five. `No mentor gives another person their genius or owns the authority to define it.` `A living body balances by moving.` `Consent is not a brake placed on vitality.` `Wakefulness is a birthright, not an achievement another person can grant.` `Love may direct the course. Freedom must walk beside it.`

Volume VIII, five of six. `I remember the exact blue.` `The pause closed. Changing the subject brought relief.` `The manuscript cannot certify its own restraint.` `A protocol can still produce landlords.` `Small is not the same as powerless.`

Volume IX, five of five. `A detailed proposal is still a proposal until people can test it safely and in public.` `Providence can assist recognition. It cannot manufacture it.` `Provision must remain more than a beautiful verb.` `A hungry person does not become less hungry because a wallet is elegant.` `The proof is the shade, the fruit, the roots holding soil after rain.`

Volumes I and II declare no protected line without a baseline ancestor.

### Where the card's wording changes the claim

Volume VIII. The card protects `Small is not the same as powerless.` The baseline reads `you are not powerless, you are merely small — and small is not the same as nothing.` The baseline concedes that the reader is small and denies that small means nothing. The card's version denies that small means powerless, which is the opposite concession, and it is the version the gate enforces.

Volume III. The card protects `A person is not their record.` The baseline reads `A person is never their record.` The card also protects `The question is not yet history. It remains a choice.` against the baseline's `The question is not yet history. It is still a choice.` Both substitutions weaken a modality the surrounding passage argues for.

Volume III. The card protects `A map is not a building. A vision is not evidence.` The baseline contains `A map is not a building.` The second sentence has no ancestor and arrived with the pass.

Volume VI. The card protects `This book is the smallest container built to hold the idea.` The baseline reads `...built to hold that whole idea.` The card also protects a closing line whose baseline ancestor reads `The dragon was never somewhere else, waiting. It is the awareness coming awake in you as you set this down. It always was.`

Volume VIII. The card protects `I remember the exact blue.` The baseline reads `I can still remember the exact blue.`

Volume V. The card protects `A seed is not a forest.` The baseline reads `A single seed of this kind is not yet a forest.`

### The provenance metadata is accurate and the content is not

Eight of the nine cards carry a `Baseline source SHA-256` line, and all eight match the current baseline file byte for byte. All nine name source commit `29c0ffdc7023e8cda6d7232d915b392b6c8eb163`. The cards correctly identify which baseline they were prepared from while quoting text that baseline does not contain, so no checksum, link, or manuscript validation can surface the defect. Only reading the quoted strings against the named file reveals it.

`editorial/sources/volumes/volume-01/voice-card.md` has no `Baseline source SHA-256` line at all, so its stated provenance cannot be verified mechanically.

`editorial/sources/volumes/volume-02/voice-card.md` states its protected passages descriptively rather than in quotation: `the title and subtitle; dedications; self-epigraph wording; the distinction between present Providence capability and future development`. Volume II therefore has no mechanically checkable protected-line gate in either direction.

### Dependent work

Fifty-two Volume V and Volume VI calibration records written on 2026-07-30 cite the cards as authority and flag the displaced exemplar anchors individually. Volume I and Volume III calibration records predate the discovery and do not.

## Paydown criteria

- C1. Every quoted string in all nine cards is classified against the volume's named baseline as verbatim, altered with both forms recorded, or authored by the pass.
- C2. Each card's `Protected lines or passages` field is re-prepared from the baseline, except where the author has since ruled that a pass-authored line is protected on its merits. A retained pass-authored line is marked as such with the ruling that retained it, so the field never again implies baseline provenance it does not have.
- C3. Each card's `Exemplar opening anchors` field is re-prepared from the baseline, or the field is redefined in the card's own terms as illustrative of the current source rather than of the volume's voice at baseline.
- C4. Every case recorded under C1 where the card's wording changes a claim is resolved by an author decision, not by an editorial preference. `Small is not the same as powerless` against `small is not the same as nothing` is the first such decision.
- C5. `editorial/sources/volumes/volume-01/voice-card.md` gains a `Baseline source SHA-256` line, and the value is verified against the named baseline file.
- C6. `editorial/sources/volumes/volume-02/voice-card.md` states its protected passages in exact quotation, or the card records why that volume's protections cannot be expressed as quotations.
- C7. The corpus card or the standard states which text a voice card is prepared from, so a later card cannot repeat the error silently. A card prepared from a shipped manuscript is a description of that manuscript and cannot also be the authority that validates it.
- C8. Calibration records that cite a displaced protected line or exemplar are amended with a dated note rather than rewritten, per the calibration schema's rule that a settled record is never edited to match a later opinion.

## History

- 2026-07-30: Recorded after the Volume VI baseline re-render found that four of the volume's five protected lines have no baseline ancestor, and a corpus-wide audit of all nine cards found the same defect in eighty of one hundred and fourteen quoted strings.

> Identifier note. This audit was commissioned as `CTD-0109`, but that identifier was already assigned to `ctd-0109-r-ledger-wins-authority.md`, an open query, before the audit began. The item is therefore recorded as `CTD-0110`. Both constraints in `scripts/editorial/debt.ts` are enforced: `parseEditorialDebtItem` requires the filename to begin with the lowercased identifier, and `validateEditorialDebtItems` throws on a duplicate identifier, so neither reusing `CTD-0109` nor keeping the original filename was available.
>
> This item and `CTD-0109` are the same class of failure seen from two sides. `CTD-0109` asks whether an agent may convert its own judgment into binding corpus authority. This item records an instance where that already happened without anyone deciding it: an editorial pass wrote a sentence, a card transcribed the sentence as protected, and `R-VOICE-BIND` made it binding on every pass that followed. Neither item should be closed without reading the other.
