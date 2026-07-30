---
id: CTD-0109
title: Ratify or unwind R-LEDGER-WINS
status: query
kind: canon
severity: high
scopes: ["volume-1", "corpus"]
sources: ["editorial/method/standard.md", "editorial/evidence/calibration/volume-01/v01-the-currency-of-presence.json", "editorial/evidence/audits/2026-07-30-volume-one-re-render-ledger.md"]
discovered: 2026-07-30
updated: 2026-07-30
resolved:
discoveredIn: volume-1/2026-07-30-baseline-re-render
---

## Debt

`R-LEDGER-WINS` says a recorded canon decision outranks an older prose baseline. The rule was derived after the Currency of Presence re-render restored a terminology conflation that CTD-0012 had already corrected.

The provenance principle is sound: old prose cannot silently reverse a later decision. The authority record is not. The ruling in `v01-the-currency-of-presence` is attributed to `editorial-agent`, not the author. The standard presents the result as a corpus rule, and thirteen Volume I calibration records now cite or invoke it.

An agent may identify a provenance safeguard. It may not convert its own judgment into binding corpus authority and then cite that authority as the warrant for later edits.

## Evidence

- `editorial/evidence/calibration/volume-01/v01-the-currency-of-presence.json` records the ruling with `by` set to `editorial-agent`.
- `editorial/method/standard.md` lists `R-LEDGER-WINS` among the named rules.
- Thirteen Volume I calibration records currently contain the identifier.
- CTD-0108 confirmed that the rule prevented one real regression and found no additional silent reversal.

## Paydown criteria

The author must choose one route:

- C1a. Ratify the rule as a corpus obligation. Record an author ruling with scope, occasion, and the exact boundary between a settled decision and unresolved debt.
- C1b. Decline the rule as written. Remove it from the standard and re-review every dependent calibration record using a replacement provenance rule the author approves.

In either route, keep the CTD-0012 correction. Declining this rule does not authorize restoring the Bio-Consensus conflation.

## History

- 2026-07-30: Opened after the continuity audit found a corpus rule with no author ruling and a growing chain of dependent records.
