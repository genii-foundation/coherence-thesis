---
id: CTD-0104
title: Make strict editorial punctuation a default validation gate
status: deferred
kind: technical
severity: high
scopes: ["site", "corpus"]
sources: ["package.json", ".agents/skills/coherence-editorial-review/references/editorial-standards.md", "docs/manuscript-editorial-plan.md"]
discovered: 2026-07-11
updated: 2026-07-11
resolved:
discoveredIn: editorial-plan/global-hard-failure
---

## Debt

The repository has a strict prohibited-punctuation audit, but the default validation and CI gates do not run it. A future edit can therefore reintroduce forbidden punctuation without blocking publication.

## Evidence

PR 113 deliberately adds `npm run manuscripts:editorial:strict` as an opt-in command because the revised source in PR 112 is on a separate stack. Enabling the command in default validation before those branches share a merged base would fail against the old corpus and misrepresent the publication state. The author explicitly requested a global hard failure after the comprehensive manuscript pass is complete.

## Paydown criteria

After the manuscript revision and editorial tooling have merged, run the strict audit against the merged canonical source and confirm zero prohibited punctuation. Add the strict command to the default validation path and CI, cover a prohibited-mark failure with a focused test, document the hard gate, and confirm that the complete validation suite passes from the merged base.

## History

- 2026-07-11: Recorded as deferred until the revised source and strict tooling share one merged base.
