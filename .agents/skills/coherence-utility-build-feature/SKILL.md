---
name: coherence-utility-build-feature
description: Build and revise Coherence Thesis reader features, fixes, tests, application tooling, and project documentation through an attributable worktree, an early reviewable preview, proportionate validation, and a correctly staged pull request. Use for reader UI, navigation, progress, audio controls, overview presentation, generated catalog consumption, styling, accessibility, browser behavior, and application documentation. Stop before merge or production publication.
---

# Build Feature

Build one attributable reader or application change from current `origin/main`. Keep the change connected to the user contract, runnable preview, exact source revision, validation evidence, and pull request.

## Establish the contract

1. Read the root instructions and the nearest nested instructions for every touched area.
2. Confirm the requested outcome, affected route, supported viewport classes, and observable acceptance criteria.
3. Record the authority granted for implementation, preview, pull request publication, merge, and production publication separately. One does not authorize another.
4. Inspect repository status, refresh `origin/main`, record the base SHA, and create one focused worktree from that revision.
5. Search for an existing component, hook, helper, script, fixture, issue, or test pattern before adding another.
6. Route manuscript prose, volume metadata, publication continuity, and production release work to the repository skill that owns that state.

Treat stale previews, mixed revisions, broken sources, and incomplete browser evidence as inconclusive. Do not convert missing evidence into a passing result.

## Build the runnable slice

1. Implement the smallest complete behavior that a reader can exercise.
2. Follow the application contract in `src/AGENTS.md`, including server-readable prose, local-first privacy, viewport reachability, and established interface patterns.
3. Verify every new or changed export has a real consumer.
4. Add focused coverage for the changed behavior, but do not run a test suite before handing the preview to the user.
5. As soon as the slice runs, follow the root local preview review gate on an unused port with `npm run preview:dev -- --port <port>`.
6. Verify the preview status, open the affected route, and immediately give the user the working URL. If a preview cannot launch, report the concrete blocker instead of substituting a test suite.
7. Preserve the preview until the user finishes reviewing it. Apply feedback locally and show each revised candidate before pushing it.

Compilation or preparation required to launch the preview is allowed. Before the URL is delivered, do not run Vitest collections, Playwright specs, `npm run validate`, `npm run validate:ui`, or another command whose purpose is testing the change.

## Validate after preview handoff

1. After the working preview URL has been delivered, run the narrowest focused checks that cover the changed contract.
2. Test failure and recovery behavior when the feature has meaningful failure semantics.
3. Run `npm run validate` at the publish checkpoint.
4. Run `npm run validate:ui` when browser behavior can change.
5. Refresh the pull request base before final validation. If the candidate revision changes, record the new SHA and reconfirm that the preview serves that candidate.
6. Record the candidate SHA, exact commands, results, skipped coverage, and any inconclusive evidence.
7. Refresh the checked Updates snapshot through the repository command before the final commit when it advances.

## Publish and close out

1. Review the complete diff. Confirm generated output remains untracked and durable editorial or publishing state changed only through its explicit workflow.
2. Commit one coherent change with a focused Conventional Commit title. Reconfirm that the preview serves this exact commit and give the user the direct URL.
3. Push and open or update a pull request only after the user approves that exact local preview or explicitly waives the root preview gate, and only when the user authorized the external action.
4. Open a complete and validated pull request in ready state. Use draft state only for incomplete work or a concrete missing gate.
5. Confirm the pull request targets `main`, required checks correspond to the exact head SHA, and its state matches the granted authority.
6. Report the preview URL, candidate SHA, validation evidence, and exact remaining review, merge, or publication gate.
7. Keep the preview running until review is complete. Stop only this worktree's preview when the pull request merges, the worktree is removed, or the task is archived.

Do not merge or publish production from this skill. After explicit preview approval and merge authority, use `coherence-utility-ship-site`.
