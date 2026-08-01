---
id: CTD-0017
title: Decide what the Four Movements heading promises
status: query
kind: structural
severity: medium
scopes: ["volume-1"]
sources: ["editorial/sources/volumes/volume-01/manuscript.md#four-movements"]
discovered: 2026-07-09
updated: 2026-07-30
resolved:
discoveredIn: volume-1/literary-review
---

## Debt

The heading "Four Movements" introduces Seed, Sprout, Stem, and Soil, but the passage beneath it also introduces the Flower. A careful reader may reasonably count five movements.

The Flower becomes Part Two, which can justify excluding it from the four movements. The current prose does not make that structural distinction explicit, so the heading and the paragraph make different promises.

The 2026-07-30 baseline re-render changed the facts this item rests on. The wave-one baseline heading is `A Note on Compression`, and the passage beneath it names three stages, not five: seed at one to three minutes, sprout at five to eight more, stem at ten to fifteen more, then "the remainder" for the domains where failure carries consequence. The five-item reading the item records was produced by the wave-one pass, which expanded the passage under a heading naming four. The re-render restored the baseline three.

So the mismatch is now three under a heading of four, and the deeper problem is visible: the section is not about movements at all. It is about how long the book takes to read at each depth, which is what the baseline heading names. `Four Movements` describes a different subject.

## Evidence

The manuscript's own structure supports the narrower reading independently of this passage. `PART ONE` is titled `Seed, Sprout, Stem & Soil` and `PART TWO` opens on `The Flower`, so four movements naming Part One is already true of the book as built. The passage's silence about the soil is not a contradiction of that count; the passage simply stops giving reading times after the stem.

Reverting the heading is not free. `v01-a-note-on-compression` is already recorded as a predecessor of `v01-four-movements` in `publishing/continuity/section-lineage.json`, and two alias entries in `route-aliases.json` map the old href to the new one. Renaming back would make the retired id current again and put the lineage into a cycle, which is why the re-render left the heading in place rather than churning five continuity records on an editorial preference.

## Paydown criteria

Choose whether the heading names only Part One or the whole developmental sequence. Revise the heading or transition so the count and hierarchy agree, then verify the outline and historical alias for any renamed route.

Two options, with their costs:

- C1a. Restore `A Note on Compression`. Names the section's actual subject and needs no prose change. Costs a reversal in the section lineage, where the current id becomes a predecessor of the id it replaced, plus new aliases for the two existing mappings.
- C1b. Keep `Four Movements` and reword the transition so the passage names four. Costs no routes. Requires deciding that the heading scopes Part One, and adding the soil to a passage whose subject is reading time.

## History

- 2026-07-09: Raised as a nonblocking author question by the independent Volume I literary review.
- 2026-07-30: Sharpened by the baseline re-render. The five-item count the item described belonged to the wave-one pass, not the baseline, and the restored passage names three. Recorded the two options with their continuity costs. Still a query; no editorial pass may choose between them, because C1a and C1b give the heading different scopes and the scope is the author's decision.
