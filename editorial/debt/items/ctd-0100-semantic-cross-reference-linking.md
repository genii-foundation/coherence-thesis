---
id: CTD-0100
title: Add conservative semantic cross-reference linking
status: open
kind: link
severity: medium
scopes: ["volume-1", "site", "corpus"]
sources: ["editorial/sources/volumes/volume-01/manuscript.md#four-movements", "editorial/audits/2026-07-09-cross-reference-candidates.md", "publishing/continuity/aliases.json"]
discovered: 2026-07-09
updated: 2026-07-09
resolved:
discoveredIn: browser-review/cross-reference-linking
---

## Debt

The corpus often names another section, concept, or volume without linking to it. Readers must infer the destination, and later heading evolution can make manually guessed routes stale.

## Evidence

Volume I's `Four Movements` section clearly refers to the Seed, Sprout, Stem, Soil, and Flower. A corpus scan of those five tokens found 42 clear references, 7 ambiguous references, 74 ordinary uses, and 11 structural labels. Blind replacement would therefore create many incorrect links.

## Paydown criteria

Create a lineage-aware candidate detector, maintain reviewed mappings from canonical concepts to stable section identities, exclude ordinary language and existing links, convert only approved candidates, and validate every resulting target during manuscript compilation. Cover the Volume I example and a representative ambiguous case with tests.

## History

- 2026-07-09: Recorded after browser review asked for automatic detection and conversion of internal references.
- 2026-07-09: Added the initial corpus classification and recommended current targets for the five Volume I structural terms.
