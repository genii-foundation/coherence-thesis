---
id: CTD-0055
title: Prove Providence's implementation and safeguard claims
status: open
kind: technical
severity: critical
scopes: ["volume-1", "volume-2", "volume-3", "volume-4", "site", "corpus"]
sources: ["editorial/sources/volumes/volume-01/manuscript.md", "editorial/sources/volumes/volume-02/manuscript.md", "editorial/sources/volumes/volume-03/manuscript.md", "editorial/sources/volumes/volume-04/manuscript.md", "src"]
discovered: 2026-07-09
updated: 2026-07-09
resolved:
discoveredIn: volume-1/slop-review
---

## Debt

The corpus describes Providence as already self-sovereign, device-local, free of central storage and authority, openly inspectable and forkable, unowned, revocable, non-harvesting, and resistant to capture. These are testable system properties, not safeguards that prose can instantiate.

## Evidence

Volume I states the properties as invariants. Volumes II through IV admit that much of the trust, identity, governance, and physiological architecture remains unbuilt or unresolved. The final reviews add claims about an MVP, matching, encryption, identity sovereignty, federated computation, open development, the six bright lines, sovereign compute, recovery, bystander rights, and capture resistance.

## Paydown criteria

For every safeguard, publish the protocol, data-flow model, operator and ownership map, policy, legal authority, technical control, accountable owner, test, remedy, and known override. Add sovereign-compute benchmarks and threat models covering supply-chain risk, coercion, recovery, revocation, device safety, bystanders, and users the tool cannot safely serve. State unimplemented properties as requirements rather than current facts. Keep the publication-dated status inventory and roadmap in CTD-0072.

## History

- 2026-07-09: Raised by the independent Volume I slop review and confirmed by the corpus promise scan.
- 2026-07-09: Expanded and raised to critical after the final Volume II and III reviews found that current-state and bright-line claims lack a control matrix and tested evidence.
