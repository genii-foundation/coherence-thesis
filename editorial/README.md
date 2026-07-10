# Editorial Records

This directory stores durable evidence for Coherence Thesis pilot and production edits.

Use this layout:

```text
editorial/
  voice-cards/<volume-id>.md
  reviews/<volume-id>/<batch-id>/review.md
  reviews/<volume-id>/<batch-id>/sentence-ledger.jsonl
  reviews/<volume-id>/<batch-id>/structure-ledger.jsonl
```

The sentence and structure ledgers are required for every pilot and production batch. The sentence ledger accounts for all prose, including source material omitted by reader generation. The structure ledger accounts for every heading and standalone display unit. The human review record captures structural choices, author questions, all 24 slop catalog results, independent reviews, link decisions, and approval. Keep temporary reports outside this directory.

Initialize exhaustive pending ledgers after importing the edited source:

```bash
npm run manuscripts:editorial-ledgers:init -- \
  --base <base-sha> \
  --current WORKTREE \
  --source sources/manuscripts/<volume>.md \
  --output editorial/reviews/<volume-id>/<batch-id>
```

The initializer supplies alignment evidence only. It does not approve a sentence, heading, claim, route decision, or inferred disposition.

Validate a complete source batch against its immutable baseline and current worktree with:

```bash
npm run manuscripts:editorial-ledger -- \
  --base <base-sha> \
  --current WORKTREE \
  --source sources/manuscripts/<volume>.md \
  --require-approved \
  editorial/reviews/<volume-id>/<batch-id>/sentence-ledger.jsonl

npm run manuscripts:structure-ledger -- \
  --base <base-sha> \
  --current WORKTREE \
  --source sources/manuscripts/<volume>.md \
  --require-approved \
  editorial/reviews/<volume-id>/<batch-id>/structure-ledger.jsonl
```

For a section microbatch, use paired `--section` and `--current-section` arguments for the sentence ledger. The ledgers must reconstruct the complete declared current output. These records explain the edit. They do not replace the canonical source Markdown in `sources/manuscripts/`.
