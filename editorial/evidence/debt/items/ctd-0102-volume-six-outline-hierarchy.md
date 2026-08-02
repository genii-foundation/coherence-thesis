---
id: CTD-0102
title: Restore Volume VI's first authored part in the reader outline
status: resolved
kind: structural
severity: medium
scopes: ["volume-6", "reader", "corpus"]
sources: ["editorial/sources/volumes/volume-06/manuscript.md#the-whole-in-the-fewest-words", "scripts/manuscripts/import-markdown.ts", "src/lib/manuscript-labels.ts", "src/app/manuscripts/[volumeId]/page.tsx"]
discovered: 2026-07-11
updated: 2026-08-01
resolved: 2026-08-01
discoveredIn: browser-review/volume-6-outline-hierarchy
---

## Debt

Volume VI's source and reader disagree about the first authored part. The importer places the opening material under synthetic front matter, while the volume page counts only the later authored part and substitutes generic opening labels for the source's first part title.

## Evidence

The source begins its body with the part heading `The Whole, in the Fewest Words`, followed later by `Beginning Again`. At `/manuscripts/6/`, the reader reports `1 part` but renders two cards: `Opening / Opening` and `Part 2 / Beginning Again`. The authored title `The Whole, in the Fewest Words` is absent from the outline. Browser review confirmed that the revised volume title and subtitle render correctly, so this item concerns only source and import hierarchy.

## Paydown criteria

- C1. Import both authored part identities without converting the first into generic front matter.
- C2. Make the volume count, card kickers, card titles, breadcrumbs, and outline agree with the source hierarchy while preserving every published section destination through aliases where needed.
- C3. Cover the Volume VI hierarchy through importer, reader-data, and browser checks, while retaining browser and reader-data coverage for a representative volume that legitimately uses synthetic opening matter.

## History

- 2026-07-11: Recorded during browser review of the revised Volume VI root.
- 2026-08-01: The author approved the restructured Volume VI preview and instructed that pull request 176 be merged.
- 2026-08-01: Confirmed the merged repair and its production aliases, added direct reader-data and breadcrumb assertions, and resolved the ticket.

## Resolution

### Outcome

Volume VI now presents its source-defined hierarchy. `The Whole, in the Fewest Words` is Part 1, `Beginning Again` is Part 2, and no synthetic opening replaces either authored part.

### Criterion results

- C1: met. The Volume VI import begins at the manuscript's `PART ONE` marker and produces the two authored parts in source order.
- C2: met. The volume root reports two parts and labels both cards from the manuscript. The `On Nests` reader breadcrumb names `The Whole, in the Fewest Words`, and the continuity aliases preserve the former `/opening/` and `/front-matter/` destinations.
- C3: met. `scripts/manuscripts/import-markdown.test.ts` covers both authored Volume VI parts. `src/lib/manuscript-data.test.ts` covers the catalog identities and `On Nests` breadcrumb. `tests/e2e/navigation.spec.ts` covers the Volume VI root and breadcrumb, plus Volume I's legitimate synthetic opening. The reader-data test also retains synthetic opening and contents route coverage.

### Evidence

The repair merged in pull request 176 as commit `11494fe9ec1ceb6ffbfa0383c5ad5a806686eac9`, which is contained in current `main`. The authoritative source is `editorial/sources/volumes/volume-06/manuscript.md`; its import boundary is declared in `editorial/sources/volumes/volume-06/volume.json`. The resulting identities are exercised in `scripts/manuscripts/import-markdown.test.ts`, `src/lib/manuscript-data.test.ts`, and `tests/e2e/navigation.spec.ts`. Published route preservation is recorded in `publishing/continuity/route-aliases.json` and `publishing/continuity/route-ledger.json`.

Production verification on 2026-08-01 returned `200` for `/manuscripts/6/`. The prior `/manuscripts/6/opening/` route returned `307` to `/manuscripts/6/the-whole-in-the-fewest-words/`, and `/manuscripts/6/front-matter/on-nests/` returned `307` to `/manuscripts/6/the-whole-in-the-fewest-words/on-nests/`.

### Validation

Pull request 176 passed its static CI and end-to-end checks at the merged head. For the closure candidate, 28 focused importer and reader-data tests passed, all 112 debt items validated, and the two focused browser cases passed on desktop and mobile. `npm run validate:ui` passed with 764 unit tests and 220 browser tests; 40 browser cases were intentionally skipped by the existing project matrix. The gate reported one existing unused-import lint warning in `scripts/manuscripts/versions.test.ts` and one non-failing Turbopack trace warning for the admin debt source route.

### Approval

The author approved the exact local Volume VI restructuring preview and instructed its merge on 2026-08-01. The author explicitly instructed closure of CTD-0102 on 2026-08-01.

### Residual risk

No known Volume VI hierarchy or route-continuity risk remains. Synthetic opening behavior still exists where the source legitimately has no authored opening part, and that separate behavior remains covered.

### Related debt

No active debt item is required to complete this resolution.
