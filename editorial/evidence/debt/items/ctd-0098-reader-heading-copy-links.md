---
id: CTD-0098
title: Expose copyable anchors on reader headings
status: open
kind: link
severity: medium
scopes: ["reader", "corpus"]
sources: ["src/components/ChapterReader.tsx", "src/components/SectionReader.tsx", "tests/e2e/navigation.spec.ts"]
discovered: 2026-07-09
updated: 2026-07-11
resolved:
discoveredIn: volume-two-browser-review
---

## Debt

Reader section headings had stable fragment destinations but no visible permalink control. Readers could follow an existing anchor into a section, but they could not discover or copy that section's canonical link from the heading itself.

## Evidence

The Toward Humane Technology heading on the combined Architecture of Extraction reader page rendered inside the stable `v02-toward-humane-technology-2` section anchor. Hovering the heading exposed no link affordance, no copy action, and no confirmation after a link was copied elsewhere.

A corpus render audit found 551 section headings across three reader cases: 342 standalone section headings, 159 visible headings inside combined chapter readers, and 50 first sections represented by the combined reader's chapter heading.

## Paydown criteria

Expose a trailing link icon for every rendered section heading. Reveal it on pointer hover and keyboard focus, keep it visible with an adequate touch target on coarse pointers, and prevent it from breaking onto a line without the heading's final word. Label the control with a tooltip. Copy the absolute canonical URL with the stable section fragment. Announce success or failure with an accessible toast. Cover combined, standalone, and first-section heading routes in automated tests.

## Prior paydown

The shared reader heading component now adds a copy control to every primary reader heading without placing an interactive element inside the semantic heading. It uses the existing tooltip treatment, a shared clipboard helper, canonical `#sectionId` destinations, keyboard activation, a 44 pixel coarse-pointer target, and a polite fixed toast. The final word and icon use a nonbreaking gap. Browser coverage exercises the reported Volume II heading and both remaining heading render cases.

## History

- 2026-07-09: Recorded and resolved during Volume II browser review.
- 2026-07-11: Reopened because the implementation is still confined to draft PR 109 and is not present in this branch or main.
