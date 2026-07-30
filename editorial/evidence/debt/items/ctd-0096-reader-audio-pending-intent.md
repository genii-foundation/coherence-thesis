---
id: CTD-0096
title: Make pending reader audio intent route safe
status: open
kind: technical
severity: medium
scopes: ["corpus", "reader"]
sources: ["src/components/AudioPlayerIsland.tsx", "tests/e2e/progress.spec.ts"]
discovered: 2026-07-09
updated: 2026-07-09
resolved:
discoveredIn: first-editorial-wave-browser-validation
---

## Debt

The reader stores an early Listen request as a boolean until section data loads. The pending intent is not bound to the route where the reader clicked. A separate handled-request key can also outlive the consumed `listen=1` query.

## Evidence

The full browser gate exposed a deterministic race when the voice-menu test clicked before the progress-section queue was ready. A proposed inline fix was rejected during independent review because it could lose a request, retain it forever in an unsupported browser, or play after the reader had navigated elsewhere. Review of the existing fallback path found two narrower risks: pending intent can cross a route change, and a repeated fallback request for the same section can be ignored after the first query is consumed.

The editorial pull request now exposes current audio readiness to the browser test and uses the queue from the current render for ready clicks. It leaves the older pending-fallback behavior unchanged and records that behavior here for a focused pass.

## Paydown criteria

Represent pending playback as an intent tied to its origin route and request generation. Cancel it on unrelated navigation or unmount. Define terminal behavior for unsupported playback. Clear or expire handled fallback keys after query consumption. Add focused tests for delayed section data, navigation during the delay, unsupported playback, and a repeated request for the same fallback section.

## History

- 2026-07-09: Recorded after the full first-wave browser gate and an independent review of the rejected inline audio fix.
