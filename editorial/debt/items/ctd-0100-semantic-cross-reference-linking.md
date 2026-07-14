---
id: CTD-0100
title: Add conservative semantic cross-reference linking
status: open
kind: link
severity: medium
scopes: ["volume-1", "site", "corpus"]
sources: ["editorial/sources/volumes/volume-01/manuscript.md#four-movements", "editorial/audits/2026-07-09-cross-reference-candidates.md", "editorial/sources/corpus/semantic-links.json", "publishing/continuity/section-lineage.json"]
discovered: 2026-07-09
updated: 2026-07-13
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
- 2026-07-13: Implemented the reviewed registry, deterministic candidate audit, explicit review workflow, lineage-aware compiler overlay, server-rendered links, and fail-closed validation. Kept the item open for the unmerged Four Movements source revision and its final five-term occurrence review.

## Partial paydown

The repository now stores reviewed concept mappings and exact source occurrences in `editorial/sources/corpus/semantic-links.json`. The compiler resolves targets through current and legacy continuity ownership, derives the current route, and enriches only generated reader bodies after prose, paragraph, progress, and audio identities are fixed. The advisory audit reports exact source lines, confidence signals, self-references, existing links, code, headings, and ambiguous ordinary language without changing canonical source.

The first reviewed pass records 24 Volume I links and 11 durable exclusions. Focused tests cover all five emphasized movement terms, an ordinary-language ambiguity, exact unique section titles, stale reports, missing and multiply owned continuity identities, every route level, nested emphasis, server rendering, and audio offsets. The exact five-term Four Movements passage remains on unmerged PR 112. When that source becomes canonical, regenerate the audit and record its five occurrences before resolving this item.
