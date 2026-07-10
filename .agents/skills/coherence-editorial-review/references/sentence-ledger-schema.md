# Sentence Ledger Schema

Every pilot and production batch must commit a machine-readable sentence ledger at:

```text
editorial/reviews/<volume-id>/<batch-id>/sentence-ledger.jsonl
```

Use one JSON object per original source sentence. Blank lines are allowed. The stable baseline address combines `sourceFile`, `sourceHash`, `sectionId`, and `sentenceOrdinal`. The declared command scope is external to the ledger, so the validator can detect a wholly omitted section rather than trusting the ledger to describe its own completeness.

## Required fields

- `sourceFile`: repository-relative source Markdown path
- `sourceHash`: full lowercase SHA-256 hash of the pre-edit source file
- `sectionId`: section identity at the pre-edit baseline
- `sentenceOrdinal`: one-based ordinal inside that baseline section
- `originalHash`: first 16 lowercase hex characters of the normalized sentence SHA-256 hash
- `originalText`: exact normalized baseline sentence returned by the repository extractor
- `disposition`: `keep`, `tighten`, `recast`, `split`, `merge`, `move`, `query`, or `remove`
- `proposedText`: array of resulting normalized sentences
- `resultLocations`: one current `{ "sectionId", "sentenceOrdinal" }` object for each proposed sentence
- `reasonCodes`: controlled or clearly named editorial reasons
- `claimTypes`: factual, inferential, analogical, speculative, poetic, directive, or another explicit type
- `claimInvariants`: propositions, qualifications, images, or relationships that the edit must preserve
- `citationAttachments`: citation identifiers or links that must remain attached
- `risk`: `low`, `medium`, or `high`
- `reviewStatus`: `pending`, `query`, `reviewed`, or `approved`

## Result rules

- A kept sentence repeats its exact original text as the sole `proposedText` item.
- A removed sentence has empty `proposedText` and `resultLocations` arrays.
- A split sentence has at least two proposed sentences and one destination for each.
- Every source sentence in a merge uses the same nonempty `groupId`, result text, and result locations. A merge group contains at least two inputs.
- A moved sentence points to its actual current section and ordinal.
- A queried sentence uses `reviewStatus: "query"` until resolved.
- Every current sentence in the declared output scope is claimed exactly once. A merge result is counted once for its whole group.
- An approved sentence has at least one reason code, one explicit claim type, and one claim invariant. Initializer output remains pending until those fields have been reviewed and completed.

Never clone one source record to cover multiple baseline sentences. Never leave a result location as an aspiration. It must name the exact sentence present in the imported current manuscript.

## Validation

Declare whole-source scope when a complete source file was edited:

```bash
npm run manuscripts:editorial-ledger -- \
  --base <base-sha> \
  --current WORKTREE \
  --source sources/manuscripts/<volume>.md \
  --require-approved \
  editorial/reviews/<volume-id>/<batch-id>/sentence-ledger.jsonl
```

For a microbatch or an identity change, repeat explicit baseline and current section arguments:

```bash
npm run manuscripts:editorial-ledger -- \
  --base <base-sha> \
  --current WORKTREE \
  --section <baseline-section-id> \
  --current-section <current-section-id> \
  --require-approved \
  editorial/reviews/<volume-id>/<batch-id>/sentence-ledger.jsonl
```

Whole-source scope includes published section bodies and a synthetic unpublished section containing source sentences omitted by the generated reader documents. This covers title matter, dedications, editorial introductions, and the master ledger.

The validator checks declared baseline section equality, complete ordered baseline sentences, source and sentence hashes, disposition rules, merge groups, approval, exact result locations, exact proposed text, and complete current output reconstruction.
