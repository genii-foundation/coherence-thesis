---
name: coherence-build-feature
description: Build and revise Coherence Thesis reader features, fixes, tests, application tooling, and project documentation through a focused worktree, validation, a ready pull request, and a reviewable preview. Use for reader UI, navigation, progress, audio controls, overview presentation, generated catalog consumption, styling, accessibility, browser behavior, and application documentation. Stop before merge or production publication.
---

# Build Feature

Build one coherent reader or application change through a ready pull request and preview. Leave production merge and publication to coherence-ship-site.

## Establish scope

1. Read the root AGENTS.md and the nearest nested AGENTS.md for every touched area.
2. Confirm the requested behavior, affected surface, and acceptance criteria before editing.
3. Inspect repository status and preserve unrelated work.
4. Refresh origin/main and create an isolated worktree from that exact revision unless the user explicitly authorizes direct main work.
5. Search for an existing component, hook, helper, script, fixture, or test pattern before adding one.

## Respect repository boundaries

- Canonical manuscript packages live under editorial/sources/volumes/.
- Tracked publication state lives under publishing/.
- Generated reader sections, catalogs, reports, browser payloads, and PDFs are untracked.
- Application work must not hand edit editorial source or publishing state.
- If the requested change includes manuscript prose or volume metadata, use coherence-editorial-review and coherence-manuscript-publish for those parts.
- If a build reveals required continuity, audio, or Updates state, report it. Do not manufacture a durable write from a build command.

## Implement

1. Capture the user problem, existing patterns reused, and material tradeoffs.
2. Implement the smallest complete slice.
3. Keep manuscript text readable without JavaScript.
4. Keep local reading private by default.
5. Keep controls and overlays reachable on supported desktop and mobile viewports.
6. Match established typography, spacing, color, focus, and control patterns.
7. Verify every exported entry point has a real consumer.
8. Add focused unit or browser coverage for changed behavior.

## Validate

Use focused checks during iteration:

    npm run test
    npm run test:e2e:fast:desktop
    npm run test:e2e:fast

Run the full repository gate before commit:

    npm run validate

Run the combined static and browser gate when browser behavior can change. It builds once and reuses that production build:

    npm run validate:ui

Refresh the checked Updates snapshot through the current pull request base with the repository command before the final commit.

## Preview and pull request

1. Start a fresh local preview from the feature worktree on an unused port.
2. Verify the visible result on the actual route and supported viewport classes.
3. Review the complete diff. Confirm generated output remains untracked and durable publishing state changed only through an explicit reviewed workflow.
4. Commit the complete change with a focused Conventional Commit title.
5. Push the branch and open or update a focused pull request.
6. Open a complete and validated pull request in the ready state. Use draft status only for incomplete work or a concrete blocker.
7. Share the exact preview URL and name any remaining review or merge gate.
8. Wait for explicit preview approval before any merge or production publication.

Do not merge from this skill. After approval, use coherence-ship-site.
