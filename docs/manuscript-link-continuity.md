# Manuscript Link Continuity

Headings, section boundaries, and public names may improve. Published links and reader history must still work.

The publishing system separates public identity from technical continuity:

- `content/series/section-lineage.json` assigns each current section a stable continuity identity and records historical section IDs.
- `content/series/aliases.json` maps retired section routes to a current section.
- `content/series/route-aliases.json` maps retired part and chapter routes to a current route.
- `content/series/section-ledger.json` retains the earlier section route contract.
- `content/series/route-ledger.json` retains every reviewed volume, part, chapter, section, alias, and reader fragment route.
- `content/series/historical-section-mappings.json` records mappings that required human judgment during the repository history audit.

Paragraph anchors use a hash of paragraph content rather than paragraph position. Moving a paragraph no longer changes its anchor. Old ordinal anchors still resolve through the reader fallback.

## Editing a manuscript

After changing source Markdown, materialize the proposed reader structure and ask the preservation tool to compare it with the branch base:

```bash
npm run manuscripts:import
npm run manuscripts:preserve-links -- --base HEAD
```

The command reports confident lineage matches, proposed aliases, and unresolved moves. It does not write by default. Resolve uncertain moves explicitly:

```bash
npm run manuscripts:preserve-links -- --base HEAD --map old-section=new-section --write
npm run manuscripts:preserve-links -- --base HEAD --route-map /old/=/new/ --write
```

For a large editorial replacement, keep the reviewed lineage and structural
route decisions in separate JSON files until the plan is clean. The planner can
use those files without first copying them over the canonical records:

```bash
npm run manuscripts:preserve-links -- \
  --base HEAD \
  --reviewed-lineage artifacts/reviewed-section-lineage.json \
  --reviewed-route-aliases artifacts/reviewed-route-aliases.json \
  --map retired-section=renamed-successor \
  --route-map /retired-chapter/=/renamed-chapter/ \
  --write
```

Reviewed lineage owns predecessors through continuity IDs and historical
section IDs, not only matching public section IDs. Several predecessors may
belong to one reviewed successor after a merge. If two reviewed entries claim
the same predecessor, or a reviewed successor is absent from the current
catalog, the plan stops until an explicit `--map` settles the decision. On a
clean plan, `--write` writes the resulting lineage and structural aliases to
their canonical files. Section aliases are rebuilt from the current canonical
file and historical route evidence. A replacement section alias file is never
imported.

Inspect every written alias and lineage decision. Then record the reviewed route set:

```bash
npm run manuscripts:record-routes
npm run manuscripts:validate
```

Preparation, development, tests, and builds validate the durable ledgers but never update them. Only the explicit preservation and route recording commands may change reviewed continuity state.

## Auditing repository history

Use the historical audit to check every catalog revision that remains in Git history:

```bash
npm run manuscripts:audit-history -- --summary
```

Run without `--summary` to inspect unresolved routes. Writes require an explicit flag and a worktree catalog:

```bash
npm run manuscripts:audit-history -- --write
npm run manuscripts:audit-history -- --record-ledger
```

Historical mappings are evidence, not decoration. Do not accept an automatic successor when a split, merge, or conceptual rewrite makes the relationship ambiguous.

## Runtime behavior

Server routes redirect retired structural paths. Section aliases retain the incoming fragment long enough for the browser to translate old section and paragraph anchors. Legacy section anchors remain in rendered HTML, and no JavaScript is required for canonical manuscript text.

Reading progress uses continuity identities. A renamed section keeps its read state. A merge counts as complete only when all predecessor groups were complete, which prevents a reused public ID from falsely marking new material as read.
