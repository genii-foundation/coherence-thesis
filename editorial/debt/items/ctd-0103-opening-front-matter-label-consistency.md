---
id: CTD-0103
title: Unify Opening and Front Matter labels across reader navigation
status: open
kind: terminology
severity: medium
scopes: ["volume-3", "reader", "corpus"]
sources: ["src/lib/manuscript-labels.ts", "src/lib/manuscript-data.ts", "src/app/manuscripts/[volumeId]/page.tsx"]
discovered: 2026-07-11
updated: 2026-07-11
resolved:
discoveredIn: browser-review/opening-front-matter-labels
---

## Debt

One organizational destination can have different public names depending on which reader surface links to it. The contradiction makes the hierarchy feel unstable even though every link resolves to the same page.

## Evidence

The Volume III root labels `/manuscripts/3/opening/` as `Opening`. On a child section page, the Up link to that same destination is labeled `Front Matter`. Root cards and breadcrumbs use the public display helper, while section parent navigation copies the catalog part title directly. The internal synthetic part identity is therefore leaking into one visible surface.

## Paydown criteria

Define one public label for each synthetic organizational part and use the shared label helper in volume roots, breadcrumbs, chapter and section navigation, Up links, and outline surfaces. Preserve internal part identities and historical routes. Audit every volume for `Opening`, `Front Matter`, and `Contents` conflicts, then add unit and browser coverage for Volume III and for a genuinely unpartitioned manuscript.

## History

- 2026-07-11: Recorded during browser review of Volume III reader navigation.
