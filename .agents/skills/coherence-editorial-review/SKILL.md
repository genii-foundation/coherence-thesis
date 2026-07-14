---
name: coherence-editorial-review
description: Audit, review, and revise Coherence Thesis manuscripts sentence by sentence while preserving meaning, evidence, voice, cadence, imagery, citations, structure, and public continuity. Use for prose audits, developmental editing, line editing, style harmonization, AI slop removal, poetry review, manuscript production batches, editorial verification, review ledgers, and author-facing editorial commentary in editorial/sources/volumes/.
---

# Editorial Review

Improve language, reasoning, and literary force without replacing a volume's voice with a generic house style.

## Load canonical guidance

Read these files completely when they apply:

- editorial/standards/editorial.md before evaluating or changing prose.
- editorial/templates/voice-card.md before creating or revising a voice card.
- editorial/templates/review-record.md before preparing durable review evidence.
- editorial/schemas/sentence-ledger.md before creating or changing a sentence ledger.
- editorial/schemas/structure-ledger.md before reviewing headings or display matter.
- editorial/schemas/review-manifest.md before creating or changing durable review evidence.
- docs/manuscript-editorial-plan.md for corpus-scale work.

Do not recreate these resources inside the skill.

## Establish editorial authority

1. Identify the package at editorial/sources/volumes/<editorial-id>/.
2. Read manuscript.md, voice-card.md, volume.json, the relevant corpus master-ledger material, neighboring sections, and the volume opening and closing.
3. Confirm scope, intervention level, and whether factual research is authorized.
4. Record central claims, register, cadence, motifs, protected terms, protected lines, and known uncertainties.
5. Prefer a precise author query over an invented repair.

## Select a mode

- Audit: report findings without changing prose.
- Pilot: edit a small representative sample and obtain voice approval before scaling.
- Production: edit one defensible microbatch at a time.
- Verification: compare an existing revision with its baseline for semantic drift, literary loss, unresolved machine cadence, and publishing impact.

## Review rules

- Review every sentence in scope. Keep strong sentences unchanged.
- Preserve claim scope, modality, evidence, chronology, referents, citations, and deliberate uncertainty.
- Preserve living image, rhythm, humor, repetition, tension, and productive ambiguity.
- Allow headings and section identities to improve. Preserve access through continuity records rather than frozen wording.
- Treat automated findings as prompts for judgment.
- Never change an exact quotation silently.
- Never use smoothness as proof of improvement.

Apply editorial passes in this order:

1. Meaning.
2. Clarity.
3. Compression.
4. Cadence.
5. Voice.
6. Punctuation.

## Keep durable evidence

Store a volume batch under:

    editorial/reviews/volumes/<editorial-id>/<batch-id>/

Store corpus reconciliation under editorial/reviews/corpus/.

Every durable volume batch includes review.json. It lists the immutable baseline, reviewed source identity, current canonical source path, every evidence file, and approval state.

- Keep baseline source paths and hashes unchanged.
- Resolve historical and current paths through volume.json and historicalSourcePaths.
- Account for every baseline sentence in sentence-ledger.jsonl.
- Account for every heading and display unit in structure-ledger.jsonl.
- Keep human review comments selective and natural.
- Do not present generated alignment as editorial judgment.
- Preserve historical and superseded evidence. Record its standing in the review record and approval state without rewriting the baseline.

## Perform independent review

1. Ask a fresh semantic reviewer to find changed claims, lost qualifications, broken logic, factual overreach, citation problems, and changed referents.
2. Ask a fresh literary reviewer to find flattened voice, dead rhythm, overcompression, damaged imagery, and needless rewrites.
3. Ask a fresh slop reviewer to evaluate every category in editorial/standards/editorial.md.
4. Reconcile disagreements against the source, voice card, and standards. Do not decide by vote.

## Validate and hand off

1. Read the revision aloud or use speech playback.
2. Confirm quotations, citations, headings, order, routes, and audio impact.
3. Validate the sentence and structure ledgers that apply.
4. Run the editorial and manuscript checks that apply, then run the full repository gate. Use `npm run validate:ui` when routes or rendered reader behavior can change.
5. Inspect untracked generated material for structural damage.
6. Use coherence-manuscript-publish to record continuity, refresh publication state, and prepare the pull request.

Substantive prose requires explicit author approval before merge.
