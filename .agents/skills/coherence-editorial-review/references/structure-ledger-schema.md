# Structure Ledger Schema

Every pilot and production batch must also commit:

```text
editorial/reviews/<volume-id>/<batch-id>/structure-ledger.jsonl
```

The structure ledger accounts for every Markdown heading and every title-page or standalone display line in the source file, including block quotations and attribution lines. It prevents a batch from polishing body prose while leaving inherited headings unexamined.

Each JSONL record contains:

- `sourceFile` and the full baseline `sourceHash`
- `unitType`: `heading` or `display-metadata`
- `unitOrdinal`: one-based order among all structural units in the source
- `originalHash` and exact normalized `originalText`
- `disposition`: the same eight dispositions as the sentence ledger
- `proposedText` and exact current `resultLocations`
- an optional shared `groupId` for merges
- `routeImpact`: `unchanged`, `renamed`, `moved`, `split`, `merged`, `removed`, `not-public`, or `query`
- `routeOutcome`: a concrete description of the canonical route, alias, or lack of public route impact
- `reviewStatus`: `pending`, `query`, `reviewed`, or `approved`

An approved public rename, move, split, merge, or removal must replace the initializer's pending route text with an adjudicated canonical destination and alias outcome. Query disposition, route impact, and review status remain paired until the question is resolved.

Validate the complete source inventory against the immutable base and imported worktree:

```bash
npm run manuscripts:structure-ledger -- \
  --base <base-sha> \
  --current WORKTREE \
  --source sources/manuscripts/<volume>.md \
  --require-approved \
  editorial/reviews/<volume-id>/<batch-id>/structure-ledger.jsonl
```

Structure validation is always whole-source. A sentence ledger may use paired section scopes for a microbatch, but the structure ledger still uses `--source` so no heading or display unit escapes review.

The validator rejects an omitted baseline heading, invented proposed wording, a duplicate result, and any current heading or display unit without a ledger result.
