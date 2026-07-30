---
id: CTD-0108
title: Audit the completed Volume I re-render against the debt and master ledgers
status: open
kind: technical
severity: high
scopes: ["volume-1", "corpus"]
sources: ["editorial/sources/volumes/volume-01/manuscript.md", "editorial/evidence/calibration/volume-01", "editorial/evidence/debt/index.md", "editorial/sources/corpus/master-ledger.md"]
discovered: 2026-07-30
updated: 2026-07-30
resolved:
discoveredIn: volume-1/2026-07-30-baseline-re-render
---

## Debt

The Volume I baseline re-render derived each section from the immutable wave-one baseline, the editorial standard, and the volume voice card. It did not consult the debt ledger or the master ledger as a matter of method.

That is a gap, and it produced at least one real failure. In `v01-the-currency-of-presence`, the baseline equates Bio-Consensus with the Currency of Presence. CTD-0012 records that equation as a defect corrected in Volume I on 2026-07-09 and checked against the master ledger. The re-render restored the baseline formulation, which would have silently reopened a high-severity terminology item. It was caught before commit only because an unrelated validation failure surfaced the ledger.

Sixteen sections were re-rendered before `R-LEDGER-WINS` was written. Three debt items were reasoned about explicitly along the way, CTD-0001, CTD-0004, and CTD-0013. The remaining Volume I items were not searched, so any restoration that touched a canonical term, a claim's scope, a proper name, a number, or a tracked promise may have reverted a recorded decision.

No validation gate detects this class of regression. The manuscripts validate, the links resolve, and the prose reads correctly. Only a reader holding the ledger can see it.

## Evidence

- `editorial/method/standard.md`, section 2, `R-LEDGER-WINS`, written 2026-07-30 in response to this failure.
- `editorial/evidence/calibration/volume-01/v01-the-currency-of-presence.json`, finding F1 and `debtImpact`.
- CTD-0012, partial paydown: "Volumes I and II now identify COHERENCE as the currency unit and Bio-Consensus as the primary biometric path by which it is intended to be minted."
- Master ledger section 7, Decision A: the unit name COHERENCE is to be introduced at the currency's first full treatment in Volume III, keeping the Currency of Presence as the descriptor.
- Volume I scoped items not searched during the re-render include CTD-0003, CTD-0005, CTD-0015, CTD-0016, CTD-0051, CTD-0052, and CTD-0053.

## Paydown criteria

- C1. Every Volume I scoped item in the debt index is read, and each is checked against the re-rendered manuscript for a restoration that reverts its recorded decision.
- C2. Every canonical term named in the master ledger is searched across the re-rendered Volume I and its usage checked against the ledger's definition and its stated volume of introduction.
- C3. Each Volume I calibration record carries a `debtImpact` entry for every item its section touches, or a recorded statement that the section touches none.
- C4. Any regression found is repaired, and the affected calibration record is amended with a dated note rather than rewritten.

## History

- 2026-07-30: Recorded after the Currency of Presence re-render restored a baseline conflation that CTD-0012 had already corrected. The audit covers the sections re-rendered before `R-LEDGER-WINS` existed.
- 2026-07-30: Completed the substantive audit on `edit/nine-volume-revisions` after reading every Volume I scoped debt item, checking every master-ledger term across the current manuscript, recording the sixteen early section impacts, and attaching a debt audit statement to all twenty-eight Volume I calibration records. No additional silent regression was found. The existing COHERENCE introduction conflict remains an explicit author question rather than an audit repair. Keep this item open until the audit record and calibration amendments merge and validate on `main`.
