---
id: CTD-0097
title: Keep Next navigation continuous across manuscript boundaries
status: open
kind: link
severity: medium
scopes: ["volume-2", "reader", "corpus"]
sources: ["src/lib/manuscript-data.ts", "src/lib/manuscript-data.test.ts", "tests/e2e/navigation.spec.ts"]
discovered: 2026-07-09
updated: 2026-07-11
resolved:
discoveredIn: volume-two-browser-review
---

## Debt

Multi-section chapter footers derived their Previous and Next links from the chapters inside the current part. The final chapter of every part therefore lost its Next link even when the canonical reading sequence continued into another part or volume.

## Evidence

The reader page for The Architecture of Extraction ended with Toward Humane Technology. Its footer showed Previous and Up, but no Next link to Coherence as Infrastructure, the first section of The Response. The generated manuscript catalog already recorded that section as the next item. The reader navigation helper ignored that global sequence and stopped at the end of The Diagnosis.

A corpus audit found 46 chapter helpers with the same latent boundary gap. Route precedence hid most of them behind singleton section readers or organizational part pages, but six multi-section chapter readers exposed the missing Next link to readers. The affected transitions appeared in Volumes II, III, IV, and VIII.

## Paydown criteria

When a chapter has no sibling after it in the current part, derive its Next link from the last section's position in the canonical reading sequence. Link directly to the adjacent section's canonical reader destination. Verify every part and volume boundary in an automated data test. Cover the reported Volume II transition in a browser test that follows the link and confirms the destination.

## Prior paydown

Chapter footer navigation now consults the global section sequence when its current part has no next chapter. It continues through part and volume boundaries and lands on the first canonical reader section that follows. Existing chapter navigation within a part remains unchanged. Data coverage checks every generated boundary, and browser coverage exercises the reported transition from The Diagnosis into The Response.

## History

- 2026-07-09: Recorded and resolved during Volume II browser review.
- 2026-07-11: Reopened because the implementation is still confined to draft PR 106 and is not present in this branch or main.
