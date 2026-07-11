---
id: CTD-0026
title: Align the Volume I reader subtitle with the manuscript
status: open
kind: terminology
severity: medium
scopes: ["volume-1"]
sources: ["sources/manuscripts/coherence-thesis-vol1-humanitys-most-viable-future.md", "sources/manuscripts/coherence-thesis-master-ledger.md", "content/series/volumes.json"]
discovered: 2026-07-09
updated: 2026-07-11
resolved:
discoveredIn: first-editorial-wave/integration
---

## Debt

The revised Volume I source uses the subtitle "Coherence as the Ground of a Post-Extractive Civilization," while the series metadata and master ledger still supplied the older subtitle.

## Evidence

The source title matter, `content/series/volumes.json`, and the master ledger disagreed, so readers would see different published identities depending on the surface.

## Paydown criteria

Use the approved revised subtitle in both source and series metadata, then regenerate the reader catalog and confirm the outline displays the same wording.

## History

- 2026-07-09: Found while rebuilding the local Volume I preview.
- 2026-07-09: Updated the canonical series metadata and master ledger to match the revised manuscript subtitle.
- 2026-07-11: Reopened during the pull request split because the revised subtitle is not present in the source, metadata, or master ledger on this branch or main.

## Prior paydown

The unmerged manuscript revision aligned all three surfaces. That wording remains a proposed paydown until the focused manuscript revision pull request is approved and merged.
