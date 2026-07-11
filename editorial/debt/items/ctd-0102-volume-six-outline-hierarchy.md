---
id: CTD-0102
title: Restore Volume VI's first authored part in the reader outline
status: open
kind: structural
severity: medium
scopes: ["volume-6", "reader", "corpus"]
sources: ["sources/manuscripts/coherence-thesis-vol6-the-smallest-nest.md#the-whole-in-the-fewest-words", "scripts/manuscripts/import-markdown.ts", "src/lib/manuscript-labels.ts", "src/app/manuscripts/[volumeId]/page.tsx"]
discovered: 2026-07-11
updated: 2026-07-11
resolved:
discoveredIn: browser-review/volume-6-outline-hierarchy
---

## Debt

Volume VI's source and reader disagree about the first authored part. The importer places the opening material under synthetic front matter, while the volume page counts only the later authored part and substitutes generic opening labels for the source's first part title.

## Evidence

The source begins its body with the part heading `The Whole, in the Fewest Words`, followed later by `Beginning Again`. At `/manuscripts/6/`, the reader reports `1 part` but renders two cards: `Opening / Opening` and `Part 2 / Beginning Again`. The authored title `The Whole, in the Fewest Words` is absent from the outline. Browser review confirmed that the revised volume title and subtitle render correctly, so this item concerns only source and import hierarchy.

## Paydown criteria

Import both authored part identities without converting the first into generic front matter. Make the volume count, card kickers, card titles, breadcrumbs, and outline agree with the source hierarchy while preserving every published section destination through aliases where needed. Add import, data, and browser coverage for the Volume VI root and a representative volume that legitimately uses synthetic opening matter.

## History

- 2026-07-11: Recorded during browser review of the revised Volume VI root.
