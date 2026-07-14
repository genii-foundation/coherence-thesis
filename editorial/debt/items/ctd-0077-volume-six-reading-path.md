---
id: CTD-0077
title: Make Volume VI's cross-volume reading path navigable
status: open
kind: link
severity: medium
scopes: ["volume-6", "site", "corpus"]
sources: ["editorial/sources/volumes/volume-06/manuscript.md", "publishing/continuity/aliases.json", "editorial/audits/2026-07-09-initial-corpus.md", "editorial/audits/2026-07-09-nine-volume-production.md"]
discovered: 2026-07-09
updated: 2026-07-11
resolved:
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
- 2026-07-11: Reopened during the pull request split because the current Volume VI source still renders every deeper-reading entry as plain display text.

## Prior paydown

The unmerged Volume VI revision added fourteen destinations across eleven deeper-reading entries. Those links remain proposed work until the manuscript revision and link continuity pull requests land together.
