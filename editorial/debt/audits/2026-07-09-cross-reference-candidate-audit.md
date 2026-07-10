# Cross-Reference Candidate Audit

Date: 2026-07-09

Status: Advisory audit for a future semantic-linking pass. This report does not authorize blind replacement.

## Prompting example

Volume I's `Four Movements` section names the Seed, Sprout, Stem, Soil, and Flower as structural destinations. Those references should help readers reach the corresponding sections.

Recommended current targets:

- Seed: `/manuscripts/1/seed-sprout-stem-and-soil/the-seed/`
- Sprout: `/manuscripts/1/seed-sprout-stem-and-soil/the-sprout/`
- Stem: `/manuscripts/1/seed-sprout-stem-and-soil/the-stem/`
- Soil: `/manuscripts/1/seed-sprout-stem-and-soil/the-soil/`
- Flower: `/manuscripts/1/the-flower/chapter-start/`

## Corpus sample

A corpus scan found 134 matching Seed, Sprout, Stem, Soil, or Flower tokens:

- 42 clear references to named parts of the work
- 7 ambiguous references that require editorial judgment
- 74 ordinary uses of the words
- 11 structural labels

The distribution rules out blind token replacement. A useful system must understand section lineage, exclude headings and existing links, distinguish a named destination from ordinary language, and leave ambiguous cases for review.

## Recommended implementation

1. Maintain reviewed concept-to-section mappings by stable section identity, not literal route alone.
2. Detect high-confidence references in source Markdown, including emphasized canonical terms and exact section titles.
3. Produce an advisory candidate report with surrounding context and confidence.
4. Convert only reviewed candidates to Markdown links.
5. Resolve the current destination through section lineage so heading evolution does not break the reference.
6. Validate every target during manuscript compilation and fail if an approved reference becomes unresolved.

## Disposition

The explicit Volume VI reading path is addressed in its production pass. Corpus-wide automatic semantic linking remains separate work under CTD-0100.
