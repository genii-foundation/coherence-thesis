---
id: CTD-0077
title: Make Volume VI's cross-volume reading path navigable
status: open
kind: link
severity: medium
scopes: ["volume-6", "site", "corpus"]
sources: ["sources/manuscripts/coherence-thesis-vol6-the-smallest-nest.md", "content/series/aliases.json", "editorial/debt/audits/2026-07-09-initial-corpus-audit.md"]
discovered: 2026-07-09
updated: 2026-07-09
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
