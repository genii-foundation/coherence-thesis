---
id: CTD-0099
title: Keep short opening paragraphs clear of their drop caps
status: open
kind: technical
severity: medium
scopes: ["reader", "corpus"]
sources: ["src/app/globals.css", "tests/e2e/navigation.spec.ts"]
discovered: 2026-07-09
updated: 2026-07-11
resolved:
discoveredIn: volume-one-browser-review
---

## Debt

The reader floated the first letter of each eligible opening paragraph without making the paragraph contain that float. When an opening paragraph occupied only one line, its drop cap extended into the following paragraph's vertical space.

## Evidence

The opening sentence of The Work Behind the Book is one line at the desktop reading width. Its drop cap extended below the paragraph box, while the next paragraph began before the visible letter had cleared. The collision made the second paragraph look attached to the initial instead of separated from the opening sentence.

## Paydown criteria

Preserve the large first letter and keep it attached to its word. Make a short opening paragraph contain the floated initial, reserve deliberate space only where a drop cap is active, and leave later composite sections without drop caps at their natural height. Cover the reported short opener and a later section in automated desktop and mobile browser tests.

## Prior paydown

The first top-level manuscript paragraph now establishes a flow root. Eligible standalone and first chapter openings reserve the full drop-cap size, which creates breathing room beneath a one-line opening without inserting manuscript line breaks. The reserved height is scoped away from later chapter sections where drop caps are disabled. Browser coverage verifies the visible clearance, paragraph margin, float treatment, and later-section height.

## History

- 2026-07-09: Recorded and resolved during Volume I browser review.
- 2026-07-11: Reopened because the implementation is still confined to draft PR 108 and is not present in this branch or main.
