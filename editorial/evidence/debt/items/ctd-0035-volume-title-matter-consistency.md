---
id: CTD-0035
title: Reconcile duplicate and inconsistent volume title matter
status: open
kind: structural
severity: medium
scopes: ["volume-2", "volume-5", "volume-6", "volume-7", "volume-8", "volume-9", "master-ledger", "corpus"]
sources: ["editorial/sources/volumes/volume-02/manuscript.md", "editorial/sources/volumes/volume-05/manuscript.md", "editorial/sources/volumes/volume-06/manuscript.md", "editorial/sources/volumes/volume-07/manuscript.md", "editorial/sources/volumes/volume-08/manuscript.md", "editorial/sources/volumes/volume-09/manuscript.md", "editorial/sources/corpus/master-ledger.md", "editorial/sources/volumes/volume-02/volume.json", "editorial/sources/volumes/volume-05/volume.json", "editorial/sources/volumes/volume-06/volume.json", "editorial/sources/volumes/volume-07/volume.json", "editorial/sources/volumes/volume-08/volume.json", "editorial/sources/volumes/volume-09/volume.json"]
discovered: 2026-07-09
updated: 2026-08-01
resolved:
discoveredIn: corpus-identity-audit
---

## Debt

Several volume title pages contain duplicate display lines, drafting labels, inconsistent title and subtitle boundaries, or punctuation that disagrees with the series metadata and master ledger.

## Evidence

Volume II repeats both the series title and volume number before its actual title. Its title syntax can mean centering oneself within humane technology, centering intelligence within it, or making humane technology central. Volumes V and VI begin with a standalone title before repeating it inside the series title page. Volume VII distributes its title and subtitle differently from metadata and includes `B.O.W :` with malformed spacing. Volume VIII uses a middle dot in source and a comma in metadata. Volume IX retains `(v.2)`, has two subtitle-like lines that metadata represents differently, and uses conceptual recap labels as if they were published titles. Volume IV calls the works Books where the series uses Volumes.

## Paydown criteria

Approve one title, subtitle, series label, volume label, byline, optional planetary line, and canonical short title for every volume. State the intended grammar of Volume II's title. Remove drafting artifacts and accidental duplication, then align source title matter, series metadata, master ledger, generated catalog, covers, recap references, and historical identity handling.

## History

- 2026-07-09: Recorded during the first corpus-wide title and identity scan.
- 2026-07-09: Expanded after the final Volume II literary review and nine-volume audit found title grammar, Book versus Volume usage, and surrogate recap titles.
- 2026-08-01: The author ruled on the Volume I, VI, and VIII title matter after noticing the reader's subtitles did not match the book. Volume I's subtitle was a drift and is restored to the originally published "The Obvious Substrate for the Existential Necessity of a Post-Extractive Civilization"; the condensing pass had replaced it, and Volume I was the one lane that ran before the pre-import title block became part of the check. Volume VI is restored to the original "THE SMALLEST NEST" with the subtitle "Suited for Containing a Dragon Named Earth", which the volumeId smallest-nest had preserved all along. Volume VIII keeps its title and takes a new author-chosen subtitle, "The Birds & Bees of a Misanthropic Artifice", which is an authorial change rather than a restoration: no version in the repository ever carried it, and the phrase had lived only as a chapter title. The ampersand stands as the author wrote it, per the standard's bar on expanding ampersands in titles.
