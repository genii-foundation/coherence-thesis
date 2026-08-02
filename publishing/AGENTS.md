# Publishing Instructions

This file governs tracked publication state and publishing guides under publishing/. Repository-wide policy remains in the root AGENTS.md.

## Directory contract

- publishing/continuity/ stores reviewed section identity, lineage, route, alias, and version provenance.
- publishing/audio/manifest.json records externally published immutable audio.
- publishing/updates/snapshot.json is the checked fallback for public repository history.
- publishing/guides/ documents reviewed publication workflows.
- Generated reader sections, catalogs, reports, browser payloads, and PDFs are untracked. Recreate them from editorial sources and tracked publishing state.

## Durable writes

- Treat every file in publishing/ as durable state.
- Build, preview, test, import, compile, and preparation commands must not update this directory.
- Default audit and validation commands to read-only behavior.
- Require an explicit record, publish, or generate command before writing durable state.
- Review the complete diff before committing a durable write. Reject unexplained churn, reordered records, dropped history, and inferred decisions without evidence.
- Fail closed when required history, source identity, credentials, or external publication evidence is unavailable.
- Preserve an author approved manuscript candidate outside the published
  checkpoint chain until the exact bytes are verified in production.
- Promote a manuscript checkpoint only through the explicit stage and publish
  commands. Wording approval, publication approval, and verified production are
  three separate facts.

## Continuity

- Preserve stable section identities and every reviewed public route.
- Record renames, moves, splits, merges, and removals through explicit lineage and alias decisions.
- Use each volume.json historicalSourcePaths list to resolve source locations across commits.
- Preserve historical baseline paths inside review ledgers and provenance records.
- Keep literary update classification aware of both the current editorial source path and historical manuscript source paths.
- Never rewrite Git history or erase old paths merely to simplify current tooling.

## Audio

- Publish audio under a new immutable version path.
- Never overwrite an existing published object in place.
- Validate every section and audioVersionId before any upload.
- Keep credentials in the environment. Never commit or print them.
- Treat a changed spoken title or body as an audio invalidation event.
- Before changed manuscript copy merges or deploys, run
  `npm run audio:verify-manuscript-publication -- --base <base-sha>`. Publish
  new immutable audio and timing sidecars for every section it reports, promote
  the reviewed checkpoint into the public manifest, and rerun the gate.
- Never waive audio parity by removing manifest entries, hiding playback, or
  recording the mismatch as deferred work.

## Updates

- Generate the checked snapshot from complete history through the required revision.
- Preserve exact commit identity and immutable statistics.
- A missing optional historical deployment link is allowed. A missing commit is not.
- Production must fail rather than publish a stale Updates page.

## Validation routing

- Continuity changes require manuscript validation, historical link validation when applicable, and the full repository gate.
- Audio manifest changes require a read-only manifest validation before upload and the full repository gate afterward.
- Manuscript changes require the audio publication gate against the exact fresh
  pull request or release base before merge and again after any base refresh.
- Updates snapshot changes require generation through the current base and exact head verification.
- After production publication, verify the live Updates page contains the deployed revision.

## Licensing

This directory has mixed licensing. Continuity and audio publication state follow the creative work they describe. The Updates snapshot follows repository and software history. Use NOTICE as the authoritative path map and preserve license notices when moving material.
