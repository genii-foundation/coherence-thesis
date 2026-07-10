---
id: CTD-0077
title: Make Volume VI's cross-volume reading path navigable
status: resolved
kind: link
severity: medium
scopes: ["volume-6", "site", "corpus"]
sources: ["sources/manuscripts/coherence-thesis-vol6-the-smallest-nest.md", "content/series/aliases.json", "editorial/debt/audits/2026-07-09-initial-corpus-audit.md", "editorial/debt/audits/2026-07-09-nine-volume-production-audit.md"]
discovered: 2026-07-09
updated: 2026-07-10
resolved: 2026-07-10
discoveredIn: corpus-audit/2026-07-09
---

## Debt

Volume VI repeatedly tells readers to go deeper into named volumes and sections, but the reading-path entries are plain display text rather than links. Several labels paraphrase titles, so heading evolution can silently break the intended destination.

## Evidence

Current lines 139, 161, 181, 201, 221, 241, 263, 291, 315, 343, and 379 contain TO GO DEEPER entries. None supplies a stable route. Several Volume V entries also contain malformed quotation emphasis.

## Paydown criteria

Give each TO GO DEEPER entry a stable route or semantic reference that survives heading changes through the alias system. Add automated validation that every target resolves, including after a heading or section identity changes.

## History

- 2026-07-09: Recorded by the initial independent corpus audit.
- 2026-07-10: Added fourteen explicit destinations across all eleven deeper-reading entries, validated every target, and proved that the alias and historical-route system preserves them as headings evolve.

## Resolution

`sources/manuscripts/coherence-thesis-vol6-the-smallest-nest.md` contains eleven `TO GO DEEPER` entries with fourteen explicit destinations. Volume roots are used where the reference is thematic, and section routes are used where the text names a specific passage. `editorial/reviews/volume-6/production-pass/semantic-review.md` independently confirms that every entry has an explicit semantic destination. Manuscript validation proves every destination resolves. The saved-lineage regression test and the 5,833-link historical audit prove that later heading and identity changes continue through reviewed aliases rather than silently breaking the reading path.
