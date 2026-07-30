---
id: CTD-0101
title: Keep visible subsection ordinals contiguous after hidden openers
status: open
kind: technical
severity: medium
scopes: ["volume-3", "reader", "corpus"]
sources: ["editorial/sources/volumes/volume-03/manuscript.md#continuity", "src/app/manuscripts/[volumeId]/[...route]/page.tsx", "scripts/manuscripts/import-markdown.ts"]
discovered: 2026-07-11
updated: 2026-07-11
resolved:
discoveredIn: browser-review/volume-3-opening-ordinals
---

## Debt

Visible chapter and section cards inherit canonical source order even when an organizational opener is hidden from the card list. The resulting numbers imply that the reader has missed content.

## Evidence

At `/manuscripts/3/opening/`, the organizational `Continuity` opener consumes the first chapter position but does not render as a card. The two visible cards, `The Next Nest` and `On the Title: Providence, and Imperative`, therefore display 02 and 03. Other part pages begin their visible sequence at 01. The part page currently prints `chapter.order` or `section.sectionOrder` instead of the item's position within the rendered list.

## Paydown criteria

Number every visible card by its position in the rendered sequence, beginning at 01, without changing canonical source order, stable identities, routes, or navigation order. Apply the rule consistently to chapter and section card lists. Add browser coverage for the Volume III opening and for a normal part whose visible and canonical orders already agree.

## History

- 2026-07-11: Recorded during browser review of the revised Volume III opening.
