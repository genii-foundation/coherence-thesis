---
volumeId: "architecting-providence"
volumeTitle: "Architecting Providence"
volumeOrder: 4
partId: "the-technological-architecture-in-detail"
partTitle: "The Technological Architecture in Detail"
partOrder: 4
chapterId: "candidate-approaches-and-limits"
chapterTitle: "Candidate Approaches and Limits"
chapterOrder: 2
sectionId: "v04-candidate-approaches-and-limits"
title: "Candidate Approaches and Limits"
sectionOrder: 3
sourceDoc: "sources/manuscripts/coherence-thesis-vol4-architecting-providence.md"
sourceHash: "66f2cc7c3e340085f2b71a493c7771f241aba49c635cc262115e3dc9bff3351d"
sourceParagraphStart: 624
sourceParagraphEnd: 635
---

Three families of approach are relevant. Their present maturity and security need dated technical review.

Federated identity can let one service recognize identity established by another. It reduces repeated enrollment, but the originating operator may still suspend access or alter terms. Federation distributes operators. It does not guarantee participant control.

Decentralized identifiers and verifiable credentials can move more control toward participants, often through cryptographic keys. Recovery, usability, issuer dependence, device security, and intermediary power complicate the claim of self-sovereignty.

Zero-knowledge methods can prove some claims without disclosing all underlying data. They may reduce disclosure, but they do not resolve coercion, false issuance, compromised devices, or discriminatory use of the proof.

A first design may combine these approaches. It should state which guarantees are enforced, which depend on operators or vendors, and which remain aspirations. Recovery for lost devices, coercion, bystander privacy, accessibility, and safe use by nontechnical participants are part of the architecture, not later polish.
