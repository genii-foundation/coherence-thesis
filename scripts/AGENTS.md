# Script Instructions

This file governs repository tooling under scripts/. Repository-wide policy remains in the root AGENTS.md.

## Organization

- Put editorial audit and ledger tools in scripts/editorial/.
- Put source import, compilation, continuity, and manuscript validation tools in scripts/manuscripts/.
- Put hosted audio tools in scripts/audio/.
- Put Updates generation and verification in scripts/updates/.
- Put repository boundary, metadata, and governance tools in scripts/repository/.
- Put local preview process tools in scripts/dev/.
- Keep validation orchestration in `scripts/repository/run-validation.mjs` and production preview process handling in `scripts/dev/production-preview.mjs`.
- Import canonical paths from scripts/repository/paths.ts. Do not scatter path literals through unrelated tools.

## Deterministic behavior

- Prefer deterministic input, output, ordering, and error messages.
- Fail closed on malformed source, ambiguous identity, missing history, stale hashes, incomplete coverage, or unsafe publication state.
- Keep read-only behavior as the default for audits, validators, branch inventories, and reconciliation previews.
- Require an explicit write mode or clearly named record command for durable changes.
- Never let build, preview, test, import, compile, or preparation commands modify editorial/ or publishing/.
- Write disposable reports only under generated/ or another ignored workspace location.
- Do not hide a failed invariant by normalizing or deleting the evidence.

## Historical integrity

- Resolve manuscript paths through volume.json and historicalSourcePaths.
- Preserve baseline paths and hashes in review evidence.
- Keep historical literary classification compatible with sources/manuscripts/ and content/manuscripts/ after the current layout becomes canonical.
- Test both current and historical path resolution whenever path logic changes.

## Safety

- Never print credentials, access tokens, service keys, or signed upload values.
- Make upload, deletion, branch deletion, remote mutation, and production publication explicit operations.
- Dry-run or validate external publication plans before writing remote state.
- Preserve immutable published objects and append-only ledgers.

## Quality

- Search for an existing helper before adding a new script or parser.
- Keep pure logic separate from command entry points.
- Add focused tests beside the owning script family.
- Verify every exported entry point has a real consumer.
- Run focused tests during iteration, then the full repository validation before commit.

## Licensing

Scripts, tests for scripts, and repository tooling use the software license in LICENSE.
