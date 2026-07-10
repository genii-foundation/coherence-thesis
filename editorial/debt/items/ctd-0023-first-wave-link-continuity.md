---
id: CTD-0023
title: Complete first-wave import and historical link audit
status: resolved
kind: link
severity: critical
scopes: ["volume-1", "volume-2", "volume-3", "corpus"]
sources: ["content/series/aliases.json", "content/series/route-aliases.json", "content/series/section-lineage.json", "content/series/historical-section-mappings.json", "content/series/section-ledger.json", "content/series/route-ledger.json", "editorial/reviews/volume-1/wave-one", "editorial/reviews/volume-2/wave-one", "editorial/reviews/volume-3/wave-one"]
discovered: 2026-07-09
updated: 2026-07-09
resolved: 2026-07-09
discoveredIn: first-editorial-wave
---

## Debt

The first editorial wave changes headings and section boundaries across three published volumes. The source edits are not safe to publish until every historical route and fragment resolves to its reviewed successor.

## Evidence

The isolated reviews contain explicit heading lineage maps, but the integrated import, alias generation, progress continuity map, paragraph fragment translation, and historical-route audit are still pending for the combined change.

## Paydown criteria

Run the integrated import with every explicit lineage decision, compile generated data, resolve every removed route through an alias, validate stored progress and historical paragraph fragments, and pass the complete historical-link audit with zero unresolved routes.

## History

- 2026-07-09: Recorded before combining the three isolated manuscript edits into the publishing pipeline.
- 2026-07-09: Imported the integrated sources, reviewed 170 explicit section maps and 52 structural route maps, and carried 265 deterministic continuity mappings forward.
- 2026-07-09: Wrote 551 lineage entries, 869 section aliases, and 82 route aliases. An identical second run reported zero unresolved items and no file changes.
- 2026-07-09: Found and fixed a planner gap that left 23 targets stale in the historical section mapping registry. Added regression coverage for refresh, unresolved accounting, and mapping-only writes.
- 2026-07-09: Passed the complete audit across 4,621 historical links, including 451 fragment links, with zero broken destinations. Manuscript validation also passed for 561 files and 36 overview references.

## Resolution

Every historical route and fragment in the audited catalog resolves through reviewed lineage or an explicit alias. Progress continuity remains attached to the inherited continuity groups. The preservation planner now updates all four compatibility registries and fails when an old historical mapping cannot reach a current section.
