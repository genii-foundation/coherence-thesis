# ADR 0001: Editorial Source Layout

## Status

Accepted on 2026-07-13.

## Context

The repository previously separated canonical manuscripts from their voice cards. Manuscripts lived under sources/manuscripts/, voice cards lived under editorial/, durable route state lived under content/series/, and checked publication snapshots lived beside generated application files.

That arrangement obscured editorial ownership. It also made tracked publishing facts resemble disposable build output, hid the relationship between a volume and its editorial authority, and encouraged path literals across tools.

The repository needs one obvious home for author-controlled source, one obvious home for reviewed publication state, and one untracked home for generated material.

## Decision

### Editorial source packages

Each volume is a self-contained editorial package:

    editorial/sources/volumes/volume-01/
      manuscript.md
      voice-card.md
      volume.json

The pattern continues through volume-09.

- manuscript.md is canonical prose.
- voice-card.md records the volume's editorial authority.
- volume.json records stable identity, display metadata, canonical paths, import configuration, and historical source paths.

Corpus-wide source lives at editorial/sources/corpus/. Curated overview source lives at editorial/sources/overview/.

### Editorial evidence

Volume review evidence lives at:

    editorial/reviews/volumes/volume-01/<batch-id>/
      review.json

Corpus-wide reconciliation lives at editorial/reviews/corpus/.

Each durable batch has review.json. It records:

- Stable volume and batch identity.
- Baseline commit, source path, and source hash.
- Current canonical source path and current hash when the batch is reconciled.
- Exact scope.
- Every durable evidence file.
- Validation state.
- Open queries and residual risk.
- Author approval and publication state.
- Whether the batch is current, historical, or superseded.

review.json is the inventory. Directory contents are not an implicit manifest. A durable evidence file must be listed. Historical evidence retains its baseline path and hash.

### Publishing state

Reviewed publication facts live under:

    publishing/
      continuity/
      audio/
      updates/

Continuity stores identities, lineage, routes, aliases, and provenance. Audio stores the immutable hosted-audio manifest. Updates stores the checked repository-history snapshot.

These files are tracked because source text alone cannot reconstruct reviewed route decisions, external publication, or a verified history fallback.

### Generated output

Generated reader sections, catalogs, reports, browser payloads, search data, breadcrumbs, and PDFs are untracked. They are recreated under `generated/`, `public/data/`, and `public/downloads/`.

No generated artifact may become canonical by accident. Build, preview, test, import, compile, and preparation commands must not alter editorial/ or publishing/.

### Central path authority

Repository tools import path constants and historical resolvers from scripts/repository/paths.ts. New tools do not repeat canonical path strings.

## Historical source integrity

Every volume.json keeps all earlier manuscript locations in historicalSourcePaths.

Review ledgers and provenance records identify the path that existed at their baseline commit. That path remains unchanged. Validators resolve a baseline or current source through the volume manifest instead of rewriting evidence.

Literary Updates classification recognizes both:

- Current editorial source paths under editorial/sources/volumes/.
- Historical manuscript paths under sources/manuscripts/ and content/manuscripts/.

The migration preserves Git history. It does not rewrite commits or pretend the new layout existed in older revisions.

## Durable write policy

Audits and validators are read-only by default. Tools may write disposable proposals under generated reports.

A durable write requires:

1. An explicit record, publish, generate, or write action.
2. Complete required source history and identity.
3. Human review of the proposed diff.
4. Applicable validation.
5. An intentional commit.

Missing history, ambiguous lineage, stale hashes, incomplete review coverage, or unavailable publication evidence causes a closed failure. The tool does not invent a repair.

## Validation routing

- Manuscript prose changes require import, preparation, manuscript validation, editorial checks, and the full repository gate.
- Heading or structural changes require link preservation and reviewed route recording.
- Review evidence changes require review manifest, ledger, debt, and editorial validation as applicable.
- Publishing continuity changes require manuscript and historical-link validation.
- Audio changes require read-only manifest validation before upload.
- Updates changes require generation through the current base and exact head verification.
- Application behavior changes require the relevant unit and browser tests.
- Agent instruction and skill changes require the repository agent validator.

## Licensing

The repository remains mixed-license.

- Editorial sources, voice cards, review evidence, debt, standards, schemas, templates, overview material, continuity state, published audio state, and owned art follow the content license.
- Application code, scripts, tests, agent instructions, workflows, database migrations, and the Updates history snapshot follow the software license.
- Fonts and other third-party assets retain their original licenses.

NOTICE is the authoritative path map.

## Consequences

- A manuscript and its voice card are adjacent and share stable volume identity.
- Human editors can find the complete editorial record without entering application or agent directories.
- Tracked publishing facts no longer look like generated output.
- Generated directories can be ignored and recreated safely.
- Path migration requires compatibility logic for historical commits and review baselines.
- Tools and documentation must use the central path authority.
- CODEOWNERS and nested AGENTS.md files can express real domain boundaries without repeating root policy.
